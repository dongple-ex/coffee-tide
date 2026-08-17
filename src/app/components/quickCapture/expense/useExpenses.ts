import { useCallback, useEffect, useRef, useState } from "react";
import type { ExpenseFilters, ExpenseListRecord } from "./expenseTypes";
import type { ExpenseAnalysisResponse } from "@/lib/expenses/analysis";
import type { UpdateExpenseInput } from "@/lib/expenses/service";
import type { ContentAsset } from "@/lib/data/contracts";

export function useExpenses(initialFilters?: ExpenseFilters) {
  const [records, setRecords] = useState<ExpenseListRecord[]>([]);
  const [analysis, setAnalysis] = useState<ExpenseAnalysisResponse | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<ExpenseFilters>(initialFilters || {});

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchExpensesAndAnalysis = useCallback(
    async (currentFilters: ExpenseFilters, isAppend = false, cursorParam?: string) => {
      if (!isAppend) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(undefined);

      const signal = abortControllerRef.current?.signal;

      try {
        const queryParams = new URLSearchParams();
        if (currentFilters.from) queryParams.set("from", currentFilters.from);
        if (currentFilters.to) queryParams.set("to", currentFilters.to);
        if (currentFilters.category && currentFilters.category !== "전체") {
          queryParams.set("category", currentFilters.category);
        }
        if (currentFilters.currency && currentFilters.currency !== "전체") {
          queryParams.set("currency", currentFilters.currency);
        }
        if (cursorParam) {
          queryParams.set("cursor", cursorParam);
        }

        const expenseUrl = `/api/expenses?${queryParams.toString()}`;
        const summaryUrl = `/api/expenses/summary?${queryParams.toString()}`;

        if (!isAppend) {
          const [expRes, sumRes] = await Promise.all([
            fetch(expenseUrl, { signal }),
            fetch(summaryUrl, { signal }),
          ]);

          if (expRes.status === 401) {
            setError("로그인이 필요합니다.");
            return;
          }

          if (!expRes.ok) {
            const errData = await expRes.json().catch(() => ({}));
            throw new Error(errData.error || "비용 목록을 불러오지 못했습니다.");
          }

          const expData = await expRes.json();
          setRecords(expData.expenses || []);
          setNextCursor(expData.nextCursor);

          if (sumRes.ok) {
            const sumData = await sumRes.json();
            setAnalysis(sumData.analysis);
          }
        } else {
          // 추가 페이지 로드
          const expRes = await fetch(expenseUrl, { signal });
          if (!expRes.ok) throw new Error("추가 비용을 불러오지 못했습니다.");
          const expData = await expRes.json();
          setRecords((prev) => [...prev, ...(expData.expenses || [])]);
          setNextCursor(expData.nextCursor);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "데이터를 불러오는 중 오류가 발생했습니다.";
        setError(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    let isCancelled = false;

    const runFetch = async () => {
      if (!isCancelled) {
        await fetchExpensesAndAnalysis(filters);
      }
    };

    void runFetch();

    return () => {
      isCancelled = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [filters, fetchExpensesAndAnalysis]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore || loading) return;
    fetchExpensesAndAnalysis(filters, true, nextCursor);
  }, [nextCursor, loadingMore, loading, filters, fetchExpensesAndAnalysis]);

  const refresh = useCallback(() => {
    return fetchExpensesAndAnalysis(filters);
  }, [filters, fetchExpensesAndAnalysis]);

  const updateExpense = useCallback(
    async (id: string, patch: UpdateExpenseInput) => {
      setMutatingId(id);
      setError(undefined);
      try {
        const res = await fetch(`/api/expenses/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        if (res.status === 409) {
          throw new Error("다른 기기에서 수정되었습니다. 화면을 새로고침합니다.");
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "비용 수정에 실패했습니다.");
        }

        await refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "수정 실패";
        setError(msg);
        throw err;
      } finally {
        setMutatingId(undefined);
      }
    },
    [refresh]
  );

  const deleteExpense = useCallback(
    async (id: string, expectedVersion?: number) => {
      setMutatingId(id);
      setError(undefined);
      try {
        const res = await fetch(`/api/expenses/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion }),
        });

        if (res.status === 409) {
          throw new Error("다른 기기에서 이미 변경되었습니다.");
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "비용 삭제에 실패했습니다.");
        }

        await refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "삭제 실패";
        setError(msg);
        throw err;
      } finally {
        setMutatingId(undefined);
      }
    },
    [refresh]
  );

  const addReceipt = useCallback(
    async (itemId: string, file: File): Promise<ContentAsset> => {
      setMutatingId(itemId);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("itemId", itemId);
        formData.append("kind", "image");

        const res = await fetch("/api/assets", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "영수증 업로드에 실패했습니다.");
        }

        const data = await res.json();
        await refresh();
        return data.asset;
      } finally {
        setMutatingId(undefined);
      }
    },
    [refresh]
  );

  const deleteReceipt = useCallback(
    async (assetId: string) => {
      try {
        const res = await fetch(`/api/assets/${assetId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "영수증 삭제에 실패했습니다.");
        }

        await refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "삭제 실패";
        setError(msg);
        throw err;
      }
    },
    [refresh]
  );

  return {
    records,
    analysis,
    loading,
    loadingMore,
    mutatingId,
    error,
    filters,
    setFilters,
    nextCursor,
    loadMore,
    refresh,
    updateExpense,
    deleteExpense,
    addReceipt,
    deleteReceipt,
  };
}
