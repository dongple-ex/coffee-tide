# CoffeeTide 인증 리디렉션 단일화 설정

운영 인증은 `https://coffee-tide.dongple.kr` 한 도메인에서만 시작하고 완료합니다.
Vercel Preview 주소로 접속한 경우 로그인·서비스 연동 시작점이 운영 도메인으로 이동합니다.
로컬 개발은 `http://localhost:3000`만 예외로 허용합니다.

## 1. Vercel 환경변수

Production 환경에 다음 값을 설정하고 재배포합니다.

```text
NEXT_PUBLIC_SITE_URL=https://coffee-tide.dongple.kr
```

기존 `NEXT_PUBLIC_GOOGLE_REDIRECT_URI`, `NEXT_PUBLIC_MS_REDIRECT_URI`는 더 이상 필요하지
않습니다. 콜백 주소는 `NEXT_PUBLIC_SITE_URL`에서 서버가 생성합니다.

## 2. Supabase URL Configuration

Authentication > URL Configuration에서 다음 값을 확인합니다.

```text
Site URL
https://coffee-tide.dongple.kr

Redirect URLs
https://coffee-tide.dongple.kr/auth/callback
http://localhost:3000/auth/callback
```

운영 환경에는 와일드카드 대신 정확한 URL을 사용합니다. Vercel Preview 주소는 로그인
허용 목록에 추가하지 않습니다.

## 3. Google Cloud OAuth 웹 클라이언트

승인된 JavaScript 원본:

```text
https://coffee-tide.dongple.kr
http://localhost:3000
```

승인된 리디렉션 URI:

```text
https://ihzsemilulwywjafnmfc.supabase.co/auth/v1/callback
https://coffee-tide.dongple.kr/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

- 첫 번째 URI는 CoffeeTide 계정 로그인을 Supabase가 완료하는 주소입니다.
- 두 번째와 세 번째 URI는 Gmail·Calendar·Drive 권한 연동을 CoffeeTide가 완료하는 주소입니다.
- 프로토콜, 호스트, 포트, 경로, 후행 슬래시가 등록값과 정확히 일치해야 합니다.

## 4. Microsoft Entra ID (Outlook 사용 시)

웹 Redirect URI:

```text
https://coffee-tide.dongple.kr/api/auth/outlook/callback
http://localhost:3000/api/auth/outlook/callback
```

## 5. 동작 확인

1. 모바일 Safari/Chrome에서 CoffeeTide를 열면 풀너비 Google 리디렉션 버튼이 표시되는지 확인합니다.
2. 데스크톱에서는 Google GIS 버튼과 리디렉션 보조 링크가 표시되는지 확인합니다.
3. 카카오톡 또는 Instagram 내부 브라우저에서는 외부 브라우저 안내가 표시되는지 확인합니다.
4. 로그인 완료 후 주소가 `https://coffee-tide.dongple.kr`인지 확인합니다.
5. 설정에서 Google을 연동한 뒤 AI 바리스타에 `/connect`를 입력해 Gmail·Calendar·Drive를 검사합니다.
