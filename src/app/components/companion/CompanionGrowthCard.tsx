"use client";

import React, { useState, useEffect } from "react";
import { GrowthSnapshot } from "@/lib/companion/contracts";

interface Props {
  userId?: string;
  personaId?: string;
}

export function CompanionGrowthCard({ userId = "guest", personaId = "karina" }: Props) {
  const [snapshot, setSnapshot] = useState<GrowthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [experimentAccepted, setExperimentAccepted] = useState(false);

  const loadGrowth = async () => {
    try {
      const res = await fetch(`/api/growth/weekly?userId=${userId}`);
      const data = await res.json();
      if (data.success && data.snapshot) {
        setSnapshot(data.snapshot);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGrowth();
  }, [userId]);

  const handleAcceptExperiment = async (expId: string) => {
    try {
      await fetch(`/api/growth/experiments/${expId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, personaId, action: "accepted" }),
      });
      setExperimentAccepted(true);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "12px", borderRadius: "10px", background: "rgba(255,255,255,0.03)", fontSize: "0.82rem", color: "#94a3b8" }}>
        성장 지표를 불러오는 중...
      </div>
    );
  }

  if (!snapshot) return null;

  const { metrics, insights, experiment } = snapshot;

  return (
    <div
      style={{
        padding: "16px",
        borderRadius: "14px",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.09)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      {/* 타이틀 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "1.1rem" }}>📈</span>
          <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "#f8fafc" }}>
            계정 공통 4축 업무 성장 리포트
          </span>
        </div>
        <span style={{ fontSize: "0.74rem", color: "#94a3b8" }}>{metrics.periodLabel}</span>
      </div>

      {/* 4축 게이지 바 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {[
          { label: "실행 (Execution)", score: metrics.executionScore, color: "#38bdf8" },
          { label: "집중 (Focus)", score: metrics.focusScore, color: "#f59e0b" },
          { label: "정리 (Organization)", score: metrics.organizationScore, color: "#a855f7" },
          { label: "회고 (Reflection)", score: metrics.reflectionScore, color: "#34d399" },
        ].map((axis) => (
          <div
            key={axis.label}
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
              <span style={{ color: "#cbd5e1" }}>{axis.label}</span>
              <span style={{ fontWeight: 700, color: axis.color }}>{axis.score}점</span>
            </div>
            <div style={{ width: "100%", height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${axis.score}%`,
                  height: "100%",
                  background: axis.color,
                  borderRadius: "3px",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 객관적 관찰 패턴 */}
      <div style={{ fontSize: "0.8rem", color: "#cbd5e1", lineHeight: 1.4, display: "flex", flexDirection: "column", gap: "4px" }}>
        {insights.map((insight, idx) => (
          <div key={idx} style={{ display: "flex", gap: "6px" }}>
            <span style={{ color: "#38bdf8" }}>•</span>
            <span>{insight}</span>
          </div>
        ))}
      </div>

      {/* 이번 주 제안 실험 */}
      {experiment && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            background: "rgba(56, 189, 248, 0.08)",
            border: "1px solid rgba(56, 189, 248, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#38bdf8" }}>
              🧪 이번 주 추천 성장 실험: {experiment.title}
            </span>
            <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>[{experiment.axis}]</span>
          </div>
          <p style={{ margin: 0, fontSize: "0.76rem", color: "#cbd5e1", lineHeight: 1.35 }}>
            {experiment.description}
          </p>
          {!experimentAccepted ? (
            <button
              type="button"
              onClick={() => handleAcceptExperiment(experiment.id)}
              style={{
                alignSelf: "flex-start",
                marginTop: "4px",
                padding: "4px 10px",
                borderRadius: "6px",
                background: "#38bdf8",
                border: "none",
                color: "#0f172a",
                fontSize: "0.75rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✓ 이 실험 도전하기 (+20 EXP)
            </button>
          ) : (
            <span style={{ fontSize: "0.75rem", color: "#34d399", fontWeight: 600, marginTop: "4px" }}>
              ✓ 실험 도전이 채택되었습니다! 파트너와 함께 실천해 봐요.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
