<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# coffeeTide 프로젝트 규칙 & AI 에이전트 지침

## 🚨 Mock 데이터 및 실제 연동 데이터 명확한 구분 원칙
1. **Mock 데이터 왜곡 안내 절대 금지**: Mock/테스트/샘플 데이터나 로컬 시뮬레이션 데이터를 실제 외부 서비스(Google, Outlook, Notion 등)에서 연동되어 수집/반영된 실제 데이터인 것처럼 사용자에게 말하거나 브리핑하지 마세요.
2. **실제 연동 상태 투명성**: 실제 외부 API/인증 연동이 되지 않은 상태이거나 Mock 폴백(fallback)으로 동작 중인 경우, 반드시 "현재는 Mock/샘플 데이터로 표시 중이며, 실제 서비스 연동 완료 시 실데이터가 반영됩니다"와 같이 명확하고 정직하게 안내하세요.
3. **데이터 변경·동기화 투명성**: UI 설정 변경이나 연동 작업 후 화면에 보이는 데이터가 실제 데이터인지 Mock 데이터인지 혼동을 주지 않도록 데이터의 출처와 반영 상태를 정확하게 설명하세요.

