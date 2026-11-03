# 카나나 호출 경로 구현

- 작성일: 2026-10-26
- 대상: Vercel의 CoffeeTide에서 별도 Oracle 카나나 서버 호출
- 승인 범위: 로컬 호출 로직, 환경변수 예시, 테스트, 연결 계약 작성
- 제외: Oracle 설치, 모델 다운로드, 원격 배포, DB 변경, Telegram 웹훅 등록
- 기존 Telegram 작업 및 다른 작업의 미커밋 변경을 보존한다.

## 처리 기준

| 조건 | 처리 |
|---|---|
| 제공자 미설정 또는 gemini | 기존 Gemini 경로 유지 |
| 제공자 kanana | 서버 환경변수의 지정된 API에만 요청 |
| 설정·통신·응답 오류 | 오류 코드 기록 및 로컬 대체 응답, Gemini 자동 재전송 없음 |
| 카나나 요청 | 텍스트 대화·업무 요약만, 자동 도구 실행 없음 |
| 업무 자료 | 기존 사용자별 권한 확인 뒤 cloud_allowed 자료만 전달 |
| 입력 제한 | 질문은 자르지 않고 초과 시 안내, 보조 문맥은 크기 제한 |

## 검증 기록

| 확인 | 실제 결과 |
|---|---|
| 초기 관련 테스트 | 41/41 통과. 이후 공유 경로·시간대 검증 2건 추가 |
| 전체 Vitest | 529건 중 528건 통과, 기존 날짜 의존 테스트 1건 실패 |
| 이번 관련 테스트 | 최종 전체 실행에서 카나나·공통 응답·Telegram 43건 모두 통과 |
| TypeScript | `npm run typecheck` 통과 |
| 변경 소스 ESLint | 카나나·공통 응답·Telegram·Copilot API 6개 파일 통과 |
| 배포용 빌드 | `npm run build` 통과, 기존 Obsidian 파일 추적 경고 2건 |
| 공백 검사 | `git diff --check` 통과 |
| 실제 모델·Oracle·Vercel | 서버 미구축으로 미실행. 설치·다운로드·배포·DB 변경 없음 |
| 브라우저·모바일 | UI 변경 없음. 실기기 검증 미실행 |

시험용 HTTP 서버는 자동 테스트 안에서만 일시적으로 실행하며, 실제 모델이나 Oracle 연결이 아니다. 실제 HTTP를 통해 Bearer 인증, 요청 모델·출력 제한, 자료 정책, 소셜 대화 경계, 문맥 크기 제한, 비밀값 오류 유출 방지, 401/429/500/503, 헤더와 응답 본문 대기 시간 초과, 리디렉션 차단, 잘못된·큰 응답, 요청 간 문맥 분리를 확인했다.

### 실행 환경 제한

첫 Vitest 시도는 Windows 하위 프로세스 제한으로 `Error: spawn EPERM`이 발생했다. 같은 테스트를 허용된 실행 환경에서 다시 실행하여 통과했다. 테스트나 assertion은 약화하지 않았다.

### 기존 테스트 실패

`src/lib/companion/growthAnalyzer.test.ts:97`에서 다음 오류가 발생했다.

```text
AssertionError: expected false to be true // Object.is equality
```

테스트가 `2026-09-25`의 이벤트를 만들고 현재 날짜를 기본값으로 하는 최근 14일 분석을 호출한다. 현재 기준으로 표본 기간 밖에 있어 발생한다. 해당 테스트와 `growthAnalyzer.ts`, `modeEngine.ts`가 HEAD와 동일함을 `git diff --exit-code HEAD -- ...`로 확인했다. 이번 범위에 포함하지 않고 수정하지 않았다.

### 기존 빌드 경고

`src/lib/adapters/obsidian.ts:94,99`의 `Dynamic filesystem access causes tracing of the whole project` 경고 두 건이 남아 있다. 해당 파일은 HEAD와 동일하며 이번에 수정하지 않았다.

## 변경 파일

| 파일 | 이번 변경 |
|---|---|
| `src/lib/ai/kanana.ts` | 서버 전용 API 호출·입력 경계·오류 처리 |
| `src/lib/ai/kanana.test.ts` | 실제 HTTP 시험 서버로 계약 검증 |
| `src/lib/ai/copilotService.ts` | 제공자 분기·공통 응답 유지 |
| `src/lib/ai/copilotService.test.ts` | 기본 동작·카나나 선택·실패 경로 검사 |
| `src/app/api/copilot/route.ts` | 제공자·오류 코드, 실제 전달 자료에 맞춘 근거 반환 |
| `src/lib/telegram/worker.ts` | 작업 결과에 제공자·오류 코드 포함 |
| `.env.example` | 비어 있는 주소·인증값과 실행 설정 이름 |
| `doc/kanana-integration.md` | Oracle와 Vercel 간 API 계약·연결·복구 안내 |

이 작업 폴더의 `update-sources.cjs`는 초기 변경 기록이며 이미 반영된 파일에 다시 실행하지 않는다. 기존 Telegram 미커밋 작업을 이어서 사용하며, 이전 Jira 스크린샷과 관련 없는 변경은 보존했다.

## 다음 검증

Oracle 구축 담당자에게 `doc/kanana-integration.md` PART 2를 전달한다. 전체 HTTPS 주소와 제공 모델 이름을 확인하고 인증값을 배포 환경에 안전하게 설정한 뒤 개발·미리보기 환경에서 실서버 검증을 진행한다. 카나나를 켜기 전까지 제공자 기본값은 Gemini다.
