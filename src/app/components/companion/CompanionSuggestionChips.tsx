"use client";

import React from "react";
import { CompanionSuggestionItem } from "@/lib/companion/contracts";

interface Props {
  suggestions?: CompanionSuggestionItem[];
  onSelectSuggestion: (suggestion: CompanionSuggestionItem) => void;
  disabled?: boolean;
}

export function CompanionSuggestionChips({
  suggestions = [],
  onSelectSuggestion,
  disabled = false,
}: Props) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        padding: "6px 0",
        alignItems: "center",
      }}
    >
      {suggestions.map((sug) => {
        let badgeBg = "rgba(56, 189, 248, 0.12)";
        let badgeBorder = "rgba(56, 189, 248, 0.25)";
        let badgeColor = "#7dd3fc";

        if (sug.action === "start_timer") {
          badgeBg = "rgba(245, 158, 11, 0.12)";
          badgeBorder = "rgba(245, 158, 11, 0.25)";
          badgeColor = "#fcd34d";
        } else if (sug.action === "open_review") {
          badgeBg = "rgba(168, 85, 247, 0.12)";
          badgeBorder = "rgba(168, 85, 247, 0.25)";
          badgeColor = "#d8b4fe";
        } else if (sug.category === "roleplay") {
          badgeBg = "rgba(244, 63, 94, 0.12)";
          badgeBorder = "rgba(244, 63, 94, 0.25)";
          badgeColor = "#fda4af";
        }

        return (
          <button
            key={sug.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelectSuggestion(sug)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 11px",
              borderRadius: "16px",
              background: badgeBg,
              border: `1px solid ${badgeBorder}`,
              color: badgeColor,
              fontSize: "0.8rem",
              fontWeight: 500,
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
            title={`[${sug.action}] ${sug.label}`}
          >
            {sug.icon && <span>{sug.icon}</span>}
            <span>{sug.label}</span>
          </button>
        );
      })}
    </div>
  );
}
