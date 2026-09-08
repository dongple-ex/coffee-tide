"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { loadLS, saveLS, LS_MANUAL } from "@/lib/localStore";
import type { UnifiedData } from "@/lib/types/unified";

export interface UseManualItemsOptions {
  showToast?: (message: string) => void;
  onTaskCompleted?: () => void;
}

/**
 * 수동 등록 업무(manualItems)의 상태 및 로컬 스토리지 동기화 관리 훅 (K10)
 */
export function useManualItems(options: UseManualItemsOptions = {}) {
  const { showToast, onTaskCompleted } = options;

  const [manualItems, setManualItems] = useState<UnifiedData[]>(() =>
    loadLS<UnifiedData[]>(LS_MANUAL, [])
  );

  const quotaWarnedRef = useRef(false);

  // 로컬 스토리지 자동 저장
  useEffect(() => {
    const ok = saveLS(LS_MANUAL, manualItems);
    if (!ok && !quotaWarnedRef.current) {
      quotaWarnedRef.current = true;
      showToast?.("앗, 저장 공간이 가득 차서 새 항목을 못 담고 있어요. 큰 업로드 항목을 몇 개 삭제해 주세요.");
    } else if (ok) {
      quotaWarnedRef.current = false;
    }
  }, [manualItems, showToast]);

  // AI 자동 분류 호출
  const classifyManualItem = useCallback(async (item: UnifiedData) => {
    try {
      const res = await fetch("/api/tasks/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [item] }),
      });
      if (res.ok) {
        const { items } = (await res.json()) as { items: UnifiedData[] };
        if (items[0]) {
          setManualItems((prev) => prev.map((i) => (i.id === item.id ? items[0] : i)));
        }
      }
    } catch {
      // 분류 실패해도 항목은 유지 (부분 실패 허용)
    }
  }, []);

  // 수동 업무 등록
  const registerManualTask = useCallback(
    (item: UnifiedData) => {
      setManualItems((previous) => [item, ...previous.filter((current) => current.id !== item.id)]);
      void classifyManualItem(item);
    },
    [classifyManualItem]
  );

  // 빠른 제목 입력으로 수동 업무 추가
  const addManualItem = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const item: UnifiedData = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: "manual",
        title: trimmed,
        content: trimmed,
        created_at: new Date().toISOString(),
        author: { name: "나" },
        url: "",
        status: "pending",
      };
      registerManualTask(item);
    },
    [registerManualTask]
  );

  // 수동/로컬 업무 상태 변경
  const setLocalStatus = useCallback(
    (id: string, status: UnifiedData["status"], fallbackItems: UnifiedData[] = []) => {
      setManualItems((prev) => {
        const exists = prev.some((i) => i.id === id);
        if (exists) {
          return prev.map((i) => (i.id === id ? { ...i, status } : i));
        }
        const target = fallbackItems.find((i) => i.id === id);
        if (target) {
          return [{ ...target, status }, ...prev];
        }
        return prev;
      });

      if (status === "completed") {
        onTaskCompleted?.();
      }
    },
    [onTaskCompleted]
  );

  // 로컬 업무 삭제
  const deleteLocal = useCallback((id: string) => {
    setManualItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return {
    manualItems,
    setManualItems,
    registerManualTask,
    addManualItem,
    setLocalStatus,
    deleteLocal,
    classifyManualItem,
  };
}
