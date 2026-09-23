import type { UnifiedData } from "../types/unified";

export type TaskActionType = "complete" | "add_note" | "search_focus" | "reply_draft";

export interface TaskActionSuccess {
  status: "success";
  type: TaskActionType;
  item: UnifiedData;
  keyword: string;
  note?: string;
  draftInstruction?: string;
  replyText: string;
}

export interface TaskActionAmbiguous {
  status: "ambiguous";
  type: TaskActionType;
  keyword: string;
  candidates: UnifiedData[];
  note?: string;
  draftInstruction?: string;
  replyText: string;
}

export interface TaskActionNotFound {
  status: "not_found";
  type: TaskActionType;
  keyword: string;
  replyText: string;
}

export type TaskActionResult =
  | TaskActionSuccess
  | TaskActionAmbiguous
  | TaskActionNotFound;

/**
 * 일감/업무 명칭 끝에 붙은 불필요한 조사 및 수식어를 깔끔하게 제거하여 정밀한 검색 키워드를 반환합니다.
 * (예: "주간 업무 보고서 건" -> "주간 업무 보고서", "김 대리 메일에" -> "김 대리")
 */
export function cleanTargetKeyword(raw: string): string {
  let text = raw.replace(/^['"“‘]+|['"”’]+$/g, "").trim();

  // 문장 끝부분에 붙은 수식어와 조사를 바깥쪽부터 순차 제거
  for (let i = 0; i < 4; i++) {
    const prev = text;
    text = text.replace(
      /(?:\s+)?(?:에서|에게|으로|까지|부터|관련|관한|대해|대하여|대한|의|을|를|이|가|은|는|에)$/gi,
      ""
    );
    text = text.replace(
      /(?:\s+)?(?:일감|업무|할\s*일|메일|이메일|작업|건|내역|항목)$/gi,
      ""
    );
    text = text.replace(/^['"“‘]+|['"”’]+$/g, "");
    text = text.replace(/[\(\)\[\]\{\}]/g, " ").trim();
    if (text === prev) break;
  }

  return text.replace(/\s+/g, " ");
}

/**
 * 일감 목록에서 주어진 키워드나 번호와 가장 일치하는 항목들을 찾습니다.
 */
export function matchTasks(
  keyword: string,
  items: UnifiedData[],
  options?: { includeCompleted?: boolean }
): UnifiedData[] {
  const cleanKey = cleanTargetKeyword(keyword).toLowerCase();
  if (!cleanKey) return [];

  // 1. 미완료 항목 우선 필터링 (명시적 요청이 없는 한)
  const candidatePool = options?.includeCompleted
    ? items
    : items.filter((i) => i.status !== "completed" && i.status !== "dismissed");

  // 번호는 직전에 제시한 후보 목록에서만 해석한다.
  if (/^#?\d+번?$/.test(cleanKey)) return [];

  // 2. 제목 완전 일치 (대소문자 무시)
  const exactTitleMatches = candidatePool.filter(
    (item) => item.title.trim().toLowerCase() === cleanKey
  );
  if (exactTitleMatches.length === 1) return exactTitleMatches;

  // 3. 제목 서브스트링 포함 일치
  const titleSubstringMatches = candidatePool.filter((item) =>
    item.title.toLowerCase().includes(cleanKey)
  );
  if (titleSubstringMatches.length > 0) return titleSubstringMatches;

  // 4. 단어 단위 일치 (공백 분리 토큰 중 하나라도 제목에 포함)
  const tokens = cleanKey.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length > 0) {
    const tokenMatches = candidatePool.filter((item) => {
      const lowerTitle = item.title.toLowerCase();
      return tokens.every((token) => lowerTitle.includes(token));
    });
    if (tokenMatches.length > 0) return tokenMatches;
  }

  // 5. 내용(content) 검색 (fallback)
  const contentMatches = candidatePool.filter((item) =>
    item.content.toLowerCase().includes(cleanKey)
  );
  return contentMatches;
}

/**
 * 사용자의 자연어 질문/명령에서 일감 제어 액션(완료, 메모, 검색, 답장)을 감지하고 실행 결과를 생성합니다.
 */
export function parseTaskActionIntent(
  text: string,
  items: UnifiedData[],
  pending?: TaskActionAmbiguous | null
): TaskActionResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // 조회·부정·인용 요청은 업무 변경으로 해석하지 않는다.
  if (/(?:하지\s*(?:마|말|않)|(?:완료|처리)\s*여부|상태\s*만|번역|라는\s*문장)/.test(trimmed)) return null;
  if (pending) {
    const selectionPattern = {
      complete: /^#?(\d+)번?(?:\s*(?:완료(?:해줘)?|선택))?$/,
      add_note: /^#?(\d+)번?(?:\s*(?:메모(?:해줘)?|선택))?$/,
      reply_draft: /^#?(\d+)번?(?:\s*(?:답장(?:\s*써줘)?|선택))?$/,
      search_focus: /^#?(\d+)번?$/,
    };
    const selection = trimmed.match(selectionPattern[pending.type]);
    const candidate = selection
      ? pending.candidates[Number(selection[1]) - 1]
      : pending.candidates.find(item => item.title === trimmed.replace(/^['"]|['"]$/g, ""));
    if (selection || candidate) {
      const item = candidate && items.find(current => current.id === candidate.id && current.source === candidate.source);
      if (!item || (pending.type !== "reply_draft" && (item.status === "completed" || item.status === "dismissed"))) {
        return { status: "not_found", type: pending.type, keyword: trimmed, replyText: "선택한 후보가 없거나 상태가 바뀌었습니다. 업무 제목을 포함해 다시 요청해 주세요." };
      }
      return { ...pending, status: "success", item, keyword: item.title, replyText: `선택한 업무: ${item.title}` };
    }
  }

  // ──────────────────────────────────────────────
  // 1. 메모 작성 의도 (메모 남겨줘, 메모 추가, 메모: ...)
  // ──────────────────────────────────────────────
  const noteMatch =
    trimmed.match(
      /^(?:'|")?(.+?)(?:'|")?(?:일감|업무|건|메일|항목)?에\s+(?:메모|노트)\s*[:：]\s*(.+)$/i
    ) ||
    trimmed.match(
      /^(?:'|")?(.+?)(?:'|")?(?:일감|업무|건|메일|항목)?에\s+(?:['"]?(.+?)['"]?)(?:이라고|라고|로)?\s*(?:메모|노트)(?:를|을)?\s*(?:남겨|적어|기록|추가|저장|써|작성)(?:해줘|줘|달라|바라|요|부탁)?$/i
    );

  if (noteMatch) {
    const rawTarget = noteMatch[1];
    const rawNote = noteMatch[2].trim();
    const cleanKey = cleanTargetKeyword(rawTarget);
    const matched = matchTasks(cleanKey, items);

    if (matched.length === 1) {
      const item = matched[0];
      return {
        status: "success",
        type: "add_note",
        item,
        keyword: cleanKey,
        note: rawNote,
        replyText: `📝 **'${item.title}'** 일감에 메모를 기록했습니다:\n> "${rawNote}"\n\n오늘 업무 카드에서도 바로 확인하실 수 있습니다.`,
      };
    }
    if (matched.length > 1) {
      const list = matched.slice(0, 4).map((i, idx) => `${idx + 1}. ${i.title}`).join("\n");
      return {
        status: "ambiguous",
        type: "add_note",
        keyword: cleanKey,
        note: rawNote,
        candidates: matched.slice(0, 4),
        replyText: `'${cleanKey}' 관련 일감이 ${matched.length}건 있습니다. 어떤 일감에 메모를 남길까요?\n\n${list}\n\n일감 번호나 전체 제목을 말씀해 주시면 메모를 남겨드릴게요.`,
      };
    }
    return {
      status: "not_found",
      type: "add_note",
      keyword: cleanKey,
      replyText: `미완료 업무 목록에서 **'${cleanKey}'** 관련 일감을 찾지 못했습니다. 일감 제목을 다시 확인해 주시거나 새 업무로 추가해 주세요.`,
    };
  }

  // ──────────────────────────────────────────────
  // 2. 답장 초안 작성 의도 (메일에 답장 써줘, 회신 초안)
  // ──────────────────────────────────────────────
  const replyMatch =
    trimmed.match(
      /^(?:'|")?(.+?)(?:'|")?(?:메일|이메일|업무|건)?에\s+(?:(?:['"]?(.+?)['"]?)(?:이라고|라고|로)?\s*)?(?:답장|회신)(?:을|를)?\s*(?:써줘|작성해줘|만들어줘|준비해줘|초안)$/i
    ) ||
    trimmed.match(
      /^(?:'|")?(.+?)(?:'|")?(?:메일|이메일)?\s*(?:답장|회신)\s*(?:써줘|작성해줘|초안)$/i
    );

  if (replyMatch) {
    const rawTarget = replyMatch[1];
    const draftInstruction = replyMatch[2]?.trim();
    const cleanKey = cleanTargetKeyword(rawTarget);
    const matched = matchTasks(cleanKey, items.filter(item => item.source === "gmail" || item.source === "outlook"), { includeCompleted: true });

    if (matched.length === 1) {
      const item = matched[0];
      return {
        status: "success",
        type: "reply_draft",
        item,
        keyword: cleanKey,
        draftInstruction,
        replyText: `✉️ **'${item.title}'**에 대한 답장 초안 창을 열었습니다. 내용을 확인하고 검토해 보세요.`,
      };
    }
    if (matched.length > 1) {
      const list = matched.slice(0, 4).map((i, idx) => `${idx + 1}. ${i.title}`).join("\n");
      return {
        status: "ambiguous",
        type: "reply_draft",
        keyword: cleanKey,
        draftInstruction,
        candidates: matched.slice(0, 4),
        replyText: `'${cleanKey}' 관련 항목이 ${matched.length}건 있습니다. 어떤 건에 답장을 쓸까요?\n\n${list}`,
      };
    }
    return {
      status: "not_found",
      type: "reply_draft",
      keyword: cleanKey,
      replyText: `메일 목록에서 **'${cleanKey}'** 관련 항목을 찾지 못했습니다. 보낸 사람이나 메일 제목을 확인해 주세요.`,
    };
  }

  // ──────────────────────────────────────────────
  // 3. 일감 완료 의도 (완료해줘, 완료했어, 끝냈어, 처리해줘, 다했어)
  // ──────────────────────────────────────────────
  const completePattern =
    /^(?:'|")?(.+?)(?:'|")?(?:일감|업무|할\s*일|건|작업|체크박스)?\s*(?:완료했어|완료했음|완료했다|완료해줘|완료\s*처리(?:해줘)?|완료|끝냈어|끝냈음|끝냈다|다했어|다했다|마쳤어|마쳤음|해결했어)$/i;

  const isCompleteCmd =
    completePattern.test(trimmed) ||
    /^(?:완료)\s+(?:'|")?(.+?)(?:'|")?$/i.test(trimmed);

  if (isCompleteCmd) {
    let rawTarget = "";
    const m1 = trimmed.match(completePattern);
    if (m1) {
      rawTarget = m1[1];
    } else {
      const m2 = trimmed.match(/^(?:완료)\s+(?:'|")?(.+?)(?:'|")?$/i);
      if (m2) rawTarget = m2[1];
    }

    const cleanKey = cleanTargetKeyword(rawTarget);
    if (!cleanKey) return null;

    const matched = matchTasks(cleanKey, items);

    if (matched.length === 1) {
      const item = matched[0];
      return {
        status: "success",
        type: "complete",
        item,
        keyword: cleanKey,
        replyText: `✅ **'${item.title}'** 일감을 완료 처리했습니다! 👏\n오늘 업무 탭과 상단 통계에도 즉시 반영되었습니다.`,
      };
    }
    if (matched.length > 1) {
      const list = matched.slice(0, 4).map((i, idx) => `${idx + 1}. ${i.title}`).join("\n");
      return {
        status: "ambiguous",
        type: "complete",
        keyword: cleanKey,
        candidates: matched.slice(0, 4),
        replyText: `'${cleanKey}' 관련 일감이 ${matched.length}건 있습니다. 어떤 일감을 완료할까요?\n\n${list}\n\n"1번 완료해줘"처럼 번호를 말씀해 주셔도 바로 완료됩니다.`,
      };
    }
    return {
      status: "not_found",
      type: "complete",
      keyword: cleanKey,
      replyText: `현재 미완료 업무 목록에서 **'${cleanKey}'** 일감을 찾지 못했습니다. 이미 완료되었거나 제목이 다를 수 있으니 확인해 주세요.`,
    };
  }

  // ──────────────────────────────────────────────
  // 4. 일감 검색 및 오늘 업무 필터 연동 의도 (찾아줘, 검색해줘, 보여줘)
  // ──────────────────────────────────────────────
  const searchPattern =
    /^(?:'|")?(.+?)(?:'|")?(?:일감|업무|할\s*일|건|메일)?\s*(?:찾아줘|검색해줘|보여줘|필터해줘|조회해줘|어디\s*있어)$/i;

  const isSearchCmd = searchPattern.test(trimmed);
  if (isSearchCmd) {
    const m = trimmed.match(searchPattern);
    const rawTarget = m ? m[1] : "";
    const cleanKey = cleanTargetKeyword(rawTarget);
    if (!cleanKey) return null;

    const matched = matchTasks(cleanKey, items, { includeCompleted: true });

    if (matched.length > 0) {
      const item = matched[0];
      const countNotice =
        matched.length === 1
          ? `**'${item.title}'** 일감을 찾았습니다.`
          : `'${cleanKey}' 관련 일감 ${matched.length}건을 찾았습니다. (대표: **${item.title}**)`;

      return {
        status: "success",
        type: "search_focus",
        item,
        keyword: cleanKey,
        replyText: `🔍 ${countNotice}\n\n오늘 업무 탭의 검색 필터를 **'${cleanKey}'**(으)로 자동 설정해 두었습니다.`,
      };
    }

    return {
      status: "not_found",
      type: "search_focus",
      keyword: cleanKey,
      replyText: `검색어 **'${cleanKey}'**에 해당하는 일감을 찾지 못했습니다. 다른 검색어로 다시 찾아보시겠어요?`,
    };
  }

  return null;
}
