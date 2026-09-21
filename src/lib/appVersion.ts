/**
 * ?¬ìš©?ì—ê²??œì‹œ?˜ëŠ” coffeeTide ë²„ì „ ???¤ì • ?”ë©´ ë°?What's New ëª¨ë‹¬???¸ì¶œ?œë‹¤.
 * ë¦´ë¦¬????package.jsonê³??¨ê»˜ ê°±ì‹ ??ê²? (version.test.ts?ì„œ ?™ê¸°??ê²€ì¦?
 */
export const APP_VERSION = "v1.2.2";

export const LS_LAST_SEEN_VERSION = "coffeetide_last_seen_version";

export interface ReleaseItem {
  type: "feat" | "enhance" | "fix";
  title: string;
  description: string;
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  items: ReleaseItem[];
}

export const RELEASE_HISTORY: ReleaseNote[] = [
  {
    version: "v1.2.2",
    date: "2026-09-21",
    title: "µ¥½ºÅ©Åé ¾Û ¿¬°á ¹®Á¦ ¼öÁ¤",
    summary: "³×Æ®¿öÅ© Á¢±Ù º¸¾È °­È­·Î ÀÎÇØ ·ÎÄÃ À¥¿¡¼­ µ¥½ºÅ©Åé ¹Ù¸®½ºÅ¸·Î ¿¬°áÇÏÁö ¸øÇÏ´ø ¹®Á¦¸¦ ÇØ°áÇß½À´Ï´Ù.",
    items: [
      {
        type: "fix",
        title: "µ¥½ºÅ©Åé ¹Ù¸®½ºÅ¸ ¿¬°á(CORS) ¼öÁ¤",
        description: "·ÎÄÃ È¯°æ(127.0.0.1) ¹× ¹Ì¸®º¸±â(Vercel) ÁÖ¼Ò¿¡¼­µµ º¸Á¶ ¾Û¿¡ Á¤»óÀûÀ¸·Î ¿¬°áÇÒ ¼ö ÀÖµµ·Ï Á¢±Ù ±ÇÇÑ °ËÁõÀ» °³¼±Çß½À´Ï´Ù.",
      },
    ],
  },
  {
    version: "v1.2.1",
    date: "2026-09-20",
    title: "?…ë¬´ ?„í„°Â·AI ?¡ì…˜ ?¤í–‰ & Threads ?¼ë“œ ?ˆì •??,
    summary: "ì¤‘ìš” ?…ë¬´ ?€ ê³ ì • ë°?ê²€???„í„°, AI ?€?”í˜• ?…ë¬´ ì¡°ì‘(?ë™ ?„ë£Œ/ë©”ëª¨/?µì¥ ì´ˆì•ˆ), Threads ?¼ë“œ ?˜ì§‘ ?ˆì •?”ê? ?ìš©?˜ì—ˆ?µë‹ˆ??",
    items: [
      {
        type: "feat",
        title: "AI ì½”íŒŒ?¼ëŸ¿ ?€?”í˜• ?…ë¬´ ì¡°ì‘ (Action Execution)",
        description: "?€?”ì°½?ì„œ '~ ?„ë£Œ ì²˜ë¦¬?´ì¤˜', '~ ì°¾ì•„ì¤?, '~ ë©”ëª¨ ?¨ê²¨ì¤? ???ì—°??ì§€?œë? ?´ë¦¬ë©?ì¦‰ê°?ìœ¼ë¡??¼ê°??ì°¾ì•„ ?„ë£Œ?˜ê³  ë©”ëª¨ ë°??„í„°ë¥??™ê¸°?”í•©?ˆë‹¤.",
      },
      {
        type: "feat",
        title: "?¤ëŠ˜ ?…ë¬´ ê²€??ë°??íƒœë³??„í„° ë°?,
        description: "ì¤‘ìš” ?…ë¬´ ?€ ê³ ì • ê¸°ëŠ¥ê³??¨ê»˜, ?ìŠ¤??ê²€??ë°??„ì²´Â·ë¯¸ì™„ë£ŒÂ·ì™„ë£??íƒœ ?„í„°ë¥??µí•´ ?¼ê°???ì‰½ê²?ì°¾ì„ ???ˆìŠµ?ˆë‹¤.",
      },
      {
        type: "fix",
        title: "Threads ?¼ë“œ ?˜ì§‘ ?€?„ì•„???´ê²° & ?Œì„œ ê°œì„ ",
        description: "Jina Reader ?¤ë” ?˜ì •?¼ë¡œ ?€?„ì•„?ƒì„ ?´ê²°?˜ê³ , ì²¨ë? ?´ë?ì§€/ì°¨íŠ¸ ë°??ë? ?œê°„, ë°˜ì‘ ì§€??ì¢‹ì•„?? ë¦¬í¬?¤íŠ¸, ?“ê?)ë¥??ˆì •?ìœ¼ë¡??˜ì§‘?©ë‹ˆ??",
      },
    ],
  },
  {
    version: "v1.2.0",
    date: "2026-09-14",
    title: "ì§€???„ì¹´?´ë¸Œ RAG & 3D ìº”ë²„??ê³ ë„??,
    summary: "?„ë£Œ ë¬¸ì„œ ì§€???„ì¹´?´ë¸Œ ê²€?‰ê³¼ AI RAG ?°ë™, 3D ?¤ì´?´ë¦¬/ì¹ íŒ ë·°ì–´, AI ì»´íŒ¨?ˆì–¸ ê¸°ì–µ/?±ì¥ ?œìŠ¤?œì´ ?„ì…?˜ì—ˆ?µë‹ˆ??",
    items: [
      {
        type: "feat",
        title: "ì§€???„ì¹´?´ë¸Œ & RAG ê²€???Œì´?„ë¼??,
        description: "ìº”ë²„?¤ì—???„ë£Œ??ë¬¸ì„œë¥?ë¡œì»¬Â·?´ë¼?°ë“œÂ·Google Drive???ˆì „?˜ê²Œ ë³´ê??˜ê³ , AI ì½”íŒŒ?¼ëŸ¿ ë°?ìº”ë²„???•ì¥ ??ì§€??ì¦ê±°(Evidence)ë¡??ë™ ?œìš©?©ë‹ˆ??",
      },
      {
        type: "feat",
        title: "3D ìº”ë²„???¤ì´?´ë¦¬/ì¹ íŒ ë·°ì–´ & Document PiP",
        description: "?‘ë©´ ì±…ì ?¼ì¹¨ ?¨ê³¼, ì¹ íŒ/?¤ì´?´ë¦¬ ì§ˆê° ?Œë§ˆ, ë°˜ì‘???ë™ ??ë§ì¶¤, 50% ì¤?ë°?OS ??ƒ ??Document PiP ë¶„ë¦¬ ì°½ì„ ì§€?í•©?ˆë‹¤.",
      },
      {
        type: "feat",
        title: "AI ì»´íŒ¨?ˆì–¸ Phase 16/17 (ê¸°ì–µÂ·?±ì¥Â·ê´€ê³„ì„±)",
        description: "?€???í”¼?Œë“œ ê¸°ì–µ ë°??ë™ ?”ì•½, ?˜ë¥´?Œë‚˜ë³?ê³ ìœ  ?„ë°”?€, ì¹œë????±ì¥ ?”ì§„ ë°??ì—°?¤ëŸ¬???€???¼ìš°?…ì„ êµ¬í˜„?ˆìŠµ?ˆë‹¤.",
      },
      {
        type: "enhance",
        title: "Google Calendar & Drive ?˜ì§‘ ?°ë™ ?ˆì •??,
        description: "?¸ë? ?œë¹„???¸ì¦ ?íƒœ???°ë¥¸ ë¶€ë¶??¤íŒ¨ ê²©ë¦¬, ?¼ì¼ ?ë™ ë°±ì—… ë°??ˆì „???´ë°± ì²˜ë¦¬ë¥?ê°•í™”?ˆìŠµ?ˆë‹¤.",
      },
      {
        type: "fix",
        title: "?œêµ­???ëª¨ ?¤í? ?ë™ ë³´ì • ë°?AI ?‘ë‹µ ?•ì œ",
        description: "?œê? ?…ë ¥ ?¤ë¥˜ ê°ì? ë°?AI ?ìŠ¤??ë³€????ë°˜ë³µ/?´í–‰ ?‘ë‹µ ?„í„°ë§ì„ ?ìš©?ˆìŠµ?ˆë‹¤.",
      },
    ],
  },
  {
    version: "v1.1.0",
    date: "2026-08-20",
    title: "ëª¨ë°”???ˆì´?„ì›ƒ ë°??Œë§ˆ ìµœì ??,
    summary: "ëª¨ë°”???”ë©´?ì„œ??ë°”ë¦¬?¤í? ?€??ê²½í—˜ê³??¤ì–‘???Œë§ˆ ?¤í??¼ì„ ê°œì„ ?ˆìŠµ?ˆë‹¤.",
    items: [
      {
        type: "enhance",
        title: "ëª¨ë°”??ì±??ˆì´?„ì›ƒ & ??ë¦¬í”Œ?¼ì´ ê°œì„ ",
        description: "ëª¨ë°”???”ë©´ ??— ìµœì ?”ëœ ë°”ë¦¬?¤í? ?€?”ì°½ê³?ê¹”ë”???€?‰íŠ¸ ?œë¡­?¤ìš´ ??ë¦¬í”Œ?¼ì´ë¥?ì§€?í•©?ˆë‹¤.",
      },
      {
        type: "enhance",
        title: "?Œë§ˆ ?¤í???& ?¨ë””ë°”ì´??AI ?€??,
        description: "Notebook ë°??¼ì´???Œë§ˆ ë°°ì? ?œì¸???¥ìƒ ë°?Chrome Built-in AI ì§€???˜ê²½???ˆë‚´?©ë‹ˆ??",
      },
    ],
  },
  {
    version: "v1.0.0",
    date: "2026-07-15",
    title: "coffeeTide ?µí•© ?¤ë§ˆ???Œí¬?¤í˜?´ìŠ¤ ì¶œì‹œ",
    summary: "ìº˜ë¦°?? ???? ?´ë©”?? AI ì½”íŒŒ?¼ëŸ¿???˜ë‚˜ë¡??µí•©???¤ë§ˆ???Œí¬?¤í˜?´ìŠ¤??ì²?ë¦´ë¦¬?¤ì…?ˆë‹¤.",
    items: [
      {
        type: "feat",
        title: "?µí•© ?°ìŠ¤??& ?„ì¹¨ ë¸Œë¦¬??,
        description: "Google/Outlook ?°ë™???µí•œ ?¼ì • ë°??…ë¬´ ?ë™ ?˜ì§‘ê³?AI ?„ì¹¨ ë¸Œë¦¬?‘ì„ ?œê³µ?©ë‹ˆ??",
      },
      {
        type: "feat",
        title: "AI ë°”ë¦¬?¤í? & ?¤ë§ˆ??ìº”ë²„??,
        description: "?ì—°??ê¸°ë°˜ ?…ë¬´ ì¶”ì¶œ, ?¼ì • ?±ë¡, ë¬¸ì„œ ?‘ì„± ë°??¤ì´?´ë¦¬ ê´€ë¦¬ë? ì§€?í•©?ˆë‹¤.",
      },
    ],
  },
];

import { useSyncExternalStore } from "react";

/** ?¬ìš©?ê? ë§ˆì?ë§‰ìœ¼ë¡??•ì¸??ë²„ì „??ë°˜í™˜?©ë‹ˆ?? */
export function getLastSeenVersion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LS_LAST_SEEN_VERSION);
  } catch {
    return null;
  }
}

/** ?„ì¬ ë²„ì „???•ì¸??ê²ƒìœ¼ë¡??€?¥í•©?ˆë‹¤. */
export function setLastSeenVersion(version: string = APP_VERSION): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_LAST_SEEN_VERSION, version);
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new Event("storage"));
    }
  } catch (e) {
    console.warn("[appVersion] Failed to save last seen version:", e);
  }
}

/** ?„ì§ ?•ì¸?˜ì? ?Šì? ?ˆë¡œ???…ë°?´íŠ¸ê°€ ?ˆëŠ”ì§€ ê²€?¬í•©?ˆë‹¤. */
export function hasUnseenUpdate(): boolean {
  if (typeof window === "undefined") return false;
  const lastSeen = getLastSeenVersion();
  if (!lastSeen) return true;
  return lastSeen !== APP_VERSION;
}

const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

/** React 18/19 ê¶Œì¥ useSyncExternalStore ê¸°ë°˜ ìµœì‹  ?…ë°?´íŠ¸ ê°ì? ??*/
export function useHasUnseenUpdate(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasUnseenUpdate(),
    () => false
  );
}

