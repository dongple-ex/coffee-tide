# coffeTide

**커피 한 잔 하면서 오늘을 정리하는 AI 개인 비서**

연동이 없어도 manual/paste로 바로 시작할 수 있는, 연결되면 더 강력해지는 시간 관리 비서입니다.

- **서비스 도메인(예정)**: `coffeTide.dongple.kr`
- **이전 프로젝트명**: TimePilot — 역사 문서의 TimePilot 표기는 coffeTide를 가리킵니다.
- **현재 상태**: **MVP 구현 완료 (2026-07-11)** — 무연동 코어(manual/paste·Copilot·자동화 규칙)와 6종 연동(Outlook·Gmail·Notion·Obsidian·로컬 문서·LLM 산출물) 구조가 동작합니다. 외부 OAuth는 실계정 검증 전입니다(`doc/7-backlog.md` H 항목).

## 핵심 가치
- 무연동 우선 설계
- 자연스러운 업무 입력 (manual, paste)
- AI Copilot + 자동화
- 다중 플랫폼 연결
- 웹 우선 (모바일 전략: `doc/8-mobile_strategy.md`)

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # MOCK_MODE=true 로 두면 연동/키 없이 바로 체험 가능
npm run dev                  # http://localhost:3000
```

- `SESSION_ENCRYPTION_SECRET`은 프로덕션 필수입니다 (미설정 시 기동 거부).
- `GEMINI_API_KEY`가 없으면 AI 기능은 로컬 FallbackEngine으로 자동 대체됩니다.

## 검증

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # next build
```

## 문서 위치
- `doc/` : 모든 설계 및 기획 문서 — 읽기 순서는 [`doc/README.md`](./doc/README.md) 참조
- 구현 기준 기술 레퍼런스: [`doc/as-built-reference.md`](./doc/as-built-reference.md)
