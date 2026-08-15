import type { UnifiedData } from "./unified";

export interface DataStorageStatus {
  cloudProvider: "supabase" | "upstash" | "guest";
  syncState: "idle" | "syncing" | "synced" | "error" | "guest" | "offline";
  lastSyncedAt?: string;
  pendingChanges: number;
  driveConnected: boolean;
  driveBackupEnabled: boolean;
  rawLocalStorageEnabled: boolean;
  errorMessage?: string;
}

export interface ExtractTasksRequest {
  text: string;
  saveToDrive?: boolean;
}

export interface ExtractTasksResponse {
  tasks: UnifiedData[];
  drive: {
    requested: boolean;
    saved: boolean;
    url?: string;
    reason?: "not_requested" | "not_connected" | "auth_expired" | "write_failed";
  };
  driveUrl?: string;
}
