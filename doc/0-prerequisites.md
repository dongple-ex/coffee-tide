# Part 0: 사전 준비 및 가이드라인

> ⚠️ **역사 문서 (Phase 1 · TimePilot 시절)** — 초기 Microsoft 단일 채널 설계 기록으로, 현재 coffeTide 정본과 다릅니다. 신규 작업 기준: [`00-current-state.md`](./00-current-state.md) 및 Phase 3 이후 문서.

본 파트에서는 TimePilot Phase 1 개발을 시작하기 전, 사용자가 외부 인프라(Microsoft Azure Portal)를 구축하고 로컬 자격 증명 환경을 세팅하기 위한 절차를 단계별로 명확히 안내합니다.

---

## 1. Microsoft Entra ID (Azure Portal) 애플리케이션 등록 절차

Microsoft Graph API 연동을 위해 Azure Portal에 TimePilot 앱을 등록하고 연동 자격 증명을 획득해야 합니다.

### Step 1: Azure Portal 접속 및 메뉴 이동
1. [Microsoft Azure Portal(portal.azure.com)](https://portal.azure.com/)에 로그인합니다.
2. 상단 검색창에 **"앱 등록"** (또는 **"App Registrations"**)을 검색하여 해당 메뉴로 이동합니다.
3. 좌측 상단의 **"새 등록"** (New Registration) 버튼을 클릭합니다.

### Step 2: 애플리케이션 등록 정보 입력
1. **이름**: 서비스 식별을 위한 이름 입력 (예: `TimePilot-Dev`).
2. **지원되는 계정 유형**: **"모든 조직 디렉터리의 계정(모든 Microsoft Entra ID 디렉터리 - 다중 테넌트) 및 개인 Microsoft 계정(예: Skype, Xbox)"**을 선택합니다. (API 설정 상 `common` 테넌트를 사용하기 위해 필수입니다.)
3. **리디렉션 URI (선택 사항)**:
   - 드롭다운에서 **"웹"** (Web)을 선택합니다.
   - 우측 입력창에 `http://localhost:3000/api/auth/callback`을 정확히 입력합니다.
4. 하단의 **"등록"** (Register) 버튼을 클릭하여 생성을 완료합니다.

### Step 3: 애플리케이션 ID 및 테넌트 ID 기록
- 등록이 완료되면 애플리케이션 개요 화면으로 이동합니다.
- 화면에 표시된 다음 두 가지 값을 복사하여 안전한 곳에 기록해 둡니다.
  - **애플리케이션(클라이언트) ID** (Application (client) ID) -> `.env.local`의 `NEXT_PUBLIC_MS_CLIENT_ID`
  - **디렉터리(테넌트) ID** (Directory (tenant) ID) -> 기본값 `common` 사용 예정

### Step 4: 클라이언트 암호 (Client Secret) 발급
1. 왼쪽 메뉴에서 **"인증서 및 암호"** (Certificates & Secrets)를 클릭합니다.
2. **"클라이언트 암호"** 탭에서 **"새 클라이언트 암호"** (New Client Secret) 버튼을 클릭합니다.
3. 설명(예: `TimePilot Local Dev Key`)과 만료 기간(권장: 180일)을 지정한 후 **"추가"**를 클릭합니다.
4. **[중요]** 생성된 암호 목록의 **"값"** (Value) 열에 있는 문자열을 즉시 복사합니다. (이 화면을 벗어나면 다시는 값을 확인할 수 없으므로 반드시 메모장에 즉시 복사해야 합니다.) -> `.env.local`의 `MS_CLIENT_SECRET`

### Step 5: API 권한 설정 및 승인
1. 왼쪽 메뉴에서 **"API 권한"** (API Permissions)을 클릭합니다.
2. **"권한 추가"** (Add a permission) 버튼을 클릭합니다.
3. **"Microsoft Graph"**를 선택한 후 **"위임된 권한"** (Delegated Permissions)을 클릭합니다.
4. 다음 권한들을 검색하여 체크박스를 선택합니다:
   - `User.Read` (기본 선택되어 있음)
   - `Mail.Read`
   - `offline_access`
5. 하단의 **"권한 추가"** 버튼을 클릭하여 반영합니다.
6. **(회사/조직 계정 사용 시 필수)** 만약 권한 목록 우측 '상태' 열에 노란색 경고가 나타나며 관리자 동의가 필요하다고 표시된다면, 상단의 **"[테넌트명]에 대한 관리자 동의 허용"** (Grant admin consent for [Tenant]) 버튼을 클릭해 줍니다. (개인 계정의 경우 이 단계는 생략 가능합니다.)

---

## 2. 세션 암호화 키 생성 (AES-256-GCM)

보안 쿠키 세션을 생성하기 위해 암호화에 사용할 256비트(32바이트) 비밀키를 무작위로 생성해야 합니다.

### Windows PowerShell 실행 시 생성 방법
Windows PowerShell 터미널을 열고 다음 명령어를 실행하여 무작위 키를 획득합니다.
```powershell
[Convert]::ToBase64String((1..32 | % { [byte](Get-Random -Min 0 -Max 256) }))
```
출력된 base64 문자열을 복사하여 `.env.local`의 `SESSION_ENCRYPTION_SECRET`으로 사용합니다.

---

## 3. 테스트용 샌드박스 계정 준비 가이드 (권장)

실제 개인 편지함이나 회사 업무 편지함을 테스트 환경에 직접 연결하는 것이 부담스러운 경우, Microsoft에서 제공하는 무료 개발자 샌드박스를 구축할 수 있습니다.

1. [Microsoft 365 Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program)에 접속합니다.
2. 개인 Microsoft 계정으로 로그인한 후 개발자 프로그램에 가입합니다.
3. **"샌드박스 설정"** 단계에서 가상의 E5 라이선스 테넌트와 가상 사용자(최대 25명)를 자동 생성합니다.
4. 생성 완료 후 지급되는 관리자 계정(`user@domain.onmicrosoft.com`)을 통해 가상의 메일을 송수신하고, TimePilot 개발용 연동 계정으로 안전하게 테스트를 진행할 수 있습니다.
