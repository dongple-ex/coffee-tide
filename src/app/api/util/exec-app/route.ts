// 단어-앱 바로가기 실행기 (J2) — "서버 = 사용자 PC" 전제의 데스크톱 전용 기능.
//
// 보안 원칙:
//  1) 셸을 거치지 않는다. exec("start ...")처럼 문자열을 조합하면 target에 따옴표/&를 넣어
//     임의 명령을 실행할 수 있다. 항상 spawn(cmd, [args])로 인자를 분리해 넘긴다.
//  2) 실행 대상은 화이트리스트를 통과한 것만 — 스킴이 허용된 URL, 또는 확장자가 허용된 절대 경로.
//  3) 클라우드/서버리스 배포에서는 아예 비활성화한다(그곳의 "서버"는 사용자 PC가 아니다).

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { access, constants } from "fs/promises";
import path from "path";
import { readSession, unauthorized } from "@/lib/auth/cookies";

/** 브라우저·설치 앱 딥링크에서 실제로 쓰는 스킴만 허용 */
const ALLOWED_URL_SCHEMES = new Set([
  "http:",
  "https:",
  "mailto:",
  "kakaomap:",
  "kakaotalk:",
  "nmap:",
  "notion:",
  "obsidian:",
  "slack:",
  "ms-teams:",
  "zoommtg:",
]);

/**
 * 로컬 실행 파일 확장자.
 * `.bat`/`.cmd`/`.ps1`/`.sh`는 제외한다 — 인터프리터가 인자를 다시 파싱해 주입 경로가 생긴다.
 */
const ALLOWED_EXECUTABLE_EXTS = new Set([".exe", ".lnk", ".app"]);

const MAX_TARGET_LENGTH = 500;

type Classified =
  | { kind: "url"; value: string }
  | { kind: "path"; value: string }
  | { kind: "invalid"; reason: string };

function classifyTarget(raw: string): Classified {
  const trimmed = raw.trim();

  if (!trimmed) return { kind: "invalid", reason: "실행 대상이 비어 있습니다." };
  if (trimmed.length > MAX_TARGET_LENGTH) {
    return { kind: "invalid", reason: "실행 대상 경로가 너무 깁니다." };
  }
  // 제어문자(개행 포함)는 어떤 정상 경로/URL에도 없다
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return { kind: "invalid", reason: "실행 대상에 허용되지 않는 문자가 있습니다." };
  }

  // 경로 판정을 URL 파싱보다 먼저 한다 — "C:\..."는 new URL()에서 프로토콜 "c:"로 잘못 잡힌다
  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\");
  const isPosixPath = trimmed.startsWith("/");

  if (isWindowsPath || isPosixPath) {
    const ext = path.extname(trimmed).toLowerCase();
    if (!ALLOWED_EXECUTABLE_EXTS.has(ext)) {
      return {
        kind: "invalid",
        reason: `실행할 수 없는 파일 형식입니다(${ext || "확장자 없음"}). 허용: ${[...ALLOWED_EXECUTABLE_EXTS].join(", ")}`,
      };
    }
    return { kind: "path", value: trimmed };
  }

  try {
    const url = new URL(trimmed);
    if (!ALLOWED_URL_SCHEMES.has(url.protocol)) {
      return { kind: "invalid", reason: `허용되지 않은 링크 형식입니다(${url.protocol}).` };
    }
    return { kind: "url", value: url.toString() };
  } catch {
    return {
      kind: "invalid",
      reason: "실행 대상은 절대 경로(C:\\... 또는 /...)이거나 http(s)·앱 딥링크여야 합니다.",
    };
  }
}

/** 클라우드/서버리스 배포에서는 로컬 실행을 제공하지 않는다 */
function isLocalExecDisabled(): boolean {
  if (process.env.DISABLE_LOCAL_EXEC === "true") return true;
  return Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
  );
}

/** 셸 없이 프로세스를 띄우고, 종료를 기다리지 않는다(앱이 닫힐 때까지 요청이 매달리면 안 된다) */
function launch(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      cwd,
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return unauthorized();

  if (isLocalExecDisabled()) {
    return NextResponse.json(
      { error: "이 배포에서는 로컬 프로그램 실행을 지원하지 않습니다(데스크톱 전용 기능)." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { target?: string };
  if (!body.target || typeof body.target !== "string") {
    return NextResponse.json({ error: "실행 대상(target)이 필요합니다." }, { status: 400 });
  }

  const classified = classifyTarget(body.target);
  if (classified.kind === "invalid") {
    return NextResponse.json({ error: classified.reason }, { status: 400 });
  }

  try {
    if (classified.kind === "path") {
      await access(classified.value, constants.F_OK).catch(() => {
        throw new Error("경로를 찾을 수 없습니다. 바로가기 설정을 확인해 주세요.");
      });

      if (process.platform === "win32") {
        // .lnk는 실행 파일이 아니라 셸 링크라 직접 spawn할 수 없다 — explorer가 해석한다
        if (path.extname(classified.value).toLowerCase() === ".lnk") {
          await launch("explorer.exe", [classified.value]);
        } else {
          await launch(classified.value, [], path.dirname(classified.value));
        }
      } else if (process.platform === "darwin") {
        await launch("open", [classified.value]);
      } else {
        await launch("xdg-open", [classified.value]);
      }
    } else {
      // URL·딥링크는 OS 기본 핸들러에 위임 (인자 배열로 넘기므로 셸 해석이 없다)
      if (process.platform === "win32") {
        await launch("explorer.exe", [classified.value]);
      } else if (process.platform === "darwin") {
        await launch("open", [classified.value]);
      } else {
        await launch("xdg-open", [classified.value]);
      }
    }

    return NextResponse.json({ success: true, target: classified.value });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[coffeeTide] Exec app failed:", message);
    return NextResponse.json({ error: `프로그램 실행 실패: ${message}` }, { status: 500 });
  }
}
