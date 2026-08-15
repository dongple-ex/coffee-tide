import type { WorkspaceItem } from "../data/contracts";
import type { SyncConflict } from "./contracts";

export interface MergeItemResult {
  hasConflict: boolean;
  mergedItem?: WorkspaceItem;
  conflict?: SyncConflict;
}

export interface GuestCloudMergeResult {
  mergedItems: WorkspaceItem[];
  itemsToUpload: WorkspaceItem[];
  conflicts: SyncConflict[];
  duplicateCount: number;
}

function normalizeText(text?: string): string {
  return (text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * 두 항목의 핵심 내용이 사실상 동일한지 판별합니다 (제목과 본문 정규화 비교).
 */
export function isDuplicateContent(a: WorkspaceItem, b: WorkspaceItem): boolean {
  if (a.id === b.id) return true;
  const titleA = normalizeText(a.title);
  const titleB = normalizeText(b.title);
  const contentA = normalizeText(a.content || a.rawContent);
  const contentB = normalizeText(b.content || b.rawContent);
  return titleA.length > 0 && titleA === titleB && contentA === contentB;
}

/**
 * 로컬 항목과 서버 항목을 비교하여 충돌 여부를 감지하고 안전하게 병합합니다.
 * content, status, workNote, subTasks가 양쪽에서 다르게 변경되었거나 한쪽이 삭제된 경우 자동 덮어쓰지 않고 충돌을 생성합니다.
 */
export function mergeItemChanges(
  localItem: WorkspaceItem,
  serverItem: WorkspaceItem
): MergeItemResult {
  // 1. 서버 항목이 이미 삭제된 경우
  if (serverItem.deletedAt && !localItem.deletedAt) {
    return {
      hasConflict: true,
      conflict: {
        itemId: localItem.id,
        localItem,
        serverItem,
        detectedAt: new Date().toISOString(),
        resolved: false,
      },
    };
  }

  // 2. 필드 비교
  const conflictFields: string[] = [];
  const fieldsToCheck: Array<keyof WorkspaceItem> = [
    "content",
    "status",
    "workNote",
    "subTasks",
    "title",
    "rawContent",
  ];

  for (const field of fieldsToCheck) {
    const localVal = JSON.stringify(localItem[field] ?? null);
    const serverVal = JSON.stringify(serverItem[field] ?? null);

    if (localVal !== serverVal) {
      conflictFields.push(String(field));
    }
  }

  // 내용 변경이 전혀 없는 경우
  if (conflictFields.length === 0) {
    return {
      hasConflict: false,
      mergedItem: serverItem.version >= localItem.version ? serverItem : localItem,
    };
  }

  // 필드 차이가 존재하는 경우 충돌 판정
  return {
    hasConflict: true,
    conflict: {
      itemId: localItem.id,
      localItem,
      serverItem,
      detectedAt: new Date().toISOString(),
      resolved: false,
    },
  };
}

/**
 * 게스트 상태에서 수집/생성된 항목들과 클라우드 기존 항목들을 손실 없이 병합합니다.
 */
export function mergeGuestAndCloudItems(
  guestItems: WorkspaceItem[],
  cloudItems: WorkspaceItem[]
): GuestCloudMergeResult {
  const cloudItemMap = new Map<string, WorkspaceItem>();
  for (const item of cloudItems) {
    cloudItemMap.set(item.id, item);
  }

  const mergedMap = new Map<string, WorkspaceItem>(cloudItemMap);
  const itemsToUpload: WorkspaceItem[] = [];
  const conflicts: SyncConflict[] = [];
  let duplicateCount = 0;

  for (const guestItem of guestItems) {
    const existingCloudItem = cloudItemMap.get(guestItem.id);

    if (!existingCloudItem) {
      // 클라우드에 없는 새로운 로컬 항목 -> 중복 검사 후 업로드 큐에 추가
      let foundDuplicate = false;
      for (const cloudItem of cloudItems) {
        if (isDuplicateContent(guestItem, cloudItem)) {
          foundDuplicate = true;
          duplicateCount++;
          break;
        }
      }

      if (!foundDuplicate) {
        mergedMap.set(guestItem.id, guestItem);
        itemsToUpload.push(guestItem);
      }
    } else {
      // 이미 같은 ID가 있는 경우
      const result = mergeItemChanges(guestItem, existingCloudItem);
      if (result.hasConflict && result.conflict) {
        conflicts.push(result.conflict);
      } else if (result.mergedItem) {
        mergedMap.set(guestItem.id, result.mergedItem);
      }
    }
  }

  return {
    mergedItems: Array.from(mergedMap.values()),
    itemsToUpload,
    conflicts,
    duplicateCount,
  };
}
