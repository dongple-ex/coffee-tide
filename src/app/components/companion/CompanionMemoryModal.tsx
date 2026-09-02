"use client";

import React, { useState, useEffect } from "react";
import { CompanionMemory, CompanionMemoryType } from "@/lib/companion/contracts";
import { getLocalCompanionMemories, saveLocalCompanionMemory, deleteLocalCompanionMemory } from "@/lib/companion/repositories/indexedDb";
import { generateMemoryKeyHash } from "@/lib/companion/memoryPolicy";
import styles from "./CompanionMemoryModal.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  storageMode?: "local" | "account";
}

const MEMORY_CATEGORIES: { id: CompanionMemoryType; label: string; icon: string; placeholder: string }[] = [
  {
    id: "preference",
    label: "표현/호칭 선호",
    icon: "💬",
    placeholder: "표현/호칭 기억 추가 (예: '팀장님이라고 불러줘')",
  },
  {
    id: "work_style",
    label: "작업 방식",
    icon: "⚙️",
    placeholder: "작업 방식 기억 추가 (예: '회의록 요약은 항상 3줄 개조식으로 해줘')",
  },
  {
    id: "commitment",
    label: "중요 약속",
    icon: "🤝",
    placeholder: "중요 약속 기억 추가 (예: '매주 목요일 17:30에 Jira 등록하라고 알려줘')",
  },
  {
    id: "boundary",
    label: "금지 경계",
    icon: "⛔",
    placeholder: "금지 경계 기억 추가 (예: '주말에는 업무 알림 보내지 마')",
  },
];

const CATEGORY_MAP = Object.fromEntries(MEMORY_CATEGORIES.map((c) => [c.id, c]));

export function CompanionMemoryModal({ isOpen, onClose, storageMode = "local" }: Props) {
  const [memories, setMemories] = useState<CompanionMemory[]>([]);
  const [newText, setNewText] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [operationError, setOperationError] = useState<string | null>(null);
  const isAccountMode = storageMode === "account";

  // 상단 탭이 'all'이면 기본값 'preference', 특정 탭이면 해당 탭 타입으로 자동 바인딩
  const activeCreationType: CompanionMemoryType =
    filterType === "all" ? "preference" : (filterType as CompanionMemoryType);
  const currentCategory = CATEGORY_MAP[activeCreationType] || MEMORY_CATEGORIES[0];

  const loadMemories = async () => {
    if (!isAccountMode) {
      const local = await getLocalCompanionMemories();
      setMemories(local.filter((m) => m.status !== "deleted"));
      setOperationError(null);
    } else {
      try {
        const res = await fetch("/api/companion/memories");
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.memories)) {
          setMemories(data.memories);
          setOperationError(null);
        } else {
          setOperationError(data.message || "계정 기억을 불러오지 못했습니다.");
        }
      } catch {
        setOperationError("계정 기억을 불러오지 못했습니다.");
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      if (!isAccountMode) {
        const local = await getLocalCompanionMemories();
        if (!cancelled) {
          setMemories(local.filter((memory) => memory.status !== "deleted"));
          setOperationError(null);
        }
        return;
      }
      try {
        const response = await fetch("/api/companion/memories");
        const data = await response.json();
        if (cancelled) return;
        if (response.ok && data.success && Array.isArray(data.memories)) {
          setMemories(data.memories);
          setOperationError(null);
        } else {
          setOperationError(data.message || "계정 기억을 불러오지 못했습니다.");
        }
      } catch {
        if (!cancelled) setOperationError("계정 기억을 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAccountMode]);

  if (!isOpen) return null;

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;

    const memory: CompanionMemory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: "guest",
      personaScope: "shared",
      memoryType: activeCreationType,
      contentText: newText.trim(),
      status: "active",
      confidence: 1.0,
      userConfirmed: true,
      sensitivity: "normal",
      sourceRefs: ["manual_user_input"],
      recallCount: 0,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setOperationError(null);
    if (!isAccountMode) {
      await saveLocalCompanionMemory(memory);
    } else {
      const res = await fetch("/api/companion/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryType: activeCreationType,
          contentText: memory.contentText,
          personaScope: "shared",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOperationError(data.message || data.error || "기억을 저장하지 못했습니다.");
        return;
      }
    }
    setNewText("");
    await loadMemories();
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm("이 기억을 정말 잊게 하시겠습니까? 삭제된 기억은 즉시 검색 및 대화에서 제외됩니다.")) return;

    setOperationError(null);
    const keyHash = generateMemoryKeyHash("guest", id);
    if (!isAccountMode) {
      await deleteLocalCompanionMemory(id, keyHash);
    } else {
      const res = await fetch(`/api/companion/memories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setOperationError(data.message || data.error || "기억을 삭제하지 못했습니다.");
        return;
      }
    }
    await loadMemories();
  };

  const handleToggleConfirm = async (mem: CompanionMemory) => {
    const nextConfirmed = !mem.userConfirmed;
    setOperationError(null);
    if (!isAccountMode) {
      await saveLocalCompanionMemory({ ...mem, userConfirmed: nextConfirmed });
    } else {
      const res = await fetch(`/api/companion/memories/${mem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userConfirmed: nextConfirmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        setOperationError(data.message || data.error || "기억을 수정하지 못했습니다.");
        return;
      }
    }
    await loadMemories();
  };

  const filteredMemories =
    filterType === "all" ? memories : memories.filter((m) => m.memoryType === filterType);

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        {/* 헤더 */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.headerTitle}>
              🧠 AI 컴패니언 장기 기억 관리
            </h3>
            <p className={styles.headerSubtitle}>
              AI 바리스타가 기억하고 있는 선호와 작업 방식입니다. 언제든 확인·수정·삭제할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 일원화된 필터/카테고리 칩 탭 */}
        <div className={styles.chipsContainer}>
          {[
            { id: "all", label: "전체", icon: "📋" },
            ...MEMORY_CATEGORIES,
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`${styles.chipTab} ${filterType === tab.id ? styles.chipTabActive : ""}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {operationError && (
          <div role="alert" style={{ color: "#fda4af", fontSize: "0.78rem", marginBottom: "8px" }}>
            {operationError}
          </div>
        )}

        {/* 기억 리스트 */}
        <div className={styles.memoryList}>
          {filteredMemories.length === 0 ? (
            <div className={styles.emptyState}>
              등록된 장기 기억이 없습니다.
            </div>
          ) : (
            filteredMemories.map((m) => {
              const cat = CATEGORY_MAP[m.memoryType] || { label: m.memoryType, icon: "📌" };
              return (
                <div key={m.id} className={styles.memoryCard}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <span className={styles.memoryBadge}>
                        {cat.icon} {cat.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleConfirm(m)}
                        className={`${styles.confirmStatusBtn} ${
                          m.userConfirmed ? styles.confirmStatusConfirmed : styles.confirmStatusInferred
                        }`}
                        title="클릭하여 확인 상태 변경"
                      >
                        {m.userConfirmed ? "✓ 확인됨" : "❓ 추정 (클릭 시 확인)"}
                      </button>
                    </div>
                    <p className={styles.memoryContent}>
                      {m.contentText}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteMemory(m.id)}
                    className={styles.deleteBtn}
                  >
                    잊기
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* 일원화된 직접 추가 폼 (상단 탭 1:1 연동) */}
        <form
          onSubmit={handleAddMemory}
          className={styles.bottomForm}
        >
          <input
            type="text"
            disabled={filterType === "all"}
            placeholder={
              filterType === "all"
                ? "💡 기억을 추가하려면 상단에서 카테고리(호칭/작업방식/약속/금지경계)를 선택해 주세요."
                : currentCategory.placeholder
            }
            value={filterType === "all" ? "" : newText}
            onChange={(e) => setNewText(e.target.value)}
            className={`${styles.inputField} ${filterType === "all" ? styles.inputFieldDisabled : ""}`}
          />
          <button
            type="submit"
            disabled={filterType === "all" || !newText.trim()}
            className={`${styles.submitButton} ${
              filterType !== "all" && newText.trim() ? styles.submitButtonActive : styles.submitButtonDisabled
            }`}
          >
            추가
          </button>
        </form>
      </div>
    </div>
  );
}
