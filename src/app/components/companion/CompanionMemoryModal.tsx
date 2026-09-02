"use client";

import React, { useState, useEffect } from "react";
import { CompanionMemory, CompanionMemoryType } from "@/lib/companion/contracts";
import { getLocalCompanionMemories, saveLocalCompanionMemory, deleteLocalCompanionMemory } from "@/lib/companion/repositories/indexedDb";
import { generateMemoryKeyHash } from "@/lib/companion/memoryPolicy";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
}

export function CompanionMemoryModal({ isOpen, onClose, userId = "guest" }: Props) {
  const [memories, setMemories] = useState<CompanionMemory[]>([]);
  const [newText, setNewText] = useState("");
  const [newType, setNewType] = useState<CompanionMemoryType>("preference");
  const [filterType, setFilterType] = useState<string>("all");

  const loadMemories = async () => {
    if (userId === "guest") {
      const local = await getLocalCompanionMemories();
      setMemories(local.filter((m) => m.status !== "deleted"));
    } else {
      try {
        const res = await fetch(`/api/companion/memories?userId=${userId}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.memories)) {
          setMemories(data.memories);
        }
      } catch {
        // fallback
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadMemories();
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;

    const memory: CompanionMemory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      personaScope: "shared",
      memoryType: newType,
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

    if (userId === "guest") {
      await saveLocalCompanionMemory(memory);
    }
    setNewText("");
    await loadMemories();
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm("이 기억을 정말 잊게 하시겠습니까? 삭제된 기억은 즉시 검색 및 대화에서 제외됩니다.")) return;

    const keyHash = generateMemoryKeyHash(userId, id);
    if (userId === "guest") {
      await deleteLocalCompanionMemory(id, keyHash);
    } else {
      await fetch(`/api/companion/memories/${id}?userId=${userId}`, { method: "DELETE" });
    }
    await loadMemories();
  };

  const handleToggleConfirm = async (mem: CompanionMemory) => {
    const nextConfirmed = !mem.userConfirmed;
    if (userId === "guest") {
      await saveLocalCompanionMemory({ ...mem, userConfirmed: nextConfirmed });
    } else {
      await fetch(`/api/companion/memories/${mem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userConfirmed: nextConfirmed }),
      });
    }
    await loadMemories();
  };

  const filteredMemories =
    filterType === "all" ? memories : memories.filter((m) => m.memoryType === filterType);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          maxHeight: "85vh",
          backgroundColor: "#1e293b",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
              🧠 AI 컴패니언 장기 기억 관리
            </h3>
            <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "2px 0 0" }}>
              AI 바리스타가 기억하고 있는 선호와 작업 방식입니다. 언제든 확인·수정·삭제할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "1.2rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* 필터 탭 */}
        <div style={{ display: "flex", gap: "6px", padding: "12px 20px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
          {[
            { id: "all", label: "전체" },
            { id: "preference", label: "표현/호칭 선호" },
            { id: "work_style", label: "작업 방식" },
            { id: "commitment", label: "중요 약속" },
            { id: "boundary", label: "금지 경계" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              style={{
                padding: "4px 10px",
                borderRadius: "12px",
                fontSize: "0.78rem",
                border: "none",
                cursor: "pointer",
                background: filterType === tab.id ? "#38bdf8" : "rgba(255, 255, 255, 0.06)",
                color: filterType === tab.id ? "#0f172a" : "#cbd5e1",
                fontWeight: filterType === tab.id ? 700 : 500,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 기억 리스트 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredMemories.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#64748b", fontSize: "0.85rem" }}>
              등록된 장기 기억이 없습니다.
            </div>
          ) : (
            filteredMemories.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(56, 189, 248, 0.15)",
                        color: "#38bdf8",
                        fontWeight: 600,
                      }}
                    >
                      {m.memoryType}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleConfirm(m)}
                      style={{
                        fontSize: "0.7rem",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: m.userConfirmed ? "rgba(34, 197, 94, 0.15)" : "rgba(234, 179, 8, 0.15)",
                        color: m.userConfirmed ? "#4ade80" : "#facc15",
                        border: "none",
                        cursor: "pointer",
                      }}
                      title="클릭하여 확인 상태 변경"
                    >
                      {m.userConfirmed ? "✓ 확인됨" : "❓ 추정 (클릭 시 확인)"}
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "#f1f5f9", lineHeight: 1.4 }}>
                    {m.contentText}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteMemory(m.id)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    color: "#f87171",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                  }}
                >
                  잊기
                </button>
              </div>
            ))
          )}
        </div>

        {/* 직접 추가 폼 */}
        <form
          onSubmit={handleAddMemory}
          style={{
            padding: "14px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            gap: "8px",
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as CompanionMemoryType)}
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              background: "#0f172a",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#f8fafc",
              fontSize: "0.82rem",
            }}
          >
            <option value="preference">표현/호칭</option>
            <option value="work_style">작업방식</option>
            <option value="commitment">약속</option>
            <option value="boundary">금지경계</option>
          </select>
          <input
            type="text"
            placeholder="직접 기억 추가 (예: '팀장님이라고 불러줘')"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "8px",
              background: "#0f172a",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#f8fafc",
              fontSize: "0.82rem",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              background: "#38bdf8",
              border: "none",
              color: "#0f172a",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            추가
          </button>
        </form>
      </div>
    </div>
  );
}
