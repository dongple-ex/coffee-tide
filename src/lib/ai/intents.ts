export interface WidgetIntent {
  type: "widget";
  name: string;
  url: string;
}

export interface ShortcutIntent {
  type: "shortcut";
  keyword: string;
  target: string;
}

export interface ClarificationIntent {
  type: "clarification";
  targetType: "widget" | "shortcut";
  message: string;
}

export type RegistrationIntent = WidgetIntent | ShortcutIntent | ClarificationIntent | null;

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s\)\],]+/i;
const APP_SCHEME_OR_PATH_REGEX = /(?:[a-zA-Z0-9_\-]+:\/\/|[a-zA-Z]:\\[^\s\)\],]+|\/[^\s\)\],]+)/i;

/**
 * 사용자 메시지에서 웹사이트 위젯 또는 바로가기 등록 의도를 추출합니다.
 */
export function extractRegistrationIntent(text: string): RegistrationIntent {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const isWidgetRequest = /(?:위젯|위젯\s*칩|뉴스\s*위젯|사이트\s*위젯|피드\s*위젯)/i.test(trimmed) &&
    /(?:등록|추가|생성|넣어|만들|해줘)/i.test(trimmed);

  const isShortcutRequest = /(?:바로가기|바로\s*가기|단축키|레시피|단어\s*앱)/i.test(trimmed) &&
    /(?:등록|추가|생성|넣어|만들|해줘)/i.test(trimmed);

  if (!isWidgetRequest && !isShortcutRequest) {
    return null;
  }

  // 1. URL / 대상 경로 추출
  let target = "";
  const urlMatch = trimmed.match(URL_REGEX);
  if (urlMatch) {
    target = urlMatch[0];
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `https://${target}`;
    }
  } else {
    const schemeMatch = trimmed.match(APP_SCHEME_OR_PATH_REGEX);
    if (schemeMatch) {
      target = schemeMatch[0];
    }
  }

  if (isWidgetRequest) {
    if (!target) {
      return {
        type: "clarification",
        targetType: "widget",
        message: "등록하실 사이트의 웹 주소(URL)를 함께 알려주세요. (예: `요즘IT https://yozm.wishket.com 위젯 등록해줘`)",
      };
    }

    // 이름 추출 (URL 및 조사/명령어 제거)
    let cleanName = trimmed
      .replace(URL_REGEX, "")
      .replace(APP_SCHEME_OR_PATH_REGEX, "")
      .replace(/[\(\)\[\]]/g, " ")
      .replace(/(?:위젯\s*칩|위젯|사이트|피드|웹사이트|등록|추가|생성|넣어줘|만들어줘|해줘|으로|로|좀)/gi, "")
      .trim();

    if (!cleanName) {
      try {
        const parsed = new URL(target);
        cleanName = parsed.hostname.replace(/^www\./, "").split(".")[0] || "새 위젯";
      } catch {
        cleanName = "새 사이트";
      }
    }

    return {
      type: "widget",
      name: cleanName,
      url: target,
    };
  }

  if (isShortcutRequest) {
    if (!target) {
      return {
        type: "clarification",
        targetType: "shortcut",
        message: "바로가기로 실행할 URL 또는 프로그램 경로를 함께 알려주세요. (예: `깃허브 https://github.com 바로가기 등록해줘`)",
      };
    }

    let cleanKeyword = trimmed
      .replace(URL_REGEX, "")
      .replace(APP_SCHEME_OR_PATH_REGEX, "")
      .replace(/[\(\)\[\]]/g, " ")
      .replace(/(?:바로가기|바로\s*가기|단축키|레시피|단어\s*앱|앱|실행|등록|추가|생성|넣어줘|만들어줘|해줘|으로|로|좀)/gi, "")
      .trim();

    if (!cleanKeyword) {
      try {
        const parsed = new URL(target);
        cleanKeyword = parsed.hostname.replace(/^www\./, "").split(".")[0] || "바로가기";
      } catch {
        cleanKeyword = "바로가기";
      }
    }

    return {
      type: "shortcut",
      keyword: cleanKeyword,
      target,
    };
  }

  return null;
}
