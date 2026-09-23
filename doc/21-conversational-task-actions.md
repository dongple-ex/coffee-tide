# AI 바리스타 대화형 업무 조작

기준: 2026-09-23 · 로컬 소스 `ea4bcb5` · 앱 1.2.2

## 1. 현재 처리 구조

`page.tsx`의 `askCopilot()`에서 바로가기·명령 처리 이후 `parseTaskActionIntent()`로 업무 조작을 검사한다. 인식된 요청은 `executeTaskAction()`과 화면 핸들러를 통해 처리하고, 그 외 요청은 서버 Copilot 경로로 보낸다.

이 기능은 모든 자연어를 이해하는 모델 도구 실행이 아니라, 정해진 한국어 패턴과 현재 병합 업무 목록을 사용하는 처리 경로다. 외부 저장 조건은 동작별로 다르다.

## 2. 지원 요청

| 동작 | 예시 | 실제 반영 범위 |
|---|---|---|
| 완료 | `주간 보고서 완료해줘` | Notion·Obsidian은 해당 원본에 write-back, 나머지는 CoffeeTide 내부 상태 |
| 메모 | `주간 보고서에 메모: 검토 대기` | 기존 워크노트 뒤에 줄바꿈하여 추가 |
| 검색 | `주간 보고서 찾아줘` | 오늘 업무 검색어를 설정하고 상태 필터를 전체로 변경 |
| 답장 | `견적 메일에 정중하게 답장 써줘` | Gmail·Outlook 항목의 초안 생성. 조건을 만족하는 Outlook만 임시보관함 저장 |

답장을 전송하는 기능은 아니다. Cloud Tool Registry의 승인형 Calendar·Drive 쓰기와도 별도 경로다. 단일 후보가 명확한 업무 완료·메모에는 공통 확인 모달이 추가로 나타나는 구조가 아니다.

## 3. 후보 선택과 변경 방어

- 제목 완전 일치 → 제목 부분 일치 → 모든 검색 토큰 일치 → 본문 검색 순서로 후보를 찾는다.
- 완료·메모는 완료·숨김 항목을 기본 후보에서 제외한다. 답장은 Gmail·Outlook으로 제한하며 완료된 메일도 후보가 될 수 있다.
- 여러 후보가 있으면 최대 4개를 번호와 함께 제시한다. 번호는 직전에 제시한 후보 배열에서만 해석한다.
- 후보는 사용자와 `copilot`/`mini`/`companion` 채널별로 분리한다. 5분이 지나거나 다른 요청으로 소비되면 폐기한다.
- 후속 선택 시 ID·source·현재 상태를 다시 대조한다. 사라졌거나 상태가 바뀐 항목을 오래된 후보로 변경하지 않는다.
- 부정·상태 조회·번역 문형 일부를 변경 요청에서 제외하고 동시 업무 액션을 막는 busy 가드를 둔다. 모든 한국어 표현의 오인식이 해소되었다는 보장은 아니다.

## 4. 저장 결과의 구분

- `/api/tasks/update`는 `notion`·`obsidian`만 허용하고 그 외 소스는 400으로 거부한다. Mock 응답은 Mock이라고 표시한다.
- 외부 완료는 서버 응답을 기다린 뒤 결과 문구를 만든다. 내부 완료는 ‘CoffeeTide에서 완료’로 표시한다.
- 메모는 `appendTaskNote()`로 기존 내용을 보존한다.
- 답장 요청의 원문과 `instruction`을 분리해 모델에 전달한다. 작성 지시는 최대 1,000자다.
- `generateReplyDraft()`는 생성 여부를 반환한다. AI를 사용할 수 없으면 기본 예시 문구임을 표시하고 Outlook 저장을 하지 않는다.
- Gmail은 현재 읽기 권한 기반이므로 임시보관함에 쓰지 않는다. Outlook 저장 실패 시에도 생성된 초안은 돌려주며, 반환 메시지로 저장 실패를 안내한다. HTTP 성공이나 초안 존재를 외부 저장 성공으로 해석하면 안 된다.

## 5. 구현 위치와 검증

- `src/lib/ai/taskActions.ts`: 의도·후보 해석.
- `src/lib/ai/taskActionExecution.ts`: 소스별 실행·메모 추가·결과 메시지.
- `src/app/page.tsx`: 사용자·채널별 후보 수명, 화면 필터, 실행 핸들러 연결.
- `src/app/api/tasks/update/route.ts`, `src/app/api/mails/reply-draft/route.ts`, `src/lib/ai/gemini.ts`: 외부 쓰기·생성 경계.

2026-09-23 아래 5개 파일을 실행하여 **39개 테스트 통과**:

```powershell
npx vitest run src/lib/ai/taskActions.test.ts src/lib/ai/taskActionExecution.test.ts src/app/api/mails/reply-draft/route.test.ts src/app/api/tasks/update/route.test.ts src/app/api/util/window-control/window-control.test.ts
```

테스트는 의도 해석·실행 계약과 모의 외부 응답 검증이다. 실제 Google/Outlook/Notion 계정, Obsidian 파일, 모델 생성, 배포 반영은 이번 문서 갱신에서 재검증하지 않았다. 후속 확인은 백로그 M1을 따른다.
