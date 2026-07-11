// Notion 어댑터 — REST 직접 호출 (백로그 D2 회피: SDK 캐스팅 대신 버전 고정 REST).
// phase2_notion_spec: 속성 명칭 관용 매핑(Status/상태, Due Date/기한, Priority/우선순위) + null-safe.

import { UnifiedData } from "../types/unified";
import { AuthExpiredError } from "./outlook";

const NOTION_VERSION = "2022-06-28";

interface NotionRichText {
  plain_text?: string;
}

interface NotionProperty {
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  status?: { name?: string };
  select?: { name?: string };
  date?: { start?: string };
  people?: { name?: string }[];
}

interface NotionPage {
  id: string;
  created_time?: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
  created_by?: { name?: string };
}

function pickProp(
  props: Record<string, NotionProperty>,
  candidates: string[]
): NotionProperty | undefined {
  for (const key of Object.keys(props)) {
    if (candidates.some((c) => key.toLowerCase() === c.toLowerCase())) return props[key];
  }
  return undefined;
}

function propText(p?: NotionProperty): string {
  if (!p) return "";
  if (p.title?.length) return p.title.map((t) => t.plain_text || "").join("");
  if (p.rich_text?.length) return p.rich_text.map((t) => t.plain_text || "").join("");
  if (p.status?.name) return p.status.name;
  if (p.select?.name) return p.select.name;
  if (p.date?.start) return p.date.start;
  return "";
}

export class NotionAdapter {
  constructor(private token: string, private databaseId: string) {}

  private async api(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (res.status === 401) throw new AuthExpiredError("notion");
    return res;
  }

  async fetchRecent(limit = 10): Promise<UnifiedData[]> {
    const res = await this.api(`/databases/${this.databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: limit }),
    });
    if (!res.ok) throw new Error(`Notion query ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { results?: NotionPage[] };

    return (json.results || [])
      .map((page) => this.map(page))
      .filter((item) => !/^(done|완료)$/i.test(item.content.match(/Status: \[([^\]]*)\]/)?.[1] || ""));
  }

  private map(page: NotionPage): UnifiedData {
    const props = page.properties || {};
    const titleProp =
      Object.values(props).find((p) => p.type === "title") ||
      pickProp(props, ["Name", "이름", "제목"]);
    const status = propText(pickProp(props, ["Status", "상태"]));
    const due = propText(pickProp(props, ["Due Date", "Due", "기한", "마감일"]));
    const priority = propText(pickProp(props, ["Priority", "우선순위"]));

    const contentParts = [
      status && `Status: [${status}]`,
      due && `마감일: ${due}`,
      priority && `우선순위: ${priority}`,
    ].filter(Boolean);

    return {
      id: page.id,
      source: "notion",
      title: propText(titleProp) || "(제목 없음)",
      content: contentParts.join(" | ") || "속성 정보 없음",
      created_at: page.created_time || new Date().toISOString(),
      author: { name: page.created_by?.name || "Notion" },
      url: page.url || "",
      status: "pending",
    };
  }

  /** 페이지 상태 완료 처리 — Status(status/select 타입 자동 판별)를 Done/완료로. */
  async completeTask(pageId: string): Promise<void> {
    const pageRes = await this.api(`/pages/${pageId}`);
    if (!pageRes.ok) throw new Error(`Notion page ${pageRes.status}`);
    const page = (await pageRes.json()) as NotionPage;
    const props = page.properties || {};

    const statusKey = Object.keys(props).find((k) =>
      ["status", "상태"].includes(k.toLowerCase())
    );
    if (!statusKey) throw new Error("Status 속성을 찾을 수 없습니다");
    const prop = props[statusKey];
    const doneName = /상태/.test(statusKey) ? "완료" : "Done";

    const patch =
      prop.type === "status"
        ? { [statusKey]: { status: { name: doneName } } }
        : { [statusKey]: { select: { name: doneName } } };

    const res = await this.api(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: patch }),
    });
    if (!res.ok) throw new Error(`Notion update ${res.status}: ${await res.text()}`);
  }

  /** 빠른 캡처 — DB의 title 속성명을 자동 탐지해 페이지 생성 (백로그 F2 설계). */
  async createTask(title: string, content?: string): Promise<string> {
    const dbRes = await this.api(`/databases/${this.databaseId}`);
    if (!dbRes.ok) throw new Error(`Notion database ${dbRes.status}`);
    const db = (await dbRes.json()) as {
      properties?: Record<string, { type?: string }>;
    };
    const titleKey =
      Object.entries(db.properties || {}).find(([, v]) => v.type === "title")?.[0] ||
      "Name";

    const res = await this.api(`/pages`, {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties: {
          [titleKey]: { title: [{ text: { content: title } }] },
        },
        ...(content
          ? {
              children: [
                {
                  object: "block",
                  type: "paragraph",
                  paragraph: { rich_text: [{ text: { content } }] },
                },
              ],
            }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Notion create ${res.status}: ${await res.text()}`);
    const created = (await res.json()) as { url?: string };
    return created.url || "";
  }
}
