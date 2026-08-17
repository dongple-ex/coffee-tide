# 15. 비용 관리·월별 분석·영수증 설계 및 구현 계획

> 상태: **설계 완료 · 구현 전**  
> 기준일: 2026-08-17  
> 구현 담당: Gemini  
> 관련 문서: [`14-data-storage-ai-knowledge-architecture-plan.md`](./14-data-storage-ai-knowledge-architecture-plan.md), [`spec/phase14-02-data-contract-schema.md`](./spec/phase14-02-data-contract-schema.md), [`spec/phase14-05-cost-voice-quick-capture.md`](./spec/phase14-05-cost-voice-quick-capture.md)

## 1. 목적

현재 CoffeeTide의 비용 기능은 자연어 분석, 구조화 입력 확인, Supabase 원자적 등록, 통화별 단순 합계까지 제공한다. 이 계획은 기록한 비용을 다시 찾고 관리하며 월별·분류별 흐름을 파악할 수 있는 완결된 비용 관리 화면으로 확장한다.

구현 범위는 다음 다섯 가지다.

1. 비용 내역 목록과 기간·분류·통화 필터
2. 기존 비용 수정과 소프트 삭제
3. 월별 합계표, 분류별 분석표, 접근 가능한 간단한 차트
4. 영수증 사진 첨부·조회·교체·삭제
5. 현재 필터 기준 Google Sheets·CSV 내보내기

### 명시적 제외 범위

- 경비청구 상태 관리
- 세금공제·부가세·증빙 적격성 관리
- 회계 전표, 법인카드 승인내역 자동 대사
- OCR을 이용한 영수증 자동 인식
- 서로 다른 통화를 임의 환산하여 하나의 총액으로 합산

DB에 이미 존재하는 `tax_deductible`, `reimbursable` 필드는 하위 호환을 위해 유지하되 이번 UI와 API 입력에는 노출하지 않는다.

## 2. 현재 기준선

### 이미 구현되어 있고 재사용할 것

| 영역 | 현재 위치 | 상태 |
|---|---|---|
| 자연어 비용 분석 | `src/lib/expenses/parser.ts`, `POST /api/expenses/parse` | 구현됨 |
| 비용 등록 | `POST /api/expenses` | `create_expense_with_item` RPC로 원자적 저장 |
| 비용 조회 | `GET /api/expenses` | 최근 내역 조회 API는 있으나 화면 목록 없음 |
| 단순 합계 | `GET /api/expenses/summary` | 통화별 총액·건수만 제공 |
| 데이터 계약 | `WorkspaceItem`, `ExpenseEntry` | 구현됨 |
| 영수증 저장 기반 | `POST /api/assets`, `content_assets`, `private-assets` | 비공개 이미지 저장 가능 |
| 첨부 다운로드 | `GET /api/assets/[id]/download` | 60초 서명 URL 발급 |
| Google 파일 권한 | `src/lib/auth/google.ts`의 `drive.file` | 앱이 생성한 Google 파일에 접근 가능 |
| 사용자 격리 | Supabase Auth + RLS | 구현됨 |

### 현재 부족한 점

- 등록된 비용을 화면에서 다시 볼 수 없다.
- 수정·삭제 API가 없다.
- 삭제된 공통 항목이 비용 합계에 계속 포함될 가능성이 있다.
- 월별·분류별 집계 계약이 없다.
- 영수증 첨부 UI와 비용-자산 연결 흐름이 없다.
- 비용 저장 실패 원인이 사용자에게 구체적으로 전달되지 않는다.
- 게스트 상태에서도 입력 폼이 활성화되어 마지막 저장 단계에서만 `401`이 발생한다.
- 비용 Google Sheets·CSV 내보내기 기능은 아직 없다.

## 3. 핵심 원칙

1. **로그인 사용자 전용**: 비용과 영수증은 Supabase 로그인 상태에서만 저장·조회한다.
2. **통화 분리**: KRW, USD, JPY 등 서로 다른 통화는 항상 별도 합계와 차트로 표시한다.
3. **공통 루트 유지**: 비용은 `unified_items`의 `item_type='expense'`와 `expense_entries`를 한 쌍으로 관리한다.
4. **소프트 삭제**: 사용자 삭제는 `unified_items.deleted_at`을 기록하고 기본 조회에서 제외한다.
5. **부분 실패 허용**: 비용 저장 성공 후 영수증 업로드가 실패해도 비용 기록은 유지하며 재첨부를 허용한다.
6. **비공개 영수증**: 영수증은 공개 URL이 아닌 `private-assets` 버킷과 단기 서명 URL만 사용한다.
7. **모바일 우선**: 모바일 한 손 조작, 44px 터치 영역, 긴 목록의 점진적 로딩을 보장한다.
8. **기존 업무와 분리**: 비용은 업무 수·완료 수·알림·행동 지침·업무 재배치에 포함하지 않는다.
9. **페이지 대형화 방지**: `page.tsx`에 비용 로직을 추가하지 않고 비용 전용 컴포넌트와 훅으로 분리한다.
10. **내보내기 보안**: CSV 수식 주입을 차단하고 Sheets 값은 `RAW` 모드로 기록하며 현재 로그인 사용자의 활성 비용만 포함한다.

## 4. 사용자 경험

### 4.1 비용 탭 기본 화면

```text
빠른 추가 / 업무 / 메모·회의록 / [비용]

[자연어 비용 입력                         ] [마이크] [분석]

이번 달 요약
KRW 325,000 · 12건    USD 48.00 · 2건

[월별 추이] [분류별]
┌──────────────────────────────────────┐
│ 8월  ███████████  325,000 KRW        │
│ 7월  ███████      210,000 KRW        │
└──────────────────────────────────────┘

기간 [2026-08-01]~[2026-08-31]  분류 [전체]  통화 [전체]
[CSV 다운로드] [Google Sheets로 내보내기]  ← 현재 필터 결과 사용

비용 내역
8/17 카페 · 식비                         25,000 KRW
법인카드 · 영수증 1장                    [수정] [삭제]
```

### 4.2 등록 흐름

```text
자연어 입력 또는 음성 전사
  → 분석
  → 금액·통화·분류·결제수단·사용처·일시 확인
  → 선택적으로 영수증 사진 추가
  → 비용 등록 RPC 성공
  → 영수증 업로드 시도
  → 목록·요약·차트 갱신
```

영수증 업로드 실패 시 비용을 롤백하지 않는다. 다음 메시지와 재시도 버튼을 제공한다.

> 비용은 저장했지만 영수증은 올리지 못했습니다. 목록에서 다시 첨부할 수 있습니다.

### 4.3 수정 흐름

- 목록 행의 `수정`을 누르면 모바일은 바텀시트, 데스크톱은 카드 내부 편집 또는 모달을 연다.
- 수정 가능 필드: 금액, 통화, 분류, 결제수단, 사용처, 사용 일시, 제목.
- 저장 전 기존 값과 변경 값을 표시할 필요는 없지만, 저장 중 중복 클릭을 막는다.
- 수정 성공 후 목록·합계·차트를 모두 재조회한다.
- 수정 실패 시 편집값을 유지하고 오류를 표시한다.

### 4.4 삭제 흐름

- 확인 문구: `이 비용을 목록과 분석에서 제외할까요? 영수증도 더 이상 표시되지 않습니다.`
- 확인 후 공통 항목을 소프트 삭제한다.
- 목록에서 즉시 제거하고 요약을 재조회한다.
- 10초 동안 `실행 취소`를 제공하는 것은 권장 사항이다. 구현한다면 별도 복원 API가 필요하다.
- 1차 구현에서 실행 취소를 생략할 경우 물리 삭제를 대신 사용해서는 안 된다.

### 4.5 영수증 흐름

- 지원 형식: JPEG, PNG, WebP.
- 클라이언트 선택 제한과 서버 MIME·파일 시그니처 검사를 모두 적용한다.
- 원본 최대 크기: 4MB.
- 모바일에서는 촬영을 유도할 수 있도록 `accept="image/*"`와 `capture="environment"`를 사용한다.
- 업로드 전 파일명, 크기, 미리보기를 보여준다.
- 조회 시 서명 URL을 필요할 때만 요청하고 만료 URL을 영속 상태에 저장하지 않는다.
- 영수증 원본에는 상호·주소·카드 끝자리 같은 개인정보가 있을 수 있음을 짧게 안내한다.

## 5. 컴포넌트 구조

`ExpenseCapture.tsx` 한 파일에 모든 기능을 넣지 않는다.

```text
src/app/components/quickCapture/expense/
├─ ExpenseWorkspace.tsx        # 비용 탭 전체 오케스트레이션
├─ ExpenseEntryForm.tsx        # 신규 등록 확인 폼
├─ ExpenseDashboard.tsx        # 합계·차트 영역
├─ ExpenseFilters.tsx          # 기간·분류·통화
├─ ExpenseList.tsx             # 목록·더 보기·빈 상태
├─ ExpenseListItem.tsx         # 한 건 표시
├─ ExpenseEditSheet.tsx        # 수정 UI
├─ ReceiptPicker.tsx           # 선택·촬영·미리보기
├─ ReceiptGallery.tsx          # 서명 URL 조회·삭제
├─ ExpenseChart.tsx            # CSS/SVG 기반 접근 가능 차트
├─ ExpenseExportButtons.tsx    # CSV 다운로드·Google Sheets 내보내기
├─ expenseTypes.ts             # 클라이언트 응답 타입
└─ useExpenses.ts              # 조회·변경·재검증 상태
```

기존 `ExpenseCapture.tsx`는 호환을 위해 `ExpenseWorkspace`를 렌더링하는 얇은 진입점으로 축소한다. `QuickAddBar.tsx`와 `page.tsx`의 기존 호출 계약은 가능한 한 유지한다.

## 6. 데이터 계약

### 6.1 비용 목록 응답

```ts
interface ExpenseListRecord {
  item: WorkspaceItem;
  entry: ExpenseEntry;
  receipts: ContentAsset[];
}

interface ExpenseListResponse {
  expenses: ExpenseListRecord[];
  nextCursor?: string;
}
```

### 6.2 분석 응답

```ts
interface ExpenseAggregateRow {
  currency: string;
  totalAmount: string;
  count: number;
}

interface ExpenseMonthlyRow extends ExpenseAggregateRow {
  month: string; // YYYY-MM
}

interface ExpenseCategoryRow extends ExpenseAggregateRow {
  category: string; // 미분류 포함
}

interface ExpenseAnalysisResponse {
  range: { from: string; to: string; timeZone: string };
  totals: ExpenseAggregateRow[];
  monthly: ExpenseMonthlyRow[];
  byCategory: ExpenseCategoryRow[];
}
```

금액은 API 경계에서 문자열을 유지한다. 차트 비율 계산에만 `Number`로 변환하고 DB 저장 값이나 합계 값을 JavaScript 부동소수점으로 다시 저장하지 않는다.

### 6.3 수정 요청

```ts
interface UpdateExpenseRequest {
  title: string;
  amount: string;
  currency: string;
  category?: string;
  paymentMethod?: string;
  merchant?: string;
  occurredAt: string;
  expectedVersion: number;
}
```

`expectedVersion`이 현재 `unified_items.version`과 다르면 `409 Conflict`를 반환해 오래된 화면이 최신 변경을 덮어쓰지 않게 한다.

### 6.4 내보내기 열 계약

```ts
interface ExpenseExportRow {
  occurredAt: string;
  title: string;
  merchant: string;
  category: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  receiptCount: number;
}
```

경비청구와 세금공제 필드는 DB에 존재하더라도 내보내기에 포함하지 않는다. 사용자 ID, 내부 Storage 경로, 자산 ID, 삭제 시각, AI 정책 같은 내부 필드도 제외한다.

## 7. API 설계

### `GET /api/expenses`

쿼리:

- `from`, `to`: ISO 날짜 또는 시각
- `category`: 선택
- `currency`: ISO 4217 3자리
- `limit`: 기본 20, 최대 100
- `cursor`: 안정적인 페이지네이션 커서

동작:

1. 로그인 사용자 확인
2. `unified_items.item_type='expense'`, `deleted_at IS NULL` 기준 활성 ID 조회
3. 같은 사용자와 활성 ID의 `expense_entries` 조회
4. 해당 ID의 삭제되지 않은 `content_assets.kind='image'` 조회
5. `occurred_at DESC, item_id DESC` 정렬

목록 응답에 Storage 서명 URL을 미리 넣지 않는다. 영수증을 펼칠 때 다운로드 API를 호출한다.

### `PATCH /api/expenses/[id]`

- 인증·소유권·`item_type='expense'` 확인
- 요청 스키마와 길이 검증
- `expectedVersion` 비교
- `expense_entries`와 `unified_items`를 하나의 RPC에서 갱신
- 새 `version`과 갱신된 비용을 반환

권장 RPC: `update_expense_with_item(p_item_id TEXT, p_patch JSONB, p_expected_version BIGINT)`.

RPC는 `auth.uid()`를 직접 사용하고 요청의 `user_id`를 신뢰하지 않는다. 금액, 통화, 발생 시각을 검증하고 두 테이블 중 하나만 바뀌는 부분 성공을 금지한다.

### `DELETE /api/expenses/[id]`

- 인증·소유권 확인
- `unified_items.deleted_at`, `updated_at`, `version` 갱신
- `expense_entries`와 `content_assets`는 즉시 물리 삭제하지 않음
- 기본 목록·합계에서 제외

권장 RPC: `soft_delete_expense(p_item_id TEXT, p_expected_version BIGINT)`.

### `GET /api/expenses/summary`

쿼리:

- `from`, `to`
- `months`: 월별 추이 개수, 기본 12, 최대 24
- `timeZone`: IANA 타임존, 기본 `Asia/Seoul`

응답은 `totals`, `monthly`, `byCategory`를 제공한다. 삭제된 공통 항목은 반드시 제외한다.

집계는 통화별로 분리한다.

```text
허용: 325,000 KRW · 48 USD
금지: 총 325,048원
```

### 영수증 API

기존 API를 재사용한다.

- 업로드: `POST /api/assets` multipart (`itemId`, `kind=image`, `file`)
- 목록: `GET /api/assets?itemId=...`
- 다운로드 URL: `GET /api/assets/[id]/download`
- 삭제: `DELETE /api/assets/[id]`

서버에 다음 검증을 보강한다.

- `kind=image`일 때 MIME 허용 목록 검사
- 확장자만 신뢰하지 않고 JPEG·PNG·WebP 파일 시그니처 검사
- 최대 4MB
- 부모 항목이 로그인 사용자의 활성 `expense`인지 검사
- 한 비용당 영수증 최대 5장

### `GET /api/expenses/export?format=csv`

쿼리:

- `format`: `csv`만 허용
- `from`, `to`, `category`, `currency`, `timeZone`: 목록·분석과 동일

동작:

1. Supabase 로그인 사용자 확인
2. 목록 API와 동일한 필터·소프트 삭제 제외 규칙 적용
3. 서버에서 전체 대상 데이터를 다시 조회하고 클라이언트가 보낸 행을 신뢰하지 않음
4. UTF-8 CSV 바이트 생성
5. `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` 설정
6. ASCII 안전 파일명으로 `Content-Disposition: attachment` 반환

파일명 예:

```text
coffeetide-expenses-2026-08-01_2026-08-31.csv
```

행 수는 1차 구현에서 최대 10,000건으로 제한한다. 초과 시 일부만 조용히 내보내지 말고 `413`과 기간 축소 안내를 반환한다.

### `POST /api/expenses/export/google-sheets`

요청 본문:

```ts
interface GoogleSheetsExpenseExportRequest {
  from: string;
  to: string;
  category?: string;
  currency?: string;
  timeZone: string;
  months?: number;
  idempotencyKey: string;
}
```

응답:

```ts
interface GoogleSheetsExpenseExportResponse {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  rowCount: number;
  sheetCount: number;
  chartCount: number;
  warnings: string[];
}
```

동작:

1. Supabase 로그인 사용자와 Google 연동 토큰을 모두 확인
2. 현재 Google 대상 계정과 기간·필터·예상 행 수를 서버 미리보기로 반환
3. 사용자가 확인한 요청에만 Sheets 생성 실행
4. 만료 임박 토큰은 기존 `refreshGoogleIfExpiring`으로 선제 갱신
5. 401·403이면 기존 `refreshChannel('google', ...)`로 한 번만 반응형 갱신 후 재시도
6. 서버가 동일 필터의 활성 비용과 분석 데이터를 다시 조회
7. Sheets API로 스프레드시트와 네 시트를 생성하고 값을 기록
8. 대시보드에 통화별 합계 카드와 월간·분류별 차트를 생성하고 재조회로 검증
9. 성공 시 Google Sheets URL을 반환하고 새 탭 열기 버튼 제공

`idempotencyKey`는 사용자·필터·요청 단위로 5분 동안 한 번만 유효하게 처리한다. 네트워크 재시도로 동일 스프레드시트가 여러 개 생기지 않게 해야 한다.

## 8. Supabase 마이그레이션

새 증분 파일 예시:

```text
supabase/migrations/20260818_expense_management_analysis.sql
```

포함 내용:

1. `update_expense_with_item` RPC
2. `soft_delete_expense` RPC
3. 필요한 복합 인덱스
4. RPC `authenticated` 실행 권한
5. 스키마 캐시 갱신 안내

권장 인덱스:

```sql
CREATE INDEX IF NOT EXISTS unified_items_expense_active_occurred_idx
  ON public.unified_items (user_id, occurred_at DESC)
  WHERE item_type = 'expense' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS expense_entries_user_category_currency_idx
  ON public.expense_entries (user_id, category, currency, occurred_at DESC);
```

마이그레이션은 기존 비용 행을 삭제하거나 다시 쓰지 않는다. 실행 후 다음을 확인한다.

```sql
SELECT
  to_regclass('public.expense_entries'),
  to_regprocedure('public.create_expense_with_item(jsonb,jsonb)'),
  to_regprocedure('public.update_expense_with_item(text,jsonb,bigint)'),
  to_regprocedure('public.soft_delete_expense(text,bigint)');

NOTIFY pgrst, 'reload schema';
```

## 9. 집계 규칙

### 월 경계

- 브라우저의 IANA 타임존을 API에 전달한다.
- 잘못된 타임존은 `400`으로 거부하거나 서버 기본값 `Asia/Seoul`로 안전하게 수렴한다.
- 월 그룹 키는 사용자 타임존 기준 `YYYY-MM`이다.
- 기간은 `[from, to)` 반개구간 사용을 권장한다.

### 분류

- 빈 분류는 `미분류`로 묶는다.
- 분류 문자열은 현재 자유 입력을 유지하되 앞뒤 공백을 제거하고 최대 길이를 제한한다.
- 차트는 선택 기간의 상위 8개 분류를 표시하고 나머지는 `기타`로 묶을 수 있다.
- 표에는 모든 분류를 표시한다.

### 차트

- 새 차트 라이브러리는 추가하지 않는 것을 우선한다.
- CSS 막대 또는 작은 SVG로 구현한다.
- 막대만으로 값을 전달하지 말고 텍스트 금액과 건수를 항상 함께 표시한다.
- 색상만으로 분류를 구분하지 않는다.
- `aria-label`에 월/분류, 통화, 금액, 건수를 포함한다.

## 10. Google Sheets·CSV 내보내기 설계

### 10.1 연동과 권한 결정

Google Sheets 내보내기는 기존 CoffeeTide Google 연동을 재사용한다. 현재 `GOOGLE_SCOPES`에 포함된 `https://www.googleapis.com/auth/drive.file`은 앱이 생성한 Google 파일에 접근하는 최소권한 범위이므로 기본안에서는 더 광범위한 `spreadsheets` 권한을 추가하지 않는다.

선행 조건:

1. Google Cloud 프로젝트에서 Google Sheets API 활성화
2. 사용자가 CoffeeTide Google 연동 완료
3. 기존 `drive.file` 동의가 포함된 액세스·리프레시 토큰 보유
4. Supabase 로그인 사용자와 Google 대상 계정을 내보내기 확인 화면에 함께 표시

Sheets API가 `insufficient_scope`를 반환하는 실제 계정이 확인될 때만 `https://www.googleapis.com/auth/spreadsheets` 범위 추가를 별도 승인 과제로 검토한다. 처음부터 모든 사용자 스프레드시트 접근 범위를 요구하지 않는다.

공식 구현 참고:

- [Google Sheets API: spreadsheets.create](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create)
- [Google Sheets API: values.batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate)
- [Google Sheets API: spreadsheets.batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)
- [Google Sheets API: 차트 생성·수정 예제](https://developers.google.com/workspace/sheets/api/samples/charts)
- [Google Sheets API: 피벗 테이블 안내](https://developers.google.com/workspace/sheets/api/guides/pivot-tables)
- [Google Workspace OAuth 범위](https://developers.google.com/workspace/sheets/api/scopes)

권장 파일:

```text
src/lib/expenses/export.ts
src/lib/expenses/export.test.ts
src/lib/google/sheets.ts
src/app/api/expenses/export/route.ts
src/app/api/expenses/export/google-sheets/preview/route.ts
src/app/api/expenses/export/google-sheets/route.ts
```

### 10.2 CSV 규격

- UTF-8 BOM을 붙여 Windows Excel에서 한글이 깨지지 않게 한다.
- 구분자는 쉼표, 줄바꿈은 CRLF를 사용한다.
- 열 순서: 사용 일시, 제목, 사용처, 분류, 금액, 통화, 결제수단, 영수증 수.
- 쉼표·큰따옴표·줄바꿈이 있는 값은 큰따옴표로 감싸고 내부 큰따옴표는 두 번 쓴다.
- 문자열 첫 유효 문자가 `=`, `+`, `-`, `@`, 탭, 캐리지리턴이면 앞에 작은따옴표를 붙여 스프레드시트 수식 실행을 막는다.
- 금액은 문자열 정밀도를 유지하되 숫자 형식만 허용된 검증 데이터에서 가져온다.
- 현재 필터 결과의 상세 내역만 포함한다. 월별·분류별 분석은 Google Sheets에 제공한다.

### 10.3 Google Sheets 생성 규격

서버가 Google Sheets API를 다음 순서로 호출한다.

1. `POST https://sheets.googleapis.com/v4/spreadsheets`로 스프레드시트 생성
2. 생성 요청에 네 시트의 제목과 기본 grid 크기를 함께 지정
3. `POST .../values:batchUpdate`로 비용내역·월별합계·분류별분석 값과 대시보드 제목을 한 번에 기록
4. `POST ...:batchUpdate`로 헤더 고정, 자동 필터, 열 너비, 금액 표시 형식, 대시보드 요약 카드 형식을 적용
5. 같은 `batchUpdate` 또는 후속 `batchUpdate`의 `AddChartRequest`로 통화별 차트를 생성
6. 생성 결과를 `spreadsheets.get`으로 제한 조회하여 시트·차트 개수와 차트 ID를 검증
7. 성공 시 `https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit` 반환

시트 구성:

1. `비용내역`: 현재 필터의 상세 비용
2. `월별합계`: 월·통화별 금액과 건수
3. `분류별분석`: 분류·통화별 금액과 건수
4. `대시보드`: 내보내기 조건, 통화별 핵심 합계, 월간 추이 차트, 분류별 지출 차트

규칙:

- 서로 다른 통화의 합계 행을 만들지 않는다.
- 값 입력은 반드시 `valueInputOption=RAW`를 사용해 사용자 문자열을 수식으로 해석하지 않는다.
- 금액은 검증된 숫자 값으로 보내고 Sheets number format으로 천 단위를 표시한다.
- 제목·상호·분류 등 사용자 입력의 NUL·허용되지 않는 제어 문자를 제거한다.
- 시트명은 고정된 네 이름만 사용한다.
- 헤더 고정, 자동 필터, 읽기 쉬운 기본 열 너비를 설정한다.
- 문서 제목은 `CoffeeTide 비용 YYYY-MM-DD ~ YYYY-MM-DD` 형식으로 만든다.
- 문서 내용이나 메타데이터에 Supabase 사용자 ID, OAuth 토큰, 내부 자산 경로를 넣지 않는다.
- 생성된 스프레드시트는 사용자의 Google Drive에 남으며 CoffeeTide 비용 삭제와 자동 연동 삭제하지 않는다.

### 10.4 Google Sheets 합계표·차트 설계

Google Sheets API는 `PivotTable`과 `AddChartRequest`를 지원하므로 합계표와 차트를 문서 생성 시 함께 만들 수 있다. 다만 본 기능의 기본 구현은 Sheets에서 다시 계산하는 피벗 테이블이 아니라 CoffeeTide 서버가 같은 집계 함수로 산출한 스냅샷 합계표를 기록하고, 차트가 그 표의 셀 범위를 참조하게 한다.

이 결정을 따르는 이유:

- 앱 화면, CSV, Google Sheets에서 동일한 타임존·삭제 제외·통화 분리 규칙을 재사용한다.
- Google Sheets 로캘에 따른 날짜·수식·소수점 해석 차이를 줄인다.
- 내보낸 시점의 분석 결과를 재현 가능한 스냅샷으로 보존한다.
- `valueInputOption=RAW` 원칙을 유지하고 사용자 입력을 수식으로 실행하지 않는다.

#### 합계표

`월별합계` 열:

| 열 | 값 |
|---|---|
| A | 월 (`YYYY-MM`) |
| B | 통화 |
| C | 지출 합계 |
| D | 비용 건수 |
| E | 건당 평균 |

`분류별분석` 열:

| 열 | 값 |
|---|---|
| A | 분류 |
| B | 통화 |
| C | 지출 합계 |
| D | 비용 건수 |
| E | 전체 통화별 지출 대비 비율 |

- `미분류`를 명시적인 분류 행으로 포함한다.
- 월별합계는 통화→월 오름차순, 분류별분석은 통화→금액 내림차순으로 정렬한다.
- 건당 평균과 비율도 서버에서 계산한 숫자 스냅샷으로 기록한다.
- 각 통화 구간 끝에 해당 통화의 합계 행을 추가하되 서로 다른 통화를 합친 총합 행은 만들지 않는다.
- 금액·평균은 통화별 표시 형식을 적용하고, 비율은 퍼센트 형식을 적용한다.
- 첫 행 고정, 필터, 굵은 헤더, 합계 행 강조, 열 자동 크기 조절을 적용한다.

#### 대시보드와 차트

`대시보드` 상단에는 다음 메타데이터를 텍스트로 표시한다.

- 문서 제목과 생성 일시
- 내보낸 Google 계정
- 조회 기간·분류·통화·검색어 필터
- 전체 비용 건수
- 통화별 지출 합계와 건당 평균

각 통화마다 아래 차트 2개를 생성한다.

1. **월간 지출 추이**: `월별합계`의 월과 지출 합계를 참조하는 세로 막대 차트
2. **분류별 지출**: `분류별분석`의 상위 8개 분류와 `기타`를 참조하는 가로 막대 차트

차트 규칙:

- 서로 다른 통화를 한 차트 계열에 섞지 않고 제목에 통화 코드를 포함한다.
- 분류별 표에는 모든 분류를 남기되 차트만 상위 8개와 `기타`로 축약한다.
- 상위 8개와 `기타`처럼 표를 그대로 참조할 수 없는 차트 데이터는 `대시보드`의 숨김 보조 열(`J:M`)에 통화별 연속 범위로 기록한다. 보조 열에는 사용자에게 보여 줄 상세 정보나 식별자를 넣지 않는다.
- 숨김 보조 열을 차트 원본으로 사용할 때 `ChartSpec.hiddenDimensionStrategy=SHOW_ALL`을 명시하여 숨긴 열도 차트에서 제외되지 않게 한다.
- 차트 원본 범위는 서버가 생성한 행 인덱스로 산출하며 고정 A1 문자열을 사용자 입력으로 조합하지 않는다.
- `BasicChartSpec`과 `AddChartRequest`를 사용하고 차트 위치는 `overlayPosition`으로 대시보드에 세로 배치한다.
- 기본 크기는 모바일 웹이 아니라 Google Sheets 데스크톱 가독성을 기준으로 약 900×420px로 한다.
- 차트 제목, 가로축·세로축 제목과 `altText`에 기간·통화·지표를 포함한다.
- 데이터가 0건인 통화 차트는 만들지 않으며, 월이 1개뿐이어도 막대 차트로 표시한다.
- 차트 생성 API가 지원하지 않는 세부 스타일에 의존하지 않는다. Google 공식 문서상 일부 차트 유형과 배경색·축 레이블 형식은 API 제어가 제한될 수 있으므로, 정확한 데이터와 제목·범위·크기를 완료 기준으로 삼는다.

피벗 테이블은 기술적으로 가능하지만 1차 구현 범위에서는 제외한다. 향후 사용자가 시트 안에서 임의 탐색을 요구하면 `비용내역`을 원본 범위로 하는 별도 `피벗분석` 시트를 `UpdateCellsRequest.pivotTable`로 추가할 수 있다. 이때도 통화 필터 또는 통화 열 그룹을 필수로 하여 혼합 통화 합계를 방지한다.

#### 생성 검증과 실패 처리

- `spreadsheets.batchUpdate` 응답의 `addChart` 결과에서 차트 ID를 수집한다.
- `spreadsheets.get?fields=sheets(properties(sheetId,title),charts(chartId,spec(title),position))` 형태로 필요한 필드만 재조회한다.
- 기대 시트 4개와 `데이터가 있는 통화 수 × 2`개의 차트가 확인되어야 완전 성공이다.
- 표 기록은 성공했지만 일부 차트 생성이 실패하면 기본값은 전체 내보내기 실패로 처리하고 앱이 만든 파일을 보상 삭제한다.
- 보상 삭제가 실패하면 불완전 문서 링크와 `차트 생성 실패` 경고를 제공한다.
- 사용자가 문서를 연 뒤 데이터를 편집할 수 있으므로 CoffeeTide는 생성 완료 후 해당 문서를 자동 수정하거나 재동기화하지 않는다.

### 10.5 미리보기·승인·멱등성

Google Sheets 생성은 외부 쓰기이므로 버튼 클릭만으로 즉시 생성하지 않는다.

```text
Google Sheets로 내보내기
  → 서버 미리보기
  → 대상 Google 계정, 기간, 필터, 행 수, 생성할 시트 4개와 차트 수 표시
  → 사용자 확인
  → 5분짜리 세션 결합 1회 승인
  → Sheets 생성
  → 완료 링크 표시
```

- 기존 Cloud Tool 승인 토큰과 같은 세션·입력 해시·만료·1회 사용 원칙을 재사용하되 비용 내보내기와 토큰 용도를 분리한다.
- 동일 `idempotencyKey` 재요청은 기존 성공 결과를 반환하고 새 문서를 만들지 않는다.
- 스프레드시트 생성 후 값 입력이 실패하면 앱이 방금 만든 파일만 Drive API로 보상 삭제한다.
- 보상 삭제도 실패하면 사용자에게 불완전 파일 링크와 수동 삭제 안내를 제공하고 서버 로그에는 파일 ID 해시와 오류 코드만 남긴다.

### 10.6 Google 오류 처리

| 오류 | 처리 |
|---|---|
| Google 미연동 | 연동 설정으로 이동 안내 |
| 토큰 만료 임박 | 선제 갱신 후 실행 |
| 401·403 | 한 번 갱신 후 재시도, 계속 실패하면 재연동 안내 |
| Sheets API 비활성 | Google Cloud에서 Sheets API 활성화 안내 |
| 권한 범위 부족 | 현재 계정 재연동 안내, 실제 필요 시 범위 확대 검토 |
| 429 | `Retry-After`를 존중하고 자동 반복 생성 금지 |
| 5xx | 짧은 1회 재시도 후 실패, 멱등성 키 유지 |
| 부분 생성 | 앱 생성 파일 보상 삭제 또는 불완전 파일 링크 안내 |
| 차트 요청 일부 실패 | 전체 실패 처리 후 앱 생성 파일 보상 삭제 |
| Sheets 차트 스타일 제한 | 지원되는 기본 스타일로 생성하고 데이터·제목·범위를 우선 검증 |

### 10.7 화면 동작

- 분석 영역 필터 옆에 `CSV 다운로드`, `Google Sheets로 내보내기` 버튼을 둔다.
- 44px 이상 터치 영역과 형식별 `aria-label`을 제공한다.
- CSV 다운로드 또는 Sheets 생성 중에는 해당 버튼만 비활성화하고 진행 상태를 표시한다.
- API 오류 JSON을 파일로 저장하지 않도록 먼저 `response.ok`와 Content-Type을 검사한다.
- Blob URL로 다운로드한 뒤 `URL.revokeObjectURL()`을 호출한다.
- 결과가 0건이면 버튼을 비활성화하고 `내보낼 비용이 없습니다`를 표시한다.
- Sheets 성공 후 `Google Sheets에서 열기`를 제공하며 사용자 동작 없이 팝업을 강제로 열지 않는다.

## 11. 클라이언트 상태와 재검증

`useExpenses`가 다음 상태를 소유한다.

```ts
interface ExpenseState {
  records: ExpenseListRecord[];
  analysis?: ExpenseAnalysisResponse;
  loading: boolean;
  loadingMore: boolean;
  mutatingId?: string;
  error?: string;
  filters: ExpenseFilters;
  nextCursor?: string;
}
```

규칙:

- 탭 진입 시 목록과 분석을 병렬 조회한다.
- 등록·수정·삭제 후 목록과 분석을 함께 재조회한다.
- 요청 순서가 뒤집혀 오래된 응답이 최신 필터를 덮지 않도록 `AbortController` 또는 요청 세대 번호를 사용한다.
- 동일 버튼 연타를 막는다.
- 401은 `로그인이 필요합니다`로, 409는 `다른 기기에서 변경되었습니다`로 구분한다.
- 서버 오류 본문을 그대로 노출하지 말고 사용자 메시지와 진단 로그를 분리한다.

## 12. 보안·개인정보

- 모든 비용·영수증 API는 Supabase `auth.getUser()`로 서버에서 사용자를 확인한다.
- 클라이언트가 보내는 `user_id`는 무시한다.
- 서비스 역할 키를 비용 일반 API에 사용하지 않는다.
- RLS는 `auth.uid() = user_id`를 유지한다.
- 영수증 Storage 경로는 `${userId}/${itemId}/${randomId}.${ext}` 형식을 유지한다.
- 파일명 원문을 Storage 경로에 사용하지 않는다.
- 서명 URL은 최대 60초로 유지하며 로그·DB·localStorage에 저장하지 않는다.
- 영수증 파일 내용, 카드번호, 상호, 금액을 서버 로그에 기록하지 않는다.
- 삭제된 비용은 AI 검색·요약·월별 분석에서 제외한다.
- 업로드 실패 시 Storage 객체와 DB 메타데이터 중 한쪽만 남지 않도록 보상 삭제를 유지한다.
- 내보내기 API는 서비스 역할 키를 사용하지 않고 사용자 RLS를 통과한 데이터만 읽는다.
- CSV 파일과 Google Sheets에 OAuth 토큰·사용자 ID·내부 Storage 경로를 포함하지 않는다.
- CSV 수식 주입과 Sheets `RAW` 값 입력을 테스트한다.
- Google 액세스·리프레시 토큰을 Sheets API 응답, 감사 로그, 오류 메시지에 포함하지 않는다.

## 13. 반응형·테마 요구사항

- 기존 CSS 변수 `--bg`, `--card`, `--border`, `--text`, `--text-dim`, `--accent`, `--accent-contrast`만 사용한다.
- 검정 고정 테두리, 고정 회색 배경, 테마와 무관한 보라색을 추가하지 않는다.
- 모바일에서 필터는 2열 또는 세로 배치하며 가로 스크롤을 만들지 않는다.
- 목록 액션은 아이콘만 사용할 경우 `aria-label`과 `title`을 제공한다.
- 모달·바텀시트의 저장·삭제 버튼은 44px 이상이다.
- 긴 금액은 줄바꿈하지 않고 통화와 함께 정렬한다.
- 다크·라이트·노트북·커피·메가·커스텀 테마를 모두 수동 확인한다.
- 내보내기 버튼은 고정 검정·회색 대신 현재 테마의 보조 버튼 변수를 사용한다.

## 14. 테스트 매트릭스

### 단위 테스트

| ID | 대상 | 기대 결과 |
|---|---|---|
| U01 | 월별 KRW 3건 집계 | 월·통화별 합계와 건수 정확 |
| U02 | KRW와 USD 혼합 | 통화별 별도 행 생성 |
| U03 | 분류 없음 | `미분류` 집계 |
| U04 | 월말 UTC/KST 경계 | 사용자 타임존 월에 포함 |
| U05 | 삭제 항목 | 모든 집계에서 제외 |
| U06 | 0원 비용 | 유효한 기록으로 집계 |
| U07 | 소수 통화 | 문자열 정밀도 보존 |
| U08 | 상위 분류와 기타 | 표 전체·차트 축약 규칙 일치 |
| U09 | CSV 한글·쉼표·따옴표 | Excel 호환 UTF-8 CSV 생성 |
| U10 | CSV 수식 시작 문자열 | 작은따옴표로 무력화 |
| U11 | Sheets payload 4개 시트 | 고정 시트명과 열 계약 일치 |
| U12 | 다중 통화 Sheets | 통화별 행 분리, 혼합 총계 없음 |
| U13 | 수식 형태 사용자 입력 | `RAW` 입력이며 formula 필드 생성 없음 |
| U14 | 월별 합계표 | 통화별 합계·건수·평균과 표시 형식 정확 |
| U15 | 분류별 합계표 | 전체 행 유지, 차트용 상위 8개와 기타 정확 |
| U16 | Sheets 차트 payload | 통화마다 월간·분류 차트 2개와 올바른 원본 범위 생성 |
| U17 | 차트 접근성 메타데이터 | 제목·축 제목·altText에 통화와 지표 포함 |
| U18 | 숨김 차트 보조 열 | 상위 8개·기타 연속 범위와 `hiddenDimensionStrategy=SHOW_ALL` 생성 |

### API·통합 테스트

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| A01 | 비로그인 목록·수정·삭제 | 401 |
| A02 | 다른 사용자 비용 접근 | 404 또는 빈 결과, 정보 노출 없음 |
| A03 | 비용 수정 | 두 테이블이 함께 갱신되고 version 증가 |
| A04 | 오래된 expectedVersion | 409, DB 변경 없음 |
| A05 | 소프트 삭제 | 목록·합계에서 제외, 원본 행 보존 |
| A06 | 이미지 영수증 업로드 | 비공개 Storage와 메타데이터 생성 |
| A07 | PDF·실행파일을 영수증으로 업로드 | 415 |
| A08 | 4MB 초과 | 413 |
| A09 | 영수증 6번째 업로드 | 409 또는 400 |
| A10 | 서명 URL | 본인만 발급, 60초 만료 |
| A11 | 영수증 업로드 실패 | 비용은 저장되고 재시도 가능 |
| A12 | 비로그인 export | 401, 파일 생성 없음 |
| A13 | 타 사용자 비용 export | 포함되지 않음 |
| A14 | 삭제 비용 export | 포함되지 않음 |
| A15 | 10,000건 초과 | 413과 기간 축소 안내 |
| A16 | CSV 응답 | MIME·Content-Disposition·no-store 정확 |
| A17 | Google 미연동 Sheets 요청 | 생성 없이 재연동 안내 |
| A18 | Sheets 미리보기와 실행 입력 불일치 | 승인 거부 |
| A19 | 동일 idempotencyKey 재시도 | 스프레드시트 1개만 생성 |
| A20 | Sheets 값 입력 실패 | 앱 생성 파일 보상 삭제 |
| A21 | Google 토큰 만료 | 1회 갱신·재시도 후 성공 또는 재연동 안내 |
| A22 | KRW·USD Sheets 생성 | 통화별 차트 4개, 혼합 계열 없음 |
| A23 | 차트 일부 생성 실패 | 전체 실패 처리, 앱 생성 파일 보상 삭제 |
| A24 | 생성 후 제한 재조회 | 시트 4개와 예상 차트 ID·개수 확인 |

### 화면 테스트

| ID | 화면 | 기대 결과 |
|---|---|---|
| V01 | 비용 0건 | 명확한 빈 상태와 입력 유도 |
| V02 | 비용 등록 | 목록·합계·차트 즉시 갱신 |
| V03 | 수정 | 값 유지, 성공 후 최신 값 표시 |
| V04 | 삭제 | 확인 후 목록 제거·합계 감소 |
| V05 | 모바일 360px | 가로 스크롤 없음, 액션 44px |
| V06 | 테마 6종 | 고정 검정/회색 요소 없이 조화 |
| V07 | 키보드 탐색 | 필터·편집·영수증 액션 접근 가능 |
| V08 | 이미지 로딩 실패 | 깨진 이미지 대신 재시도/안내 |
| V09 | CSV·Google Sheets 내보내기 | 현재 필터와 결과 내용 일치 |
| V10 | 모바일 내보내기 | 가로 스크롤 없이 44px 버튼 제공 |
| V11 | Google Sheets 결과 문서 | 대시보드 합계와 차트가 표 데이터와 일치 |

### 필수 자동 검증

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## 15. 구현 순서

### 단계 A — 서버 계약

1. 집계 순수 함수와 단위 테스트 작성
2. 목록 응답에 영수증 메타데이터 연결
3. 월별·분류별 summary 응답 확장
4. 수정·소프트 삭제 RPC 마이그레이션 작성
5. PATCH·DELETE Route Handler 구현
6. 인증·RLS·버전 충돌 통합 검증

완료 조건: API만으로 등록→조회→수정→삭제→집계 제외가 재현된다.

### 단계 B — 비용 목록과 분석

1. `useExpenses` 구현
2. 필터·목록·더 보기 구현
3. 월별 합계표·분류별 분석표 구현
4. 접근 가능한 막대 차트 구현
5. 등록 후 목록·분석 재검증 연결

완료 조건: 데스크톱·모바일에서 비용 흐름을 확인하고 수정·삭제할 수 있다.

### 단계 C — 영수증

1. 이미지 선택·촬영·미리보기
2. 서버 파일 검증 강화
3. 비용 저장 후 부분 실패 허용 업로드
4. 목록 영수증 갤러리·서명 URL 조회
5. 영수증 교체·삭제

완료 조건: 본인 비용에만 최대 5장 첨부하고 본인만 조회·삭제할 수 있다.

### 단계 D — Google Sheets·CSV 내보내기

1. 공통 export 행 매퍼와 CSV 생성기 구현
2. 기존 Google 토큰 갱신 계층을 재사용하는 Sheets API 클라이언트 구현
3. 비용내역·월별합계·분류별분석·대시보드 4개 시트 payload와 테스트 작성
4. 통화별 합계 카드, 월간 지출 추이, 분류별 지출 `AddChartRequest` 생성기 구현
5. 생성 후 시트·차트 개수를 제한 재조회하는 검증 구현
6. 인증·필터·10,000건 제한을 적용한 CSV API 구현
7. Sheets 미리보기·승인·멱등 실행 API 구현
8. 값·차트 부분 생성 시 앱 생성 Google 파일 보상 삭제 구현
9. 분석 화면에 CSV·Google Sheets 버튼 연결

완료 조건: 현재 필터의 비용을 CSV로 내려받고 Google Drive에 통화가 분리된 4개 시트, 합계표, 통화별 차트가 있는 문서를 한 번만 생성하며, 수식 주입·토큰 갱신·부분 실패 테스트를 통과한다.

### 단계 E — 회귀·문서

1. 테마 6종과 모바일 수동 확인
2. 전체 자동 검사
3. Supabase 원격 스모크 테스트
4. `01-as-built-reference.md`, `02-backlog.md` 갱신

완료 조건: 기존 업무·메모·음성 입력과 비용 등록에 회귀가 없고 문서가 실제 구현과 일치한다.

## 16. Gemini 작업 지시문

아래 내용을 Gemini에 그대로 전달할 수 있다.

```text
CoffeeTide 저장소에서 doc/15-expense-management-analysis-plan.md를 정본으로 읽고 비용 관리 기능을 구현하라.

필수 규칙:
1. 구현 전에 저장소 루트 AGENTS.md와 node_modules/next/dist/docs의 관련 Next.js 16 문서를 읽어라.
2. 사용자가 이미 수정한 파일과 작업 트리 변경을 보존하라. 특히 page.tsx에 기능을 더 쌓지 말고 비용 전용 컴포넌트와 훅으로 분리하라.
3. 범위는 비용 목록, 수정, 소프트 삭제, 월별/분류별 합계와 차트, 영수증 사진 첨부, Google Sheets/CSV 내보내기다.
4. 경비청구와 세금공제는 구현하지 마라.
5. 서로 다른 통화를 합산하지 마라.
6. 비용 수정은 expectedVersion을 이용한 낙관적 동시성 제어와 원자적 RPC를 사용하라.
7. 삭제는 unified_items.deleted_at 기반 소프트 삭제이며 분석과 AI 입력에서 제외하라.
8. 영수증은 private-assets와 content_assets를 재사용하고 서명 URL만 사용하라.
9. 비용 저장과 영수증 업로드는 부분 실패를 허용하라. 영수증 실패 때문에 비용을 롤백하지 마라.
10. 고정 검정·회색 UI를 만들지 말고 기존 테마 CSS 변수만 사용하라.
11. 각 단계에서 테스트를 먼저 또는 함께 작성하고 lint, typecheck, test, build를 모두 통과시켜라.
12. Supabase 마이그레이션은 기존 데이터를 삭제하지 않는 증분 SQL로 작성하고 적용 순서와 스모크 쿼리를 보고하라.
13. Google Sheets는 기존 drive.file 최소권한과 Google 토큰 갱신 계층을 재사용하라. 실제 insufficient_scope가 확인되기 전에는 광범위한 spreadsheets 범위를 추가하지 마라.
14. Google Sheets는 비용내역·월별합계·분류별분석·대시보드 4개 시트, CSV는 현재 필터의 상세 내역으로 만들어라.
15. CSV 수식 주입을 막고 Sheets 값은 valueInputOption=RAW로 기록하라.
16. Sheets 생성 전에 대상 계정·필터·행 수 미리보기와 5분짜리 세션 결합 1회 승인을 요구하라.
17. 멱등성 키로 중복 문서 생성을 막고 부분 생성 실패 시 앱이 만든 Google 파일만 보상 삭제하라.
18. 월별·분류별 합계는 서버 집계 스냅샷을 기록하고, 대시보드에는 각 통화별 월간 세로 막대 차트와 분류별 가로 막대 차트를 AddChartRequest로 생성하라.
19. 차트에 서로 다른 통화를 섞지 말고 제목·축·altText를 제공하며, 생성 후 시트 4개와 예상 차트 개수를 제한 필드 재조회로 검증하라.

단계 A부터 E까지 순서대로 진행하고, 각 단계 종료 시 변경 파일·검증 결과·남은 수동 검증을 보고하라. 원격 Supabase SQL 적용과 운영 배포는 사용자 승인 없이 실행하지 마라.
```

## 17. 최종 완료 기준

- [ ] 로그인 사용자가 비용 내역을 기간·분류·통화로 조회할 수 있다.
- [ ] 비용을 수정하면 두 테이블이 원자적으로 갱신되고 버전이 증가한다.
- [ ] 비용 삭제는 소프트 삭제이며 목록·합계·AI 입력에서 제외된다.
- [ ] 월별·분류별 표와 차트가 통화별로 분리된다.
- [ ] 영수증 이미지를 최대 5장 비공개로 첨부·조회·삭제할 수 있다.
- [ ] 현재 필터의 비용을 UTF-8 CSV로 내려받을 수 있다.
- [ ] Google Drive에 비용내역·월별합계·분류별분석·대시보드 4개 시트 문서가 생성된다.
- [ ] 월별합계와 분류별분석에 통화별 합계·건수·평균/비율이 정확히 기록된다.
- [ ] 대시보드에 데이터가 있는 각 통화별 월간 추이와 분류별 지출 차트 2개가 생성된다.
- [ ] 차트 제목·축 제목·대체 텍스트와 원본 셀 범위가 정확하고 혼합 통화 계열이 없다.
- [ ] 숨김 차트 보조 열을 사용해도 `SHOW_ALL` 설정으로 모든 대상 데이터가 표시된다.
- [ ] 내보내기에서 서로 다른 통화가 분리되고 삭제·타 사용자 비용이 제외된다.
- [ ] CSV 수식 주입과 Google Sheets `RAW` 값 기록 테스트가 통과한다.
- [ ] Sheets 생성 전 대상 Google 계정·필터·행 수를 확인할 수 있다.
- [ ] 네트워크 재시도에도 동일 Sheets 문서가 중복 생성되지 않는다.
- [ ] 비용 저장 성공·영수증 실패가 부분 성공으로 명확히 표시된다.
- [ ] 비로그인·타 사용자 접근이 차단된다.
- [ ] 모바일 360px에서 가로 스크롤 없이 사용 가능하다.
- [ ] 모든 기존 테마에서 공통 CSS 변수로 자연스럽게 표시된다.
- [ ] lint, typecheck, 전체 test, production build가 통과한다.
- [ ] 원격 스모크 테스트 후 테스트 데이터가 모두 정리된다.
