"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { UserCloudState } from "@/lib/db/syncAdapter";

export function useCloudSync(_userId?: string) {
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "guest">("idle");
  const [provider, setProvider] = useState<string>("guest");
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUserData = useCallback(async (id: string): Promise<UserCloudState | null> => {
    try {
      const res = await fetch(`/api/user/sync?userId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.success) {
        setProvider(data.provider || "guest");
        if (data.provider === "guest") {
          setSyncStatus("guest");
        } else {
          setSyncStatus("synced");
        }
        return data.state;
      }
      return null;
    } catch {
      setSyncStatus("guest");
      return null;
    }
  }, []);

  const syncUserData = useCallback((id: string, state: UserCloudState) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("syncing");
      try {
        const res = await fetch("/api/user/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id, state }),
        });
        const data = await res.json();
        if (data.success && data.provider !== "guest") {
          setSyncStatus("synced");
        } else {
          setSyncStatus("guest");
        }
      } catch {
        setSyncStatus("guest");
      }
    }, 1500); // 1.5초 디바운스
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return {
    syncStatus,
    provider,
    fetchUserData,
    syncUserData,
  };
}
