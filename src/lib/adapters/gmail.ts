// Gmail 어댑터 — 백로그 A1 반영: source는 'gmail' (outlook과 별도 배지).

import { UnifiedData } from "../types/unified";
import { AuthExpiredError } from "./outlook";

interface GmailHeader {
  name: string;
  value: string;
}

export class GmailAdapter {
  constructor(private accessToken: string) {}

  private async api(path: string): Promise<Response> {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (res.status === 401) throw new AuthExpiredError("google");
    return res;
  }

  async fetchRecent(limit = 10): Promise<UnifiedData[]> {
    const listRes = await this.api(`/messages?maxResults=${limit}&labelIds=INBOX`);
    if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`);
    const list = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = (list.messages || []).map((m) => m.id);

    const items: (UnifiedData | null)[] = await Promise.all(
      ids.map(async (id): Promise<UnifiedData | null> => {
        const res = await this.api(
          `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
        );
        if (!res.ok) return null;
        const msg = (await res.json()) as {
          id: string;
          snippet?: string;
          internalDate?: string;
          payload?: { headers?: GmailHeader[] };
        };
        const header = (name: string) =>
          msg.payload?.headers?.find(
            (h) => h.name.toLowerCase() === name.toLowerCase()
          )?.value || "";
        const from = header("From");
        const emailMatch = from.match(/<([^>]+)>/);
        return {
          id: msg.id,
          source: "gmail",
          title: header("Subject") || "(제목 없음)",
          content: msg.snippet || "",
          created_at: msg.internalDate
            ? new Date(Number(msg.internalDate)).toISOString()
            : new Date().toISOString(),
          author: {
            name: from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || "알 수 없음",
            email: emailMatch?.[1],
          },
          url: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
          status: "pending",
        };
      })
    );
    return items.filter((x): x is UnifiedData => x !== null);
  }
}
