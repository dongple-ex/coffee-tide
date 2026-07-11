// Outlook 어댑터 — Microsoft Graph 받은편지함 조회 + 답장 초안 write-back (doc/phase5 §2.2).
// 백로그 A3 반영: 401 시 AuthExpiredError를 던져 라우트에서 반응형 리프레시 1회 재시도.

import { UnifiedData } from "../types/unified";
import { cleanHtmlContent } from "./textUtils";

export class AuthExpiredError extends Error {
  constructor(public channel: string) {
    super(`${channel} token expired or revoked`);
  }
}

interface GraphMessage {
  id?: string;
  subject?: string;
  body?: { content?: string; contentType?: "html" | "text" };
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  webLink?: string;
  importance?: string;
}

export class OutlookAdapter {
  constructor(private accessToken: string) {}

  private async graph(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (res.status === 401) throw new AuthExpiredError("outlook");
    return res;
  }

  async fetchRecent(limit = 10): Promise<UnifiedData[]> {
    const res = await this.graph(
      `/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,body,receivedDateTime,from,webLink,importance`
    );
    if (!res.ok) throw new Error(`Graph messages ${res.status}`);
    const json = (await res.json()) as { value?: GraphMessage[] };
    return (json.value || []).map((m) => this.map(m));
  }

  private map(message: GraphMessage): UnifiedData {
    return {
      id: message.id || "",
      source: "outlook",
      title: message.subject || "(제목 없음)",
      content: cleanHtmlContent(message.body?.content || "", message.body?.contentType),
      created_at: message.receivedDateTime || new Date().toISOString(),
      author: {
        name: message.from?.emailAddress?.name || "알 수 없음",
        email: message.from?.emailAddress?.address || undefined,
      },
      url: message.webLink || "",
      status: "pending",
    };
  }

  /** 답장 초안 생성 → 본문 채워 임시보관함 저장. draft id 반환. */
  async saveReplyDraft(messageId: string, draftText: string): Promise<string> {
    const createRes = await this.graph(`/me/messages/${messageId}/createReply`, {
      method: "POST",
    });
    if (!createRes.ok) throw new Error(`createReply ${createRes.status}`);
    const draft = (await createRes.json()) as { id?: string };
    if (!draft.id) throw new Error("createReply returned no id");

    const patchRes = await this.graph(`/me/messages/${draft.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        body: { contentType: "text", content: draftText },
      }),
    });
    if (!patchRes.ok) throw new Error(`draft PATCH ${patchRes.status}`);
    return draft.id;
  }
}
