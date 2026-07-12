# 수정 기획서: LLM 작업 산출물 연동 (LLM Artifacts Source)

> **상태**: 📋 **기획 (미구현)**. 설계 결정 확정 — **Q1**=경로를 지정해두면 동기화 시 자동 스캔, **Q4**=Obsidian 자동 미러링(동기화 시 오늘 노트 upsert). v2 후보: `.jsonl` 파싱(Q3), 전용 "오늘의 LLM" 섹션, AI 요약 옵트인(§9).
> **관련**: 로컬 파일 기반이라 **데스크톱 전용** — 모바일 전략은 [`8-mobile_strategy.md`](./8-mobile_strategy.md) 참조.

---

## 1. 목적 & 배경

사용자는 로컬 LLM 도구(**Claude Code, Gemini** 등)가 남긴 **작업 산출물 파일**(예: `MEMORY.md`, 세션 메모, 에이전트 출력)을 coffeeTide에서 읽어 **"오늘 처리한 내용"** 을 한눈에 보고 싶다. 또한 그 내용을 **사람이 읽기 좋게 Obsidian**에서 탐색하고 싶다.

즉 두 가지를 붙인다:
1. **수집** — LLM 산출물 폴더를 스캔해 통합 피드(UnifiedData)로 편입 (연동관리에 전용 연동 1개 추가).
2. **Obsidian 미러링** — 오늘의 산출물을 요약해 Obsidian 볼트에 **일일 다이제스트 노트**로 기록 → 백링크로 탐색.

## 2. 사용자 스토리

- (수집) LLM 산출물 폴더를 연동하면, 오늘 생성/수정된 산출물이 대시보드에 `🧠 LLM` 배지로 뜬다.
- (오늘 뷰) "오늘 처리한 내용"을 날짜 기준으로 모아 본다.
- (Obsidian) "오늘 요약 내보내기"를 누르면 볼트에 `coffeeTide_LLM/2026-07-04.md`가 생성/갱신되고, Obsidian에서 원본 파일로의 링크와 함께 읽을 수 있다.

## 3. 산출물 소스 예시 & 포맷

폴더 기반, 포맷 관용적으로 설계(로컬 문서/Obsidian 어댑터와 동일 사상). 우선 대상은 마크다운.

- **Claude Code 메모리**: `~/.claude/projects/<project-slug>/memory/`
  - `MEMORY.md` — 인덱스 파일. `- [Title](file.md) — hook` 형태의 한 줄 포인터 목록.
  - `<slug>.md` — 사실 파일. YAML frontmatter(`name`, `description`, `metadata.type: user|feedback|project|reference`) + 본문.
- **Gemini / 기타**: 사용자가 지정한 임의 폴더의 `.md`/`.txt`.
- 범위(초안): `.md`, `.txt` 우선. `.jsonl`(세션 트랜스크립트)은 v2로 미룸(열린 질문 Q3).

## 4. 데이터 모델 변경

`src/lib/types/unified.ts`의 `UnifiedData['source']` 유니온에 **`'llm'`** 추가.

파일 → UnifiedData 매핑:

| 필드 | 값 |
| :--- | :--- |
| `id` | `llm-` + 파일경로 base64url (Obsidian 캡처 ID 방식 재사용) |
| `source` | `'llm'` |
| `title` | frontmatter `name` → 첫 `#` 헤딩 → 파일명 순 |
| `content` | frontmatter `description` + 본문 발췌(예: 500자). 원문 노출 X, 요약형 |
| `created_at` | 파일 **mtime** (오늘 필터 기준) |
| `author` | 경로/frontmatter로 추론: `Claude` / `Gemini` / `LLM` |
| `url` | `file://...` (또는 볼트 안이면 `obsidian://...`) |
| `category` | 기본 `reference` (선택: AI 분류/규칙 엔진 통과) |

## 5. 신규 연동 (연동관리)

Obsidian/로컬 문서 카드와 동일 패턴.

- **세션 필드** (`SessionData`): `llmArtifactsPath?: string`, (선택) `llmObsidianMirror?: boolean`.
- **연동 카드**: "🧠 LLM 산출물" — 폴더 경로 입력(폴더 선택기 `/api/util/select-folder` 재사용) + 저장/해제. 접힘 배지 `🧠 LLM`.
- **인증 라우트**: `POST /api/auth/llm` (`action: connect|disconnect`, `path`) — `obsidian` 라우트 구조 복제.
- (편의) Claude Code 메모리 폴더 자동 탐지 옵션은 열린 질문 Q1.

## 6. 어댑터 설계

`src/lib/adapters/llmArtifact.ts` — `LocalDocAdapter`/`ObsidianAdapter` 패턴 재사용.

```
class LlmArtifactAdapter {
  constructor(private rootPath: string) {}
  // 폴더 재귀 스캔(.md/.txt), frontmatter/헤딩 파싱 → UnifiedData[]
  async fetchArtifacts(opts?: { todayOnly?: boolean; tz?: string }): Promise<UnifiedData[]>
}
```

- 제외 폴더: `.git`, `.obsidian`, `node_modules` 등(ObsidianAdapter의 `EXCLUDED_DIRS` 재사용).
- `MEMORY.md` 인덱스는 개별 항목이 아니라 "오늘의 개요"로 특별 취급(선택).
- Mock 어댑터도 추가(연동 없이 UI 확인). Factory에 `getLlmAdapter()` 추가 + `MOCK_MODE`/더미 경로 분기.
- `/api/mails`에 `isLlmActive` 분기 추가(Google/Outlook/Notion/Obsidian/LocalDoc과 동일 병렬 수집).

## 7. "오늘 처리한 내용" 뷰

- 수집 시 `todayOnly` 옵션으로 mtime이 오늘(사용자 TZ)인 항목만 강조/필터.
- 대시보드에 전용 섹션 "🧠 오늘의 LLM 작업" 또는 최근 목록에서 `source==='llm'` 필터 토글. (권장: 전용 섹션 — 사용자가 원한 "오늘 처리한 내용"이 핵심 UX)
- 날짜는 서버가 추정하지 말고 사용자 TZ 기준으로 계산(백로그 G4 원칙과 일치).

## 8. Obsidian 미러링 (핵심 — 사람이 읽기)

Obsidian이 연동돼 있으면, 오늘의 LLM 산출물을 **볼트에 일일 다이제스트 노트**로 기록.

- 위치: `<vault>/coffeeTide_LLM/YYYY-MM-DD.md` (하위 폴더는 설정 가능).
- 내용: 날짜 헤더 + 항목별 `- [[원본 or file 링크]] — 요약(1줄)` + 작성 도구(Claude/Gemini) 표기.
- 구현: `ObsidianAdapter`에 정적 메서드 추가 — `writeLlmDigest(vaultPath, dateKey, items)` (기존 `captureTask` 파일 쓰기 패턴 재사용, append가 아니라 날짜 노트 upsert).
- 트리거:
  - **수동(권장 기본)**: 대시보드 "📥 Obsidian에 오늘 요약 내보내기" 버튼 → `POST /api/tasks/llm-digest`.
  - (선택) 자동: 폴링 동기화 시 하루 1회 갱신(열린 질문 Q4).
- 전제: Obsidian 볼트 연동 필요. 미연동 시 버튼 비활성 + 안내.

> 이렇게 하면 Obsidian 그래프에서 날짜 노트 ↔ 원본 파일이 백링크로 연결돼, LLM 작업 이력을 사람이 자연스럽게 탐색.

## 9. AI 요약 (선택, v2)

- `GeminiHelper.summarizeArtifact(text)` 또는 기존 `classifyTasks`로 1줄 요약/분류.
- **프라이버시 주의**: LLM 산출물엔 민감 내용이 있을 수 있음 → 기본은 로컬 발췌만, AI 전송은 **명시적 옵트인**일 때만(설정 토글). 미전송 시 frontmatter description/발췌로 대체.

## 10. API 엔드포인트 (신규)

| 경로 | 메서드 | 설명 |
| :--- | :--- | :--- |
| `/api/auth/llm` | POST | LLM 산출물 폴더 연동/해제 (`llmArtifactsPath` 저장) |
| `/api/mails` | GET | (기존) `isLlmActive`면 LLM 산출물 병합 수집 |
| `/api/tasks/llm-digest` | POST | 오늘 산출물을 Obsidian 볼트에 다이제스트 노트로 기록 |

## 11. UI 변경 (`src/app/page.tsx` / `page.module.css`)

- 연동관리에 "🧠 LLM 산출물" 카드(폴더 경로 입력 + 선택기) 추가. 접힘 배지/상태 라벨.
- `badge_llm` 스타일 추가.
- "🧠 오늘의 LLM 작업" 섹션 + "Obsidian에 오늘 요약 내보내기" 버튼.
- `connections` 응답/상태에 `llm: boolean` 추가(google/outlook/notion/obsidian/local_doc과 동일 패턴 — 스왑 네이밍 재발 주의, `as-built-reference.md` §3 참고).

## 12. 설정 / 보안 / 프라이버시

- 비밀키 불필요(로컬 파일). 편의용 `LLM_ARTIFACTS_DEFAULT_PATH`(선택) 정도.
- 경로 검증(존재/디렉터리), 파일 크기 상한, 바이너리/과대 파일 스킵.
- 산출물 원문은 세션/외부로 보내지 않음(발췌만). AI 요약은 옵트인.

## 13. 제약: 데스크톱 전용

`fs`로 로컬 파일을 읽으므로 **서버=사용자 PC** 전제. Obsidian/로컬 문서와 동일하게 **모바일/클라우드 배포에서는 동작 불가**. 모바일에서는 이 카드를 "데스크톱 전용"으로 숨김/안내 ([`8-mobile_strategy.md`](./8-mobile_strategy.md) §3과 연계).

## 14. 단계별 구현 순서

1. `source: 'llm'` 유니온 추가 + `LlmArtifactAdapter`(스캔·frontmatter 파싱) + Factory + Mock + `/api/mails` 배선.
2. 연동 카드 + `POST /api/auth/llm` + `connections.llm`.
3. "오늘의 LLM 작업" 섹션 + today 필터.
4. Obsidian 미러링 — `ObsidianAdapter.writeLlmDigest` + `POST /api/tasks/llm-digest` + 내보내기 버튼.
5. (선택) AI 요약 옵트인.

## 15. 완료 기준

- Claude 메모리 폴더를 연동하면 오늘 수정된 `MEMORY.md`/사실 파일이 `🧠 LLM` 항목으로 표시된다.
- "오늘 처리한 내용" 섹션에서 당일 산출물만 모아 본다.
- "Obsidian에 오늘 요약 내보내기" → 볼트에 `coffeeTide_LLM/YYYY-MM-DD.md`가 생성되고, Obsidian에서 백링크로 원본을 연다.
- 로컬 파일 어댑터의 부분 실패가 다른 소스 수집을 막지 않는다.

## 16. 열린 질문 (구현 전 결정 필요)

- **Q1** ✅ 결정: 사용자가 **경로만 지정**하면 동기화 시 자동 스캔. (OS별 자동 탐지는 향후 편의 기능으로 보류)
- **Q2** 전용 소스 `'llm'` vs 기존 `local_doc` 확장? → 사용자가 "전용 연동"을 명시 요청했으므로 **전용 `'llm'`** 권장.
- **Q3** 세션 트랜스크립트(`.jsonl`)도 파싱할까? (v1은 `.md`/`.txt`만, v2에서 확장)
- **Q4** ✅ 결정: **자동 미러링**. `/api/mails` 동기화 시 오늘 항목을 볼트 `coffeeTide_LLM/YYYY-MM-DD.md`에 idempotent upsert(내용 동일 시 미기록).
- **Q5** 어떤 도구까지 1급 지원(Claude/Gemini 외 Cursor·Copilot 등)?
