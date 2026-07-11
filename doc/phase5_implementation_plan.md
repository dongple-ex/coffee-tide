# coffeTide Phase 5 구현 명세서: 양방향 쓰기(Write-Back) 연동 개발

본 문서는 대시보드 내에서 협업 플랫폼(Notion, Outlook)으로 데이터를 역전송 및 변경하여 실제 업무 조치를 완결하는 **양방향 쓰기(Write-Back) 기능**의 구현 명세입니다.

---

## 1. 아키텍처 개요

기존 시스템은 외부 플랫폼의 데이터를 단방향으로 가져와 분석(Read-Only)하는 데 그쳤으나, 본 Phase를 통해 대시보드상에서 즉각적인 조치 완료 피드백을 전달하는 **진정한 AI 업무 비서 시스템**으로 진화합니다.

```
       [ 대시보드 리스트 ] ───────────► 1. Notion: 상태 완료 처리 (Done)
                                    └──► 2. Outlook: AI 기반 정중한 메일 답글 자동 작성
                                                │
                                                ▼
                                    [ 백엔드 API Write-Back ]
                                    - POST /api/tasks/update
                                    - POST /api/mails/reply-draft
```

---

## 2. API 상세 설계

### 2.1 Notion 페이지 상태 업데이트 API (`/api/tasks/update`)
*   **Method**: `POST`
*   **Content-Type**: `application/json`
*   **Request Body**:
    ```json
    {
      "id": "notion_page_uuid_here",
      "status": "completed"
    }
    ```
*   **동작 로직**:
    1. 쿠키 내 `tp_session` 복호화 및 유효성 점검.
    2. `id` 값이 `"mock-"` 로 시작하거나 `MOCK_MODE` 가 `true` 인 경우 `updateMockStatus(id, 'completed')` 를 호출하여 모의 상태를 수정.
    3. 실환경인 경우 Notion SDK Client를 생성하여 `pages.update` 호출. Properties 속성 중 `Status`(혹은 한글명 `상태`)를 `'Done'`(혹은 `'완료'`)으로 업데이트 수행.
*   **Response**:
    - 성공: `{ "success": true, "message": "Notion 페이지 상태 갱신 성공" }` (HTTP 200)
    - 실패: `{ "error": "에러 설명 메세지" }` (HTTP 400 / 500)

### 2.2 Outlook AI 답장 초안 생성 및 저장 API (`/api/mails/reply-draft`)
*   **Method**: `POST`
*   **Content-Type**: `application/json`
*   **Request Body**:
    ```json
    {
      "id": "outlook_mail_id_here",
      "bodyContent": "메일 원본 텍스트 내용..."
    }
    ```
*   **동작 로직**:
    1. 쿠키 내 `tp_session` 검증.
    2. `GeminiHelper.generateReplyDraft(bodyContent)` 를 기동해 메일 원본을 바탕으로 품격 있고 정중한 회신 텍스트 초안 작성.
    3. `MOCK_MODE === 'true'` 이거나 `id` 가 `"mock-"` 로 시작하면 실제 Graph API 호출을 모사하고 작성된 `draftText` 만 담아 200 반환.
    4. 실환경인 경우 MS Graph API `POST /me/messages/{id}/createReply` 를 호출하여 회신용 Draft 메일 껍데기 오브젝트 생성.
    5. 생성된 Draft 메일의 ID를 받아와 본문 내용을 Gemini가 작성한 초안 텍스트로 채워 넣기 위해 `PATCH /me/messages/{draftId}` 호출 및 수정 완료.
*   **Response**:
    - 성공: `{ "success": true, "message": "이메일 답장 초안이 성공적으로 Outlook 임시 보관함에 저장되었습니다.", "draftText": "AI가 쓴 답글..." }` (HTTP 200)

---

## 3. UI/UX 구현 명세 (page.tsx)

1.  **행동 지침 카드 아이템 컴포넌트 하단에 Action Row 추가**:
    - **Notion 아이템 (Notion  Badge 부착)**:
      - 우측 하단에 **"✅ 완료 처리"** 버튼 배치.
      - 클릭 시 API 호출 중인 로딩 인디케이터 연출. 성공 시 Toast 알림을 띄우고 목록을 사일런트 리패치(`fetchMailsSilent`)하여 리스트 상에서 제거 또는 갱신 처리.
    - **Outlook 아이템 (Outlook Badge 부착)**:
      - 우측 하단에 **"✍️ 답장 초안 작성"** 버튼 배치.
      - 클릭 시 로딩 애니메이션 노출. AI 초안 생성이 완료되면 Toast 메시지와 함께 챗봇 응답창 또는 전용 답글 팝업창을 가동하여 작성된 비즈니스 메일 초안을 직접 보여줌.
2.  **모달 혹은 상세 팝업 패널**:
    - 답장 초안이 저장 완료되었음을 알리고, AI가 작성한 원문 텍스트를 대시보드 화면에 노출하여 사용자가 발송 전에 검토할 수 있도록 배려.
