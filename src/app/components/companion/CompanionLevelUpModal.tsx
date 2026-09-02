"use client";

import React from "react";
import { RELATIONSHIP_LEVEL_SPECS, PERSONA_TRANSITION_SCENES } from "@/lib/companion/relationshipEngine";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  personaId?: string;
  baristaName?: string;
  newLevel: number;
}

export function CompanionLevelUpModal({
  isOpen,
  onClose,
  personaId = "karina",
  baristaName = "카리나",
  newLevel,
}: Props) {
  if (!isOpen) return null;

  const spec = RELATIONSHIP_LEVEL_SPECS.find((s) => s.level === newLevel) || RELATIONSHIP_LEVEL_SPECS[0];
  const scene = PERSONA_TRANSITION_SCENES[personaId]?.[newLevel] || {
    narration: "*눈을 반짝이며 환하게 미소 짓고*",
    quote: spec.secretQuote,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          backgroundColor: "#1e293b",
          border: "2px solid #f43f5e",
          borderRadius: "20px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          boxShadow: "0 25px 50px -12px rgba(244, 63, 94, 0.35)",
          position: "relative",
          animation: "popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "8px" }}>🎊</div>
        <span
          style={{
            fontSize: "0.85rem",
            fontWeight: 700,
            color: "#fda4af",
            textTransform: "uppercase",
            letterSpacing: "1px",
            marginBottom: "4px",
          }}
        >
          RELATIONSHIP LEVEL UP!
        </span>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 8px", color: "#f8fafc" }}>
          {spec.badge} {spec.title} 달성!
        </h2>
        <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: "0 0 16px", lineHeight: 1.4 }}>
          {spec.description}
        </p>

        {/* 혜택 안내 박스 */}
        <div
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            background: "rgba(244, 63, 94, 0.08)",
            border: "1px solid rgba(244, 63, 94, 0.2)",
            marginBottom: "16px",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#fda4af", marginBottom: "4px" }}>
            🎁 새로운 해금 혜택
          </div>
          <div style={{ fontSize: "0.85rem", color: "#f1f5f9", fontWeight: 600 }}>
            {spec.perkDescription}
          </div>
        </div>

        {/* 캐릭터 전이 대사 */}
        <div
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "12px",
            background: "rgba(0, 0, 0, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            marginBottom: "20px",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontStyle: "italic", marginBottom: "6px" }}>
            {scene.narration}
          </div>
          <div style={{ fontSize: "0.9rem", color: "#f8fafc", lineHeight: 1.45, fontWeight: 500 }}>
            &ldquo;{scene.quote}&rdquo;
          </div>
          <div style={{ textAlign: "right", fontSize: "0.75rem", color: "#fda4af", marginTop: "6px" }}>
            — {baristaName}
          </div>
        </div>

        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #f43f5e, #e11d48)",
            border: "none",
            color: "#ffffff",
            fontSize: "0.95rem",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(244, 63, 94, 0.3)",
          }}
        >
          계속해서 함께 일하기 ✨
        </button>
      </div>
    </div>
  );
}
