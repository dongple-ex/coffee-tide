// 자동화 규칙 엔진 — doc/as-built-reference.md §5.
// 규칙은 위→아래 순차 적용. hide=제거, pin=상단 고정(안정 정렬), urgent=카테고리 승격, mute=ignore 강등.
// 클라이언트 localStorage(ct_automation_rules)에 영속 — 서버/클라 공용 순수 모듈.

import { UnifiedData } from "../types/unified";

export interface AutomationRule {
  field: "any" | "source" | "sender" | "title" | "content";
  value: string;
  action: "pin" | "urgent" | "mute" | "hide";
  enabled: boolean;
}

export interface ProcessedData extends UnifiedData {
  pinned?: boolean;
  automated?: string[];
}

function matches(item: UnifiedData, rule: AutomationRule): boolean {
  const v = rule.value.toLowerCase();
  if (!v) return false;
  switch (rule.field) {
    case "source":
      return item.source.toLowerCase().includes(v);
    case "sender":
      return (
        item.author.name.toLowerCase().includes(v) ||
        (item.author.email ?? "").toLowerCase().includes(v)
      );
    case "title":
      return item.title.toLowerCase().includes(v);
    case "content":
      return item.content.toLowerCase().includes(v);
    case "any":
      return (
        item.title.toLowerCase().includes(v) ||
        item.content.toLowerCase().includes(v) ||
        item.author.name.toLowerCase().includes(v) ||
        item.source.toLowerCase().includes(v)
      );
  }
}

export function applyRules(items: UnifiedData[], rules: AutomationRule[]): ProcessedData[] {
  let processed: ProcessedData[] = items.map((i) => ({ ...i }));

  for (const rule of rules) {
    if (!rule.enabled) continue;
    processed = processed.flatMap((item) => {
      if (!matches(item, rule)) return [item];
      const tag = `${rule.action}:${rule.value}`;
      switch (rule.action) {
        case "hide":
          return [];
        case "pin":
          return [{ ...item, pinned: true, automated: [...(item.automated ?? []), tag] }];
        case "urgent":
          return [
            { ...item, category: "urgent" as const, automated: [...(item.automated ?? []), tag] },
          ];
        case "mute":
          return [
            { ...item, category: "ignore" as const, automated: [...(item.automated ?? []), tag] },
          ];
      }
    });
  }

  // pin 상단 고정 — 안정 정렬 (기존 순서 유지)
  const pinned = processed.filter((i) => i.pinned);
  const rest = processed.filter((i) => !i.pinned);
  return [...pinned, ...rest];
}
