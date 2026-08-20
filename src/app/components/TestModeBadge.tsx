"use client";

export function TestModeBadge() {
  const isTestMode =
    process.env.NEXT_PUBLIC_IS_TEST_MODE === "true" ||
    process.env.NODE_ENV === "development";

  if (!isTestMode) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        backgroundColor: "var(--bg-card, #2A2A2A)",
        color: "var(--text-secondary, #999)",
        padding: "6px 12px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: "500",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        zIndex: 9999,
        border: "1px solid var(--border-color, #444)",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        pointerEvents: "none",
        opacity: 0.85
      }}
    >
      <span style={{ fontSize: "14px" }}>🧪</span> 테스트 모드 작동중
    </div>
  );
}
