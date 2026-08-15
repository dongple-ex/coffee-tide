"use client";

import React from "react";
import type { SyncStatusSummary } from "@/lib/sync/contracts";

interface SyncStatusCardProps {
  summary: SyncStatusSummary;
  onFlushQueue: () => void;
  onOpenConflicts?: () => void;
  isLoading?: boolean;
}

export const SyncStatusCard: React.FC<SyncStatusCardProps> = ({
  summary,
  onFlushQueue,
  onOpenConflicts,
  isLoading,
}) => {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-300">항목 단위 증분 동기화 상태</h4>
        <span className="text-[11px] text-zinc-500 font-mono">
          Device: {summary.deviceId.slice(0, 12)}...
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-zinc-500 text-[11px]">미전송 오프라인 변경</div>
          <div className="text-base font-bold text-zinc-200 mt-0.5">
            {summary.pendingMutationCount} 건
          </div>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-zinc-500 text-[11px]">미해결 충돌</div>
          <div className="text-base font-bold text-amber-400 mt-0.5">
            {summary.unresolvedConflictCount} 건
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400">
        <span>
          마지막 증분 동기화:{" "}
          {summary.lastSyncedAt
            ? new Date(summary.lastSyncedAt).toLocaleTimeString()
            : "동기화 이력 없음"}
        </span>
        <div className="flex gap-2">
          {summary.unresolvedConflictCount > 0 && onOpenConflicts && (
            <button
              type="button"
              onClick={onOpenConflicts}
              className="px-2.5 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded border border-amber-500/30 transition-colors"
            >
              충돌 확인
            </button>
          )}
          <button
            type="button"
            onClick={onFlushQueue}
            disabled={isLoading}
            className="px-2.5 py-1 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 rounded border border-zinc-700 transition-colors"
          >
            {isLoading ? "동기화 중..." : "지금 동기화"}
          </button>
        </div>
      </div>
    </div>
  );
};
