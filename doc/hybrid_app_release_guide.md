# 하이브리드(WebView) 앱 개발 및 출시 가이드

이 문서는 Next.js 기반의 웹 애플리케이션(coffeeTide)을 하이브리드 앱으로 패키징하고, 양대 마켓(App Store, Google Play)에 출시하기까지의 전체 프로세스를 안내합니다.

웹 코어를 재사용하면서 가장 빠르게 앱을 출시할 수 있는 프레임워크로 **Capacitor(캐패시터)** 를 추천하며, 이 가이드는 Capacitor를 기준으로 작성되었습니다.

> **가안(draft) 문서입니다.** 아래 §2의 아키텍처 선택은 현재 코드베이스(API Route 26개, 쿠키 세션, Vercel 배포)를 기준으로 확정한 것이지만, 배포 환경이 바뀌면 재검토가 필요합니다.

---

## 1. 아키텍처 선택: 원격 URL 방식 (중요)

Capacitor로 웹앱을 감싸는 방법은 두 가지이며, **어느 쪽을 고르느냐가 이 프로젝트에서는 성패를 가릅니다.**

| | A. 정적 번들 방식 | B. 원격 URL 방식 ✅ |
|---|---|---|
| 웹 자산 위치 | `out/` 폴더를 앱에 내장 | 서버(`coffeetide.dongple.kr`)에서 로드 |
| `output: 'export'` | 필요 | **불필요** |
| API Route | ❌ **전부 소멸** | ✅ 그대로 동작 |
| 쿠키 세션 | ❌ 깨짐 (아래 참조) | ✅ 정상 |
| 심사 없는 갱신 | ❌ (유료 Live Update 필요) | ✅ 웹 배포 즉시 반영 |
| 오프라인 | ✅ | ❌ |

**이 프로젝트는 B(원격 URL)를 채택합니다.** 근거는 두 가지입니다.

**첫째, API Route가 사라집니다.** 현재 `src/app/api/` 아래에 Route Handler가 26개 있습니다.

```
api/auth/google/callback   api/copilot          api/push/subscribe
api/auth/signin            api/briefing/daily   api/tasks/classify
api/upload                 api/mails            ... 외 다수
```

`next.config.ts`에 `output: 'export'`를 켜면 Next.js는 이 핸들러들을 **빌드 산출물에서 제외합니다.** 빌드 에러도 나지 않고 조용히 빠지기 때문에, 앱을 실행해 봐야 로그인·Copilot·푸시·업로드가 전부 죽어 있는 걸 발견하게 됩니다.

**둘째, 쿠키 세션이 깨집니다.** 정적 번들 방식에서 WebView의 origin은 `capacitor://localhost`입니다. 여기서 `https://coffeetide.dongple.kr/api/*`를 호출하면 **크로스 사이트 요청**이 되어, 현재 이 앱이 쓰는 세션 쿠키가 붙지 않습니다(`SameSite`). 원격 URL 방식은 앱 자체가 실제 https origin에서 로드되므로 웹과 완전히 동일하게 동작합니다.

> **트레이드오프**: B는 Apple 심사 지침 **4.2(최소 기능성)** 반려 위험이 A보다 높습니다. "사파리로 열면 되는 걸 왜 앱으로 냈나"는 지적을 받기 쉽기 때문입니다. §4.2의 대응책을 반드시 함께 적용하세요.

---

## 2. 앱 개발 단계 (Capacitor 연동)

### Step 1. Capacitor 초기 세팅

```bash
npm install @capacitor/core @capacitor/cli
npx cap init coffeeTide com.dongple.coffeetide
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
```

### Step 2. `next.config.ts` — 수정하지 않습니다

원격 URL 방식에서는 Next.js 빌드 설정을 **건드릴 필요가 없습니다.** Vercel에 배포된 결과물을 그대로 사용합니다.

```ts
// next.config.ts — 현행 유지
const nextConfig: NextConfig = {};
export default nextConfig;
```

> ⚠️ 다른 Capacitor 튜토리얼을 참고할 때 `output: 'export'` 를 켜라는 안내가 나오면 **따르지 마세요.** §1의 이유로 이 프로젝트에는 적용되지 않습니다.

### Step 3. Capacitor를 운영 서버에 연결

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dongple.coffeetide',
  appName: 'coffeeTide',
  webDir: 'public',            // 원격 로드라 실사용은 안 하지만 CLI가 존재를 요구함
  server: {
    url: 'https://coffeetide.dongple.kr',
    cleartext: false,          // https 강제
  },
};

export default config;
```

이후 `npx cap sync`로 네이티브 프로젝트에 설정을 반영합니다.

> **개발 중에는** `server.url`을 로컬 개발 서버(`http://192.168.0.x:3000`)로 바꾸면 핫 리로드가 그대로 동작합니다. 이때만 `cleartext: true`가 필요하며, **출시 빌드에서는 반드시 되돌리세요.**

### Step 4. 네이티브 기능 연동

#### 4-1. 위치 (날씨 그리팅용)

```bash
npm install @capacitor/geolocation
npx cap sync
```

`ios/App/App/Info.plist`에 사용 목적 문구를 추가합니다. **누락 시 위치를 요청하는 순간 앱이 크래시합니다.**

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 날씨에 맞는 브리핑을 보여드리기 위해 위치를 사용합니다.</string>
```

Android는 `AndroidManifest.xml`에 `ACCESS_COARSE_LOCATION`을 선언합니다. 날씨 용도라면 정밀 위치(`FINE`)는 불필요하며, 심사·개인정보 측면에서도 `COARSE`만 요청하는 편이 유리합니다.

#### 4-2. 푸시 알림 — ⚠️ 별도 구현이 필요합니다

현재 서버는 `web-push`(VAPID) 기반 **Web Push**를 씁니다. 그런데 **iOS WKWebView 안에서는 Web Push가 동작하지 않습니다.** iOS의 Web Push는 홈 화면에 추가한 PWA에서만 지원되며, Capacitor 컨테이너에는 적용되지 않습니다.

따라서 앱에서는 네이티브 경로가 필요합니다.

```bash
npm install @capacitor/push-notifications
npx cap sync
```

이는 플러그인 설치로 끝나는 작업이 아니라 **서버 발송 로직까지 갈리는 변경**입니다.

- 웹(브라우저): 기존 VAPID / `web-push` — 유지
- 앱(iOS/Android): FCM 토큰 발급 → 서버 저장 → FCM/APNs로 발송

`src/lib/push/store.ts`의 프로필 스키마에 토큰 종류(`webpush` | `fcm`) 구분 필드를 추가하고, 발송부에서 분기해야 합니다. 별도 작업 항목으로 잡으시길 권합니다.

Android 13(API 33) 이상은 `POST_NOTIFICATIONS` 런타임 권한 요청이 추가로 필요합니다.

#### 4-3. OAuth 로그인 — 시스템 브라우저로 우회

Google은 **임베디드 WebView 내 OAuth를 차단**합니다(`disallowed_useragent`). 앱 안에서 그냥 구글 로그인을 누르면 실패합니다.

```bash
npm install @capacitor/browser @capacitor/app
```

흐름을 이렇게 바꿉니다.

1. 로그인 버튼 → `Browser.open()`으로 **시스템 브라우저**에 인증 URL을 띄움
2. 구글 인증 완료 → 기존 `/api/auth/google/callback`이 처리
3. 콜백이 커스텀 스킴(`coffeetide://auth/done`)으로 리다이렉트
4. `App.addListener('appUrlOpen', ...)`으로 앱 복귀 및 세션 반영

Android는 App Links, iOS는 Universal Links 또는 커스텀 URL 스킴 등록이 필요합니다.

---

## 3. 로컬 빌드 및 테스트 단계

### iOS 테스트
1. Mac 환경과 **Xcode**가 필요합니다.
2. `npx cap open ios` 로 Xcode를 엽니다.
3. 시뮬레이터 또는 연결된 실제 기기를 선택하고 `Run`으로 실행합니다.
   - 푸시 알림은 **시뮬레이터에서 검증되지 않습니다.** 실기기 + 유료 개발자 계정이 필요합니다.

### Android 테스트
1. **Android Studio**가 필요합니다.
2. `npx cap open android` 로 Android Studio를 엽니다.
3. 에뮬레이터 또는 실제 기기에서 실행합니다.

### 출시 전 점검
- [ ] `capacitor.config.ts`의 `server.url`이 운영 도메인인가 (로컬 IP가 남아있지 않은가)
- [ ] `cleartext: false` 인가
- [ ] 기내 모드에서 실행 시 흰 화면이 아니라 안내 화면이 뜨는가

---

## 4. 앱 스토어 출시 단계

껍데기가 완성되면 실제 스토어에 배포하는 과정이 남습니다. 이 과정은 **개발자 계정 등록비**와 **심사(Review)** 가 필요합니다.

### 4.1. Google Play Store (Android) 출시
1. **계정 등록**: Google Play Console 가입 및 등록비($25, 평생 1회) 결제.
2. **앱 서명 및 번들 생성**: Android Studio에서 `Build > Generate Signed Bundle / APK`로 `.aab`를 생성합니다. 이때 만든 KeyStore는 **분실 시 앱 업데이트가 영구 불가**하므로 안전하게 보관하세요.
3. **스토어 등록**: 앱 이름, 설명, 스크린샷, 개인정보처리방침 URL을 등록합니다.
4. **데이터 보안(Data Safety) 양식**: 위치·개인정보 수집 항목을 신고해야 합니다. §2의 위치 권한이 여기에 해당합니다.
5. **출시**: `.aab` 업로드 후 심사를 요청합니다. 보통 1~7일 소요됩니다.

### 4.2. Apple App Store (iOS) 출시
1. **계정 등록**: Apple Developer Program 가입 및 등록비($99, 매년) 결제.
2. **인증서 및 프로비저닝 프로파일**: 앱 ID 등록 후 인증서를 발급받아 Xcode에 연결합니다.
3. **아카이브 및 업로드**: 기기를 `Any iOS Device`로 설정 → `Product > Archive` → Organizer에서 `Distribute App`으로 App Store Connect에 업로드합니다.
4. **스토어 등록**: 메타데이터와 개인정보처리방침을 작성합니다.
5. **심사**: 보통 1~3일 소요됩니다.

#### ⚠️ 반려 위험 2가지 (사전 대응 필수)

**(1) 지침 4.8 — Sign in with Apple 병기 의무**
앱이 Google 로그인 같은 제3자 소셜 로그인을 제공하면, iOS 앱에는 **Sign in with Apple을 함께 제공해야 합니다.** 누락 시 거의 확정 반려입니다.
→ 대안: 앱에서는 소셜 로그인을 숨기고 자체 이메일 로그인만 노출하는 방법도 있습니다. (기존 `/api/auth/signin` 활용)

**(2) 지침 4.2 — 최소 기능성 (단순 웹 래퍼)**
원격 URL 방식은 이 지적을 받기 가장 쉬운 형태입니다. 대응책:
- 네이티브 하단 탭 바 제공 (웹 화면을 감싸는 네이티브 셸)
- 네이티브 푸시 알림 (§4-2) — 가장 강력한 근거
- 네이티브 위치 기반 날씨 그리팅 (§4-1)
- 스플래시 스크린 및 앱 아이콘 커스터마이징
- 심사 노트(Review Notes)에 위 기능들을 **명시적으로 기재**

---

## 5. 유지보수 이점

원격 URL 방식의 가장 큰 실익입니다.

**UI나 프론트엔드 로직(Next.js 코드)이 바뀔 때마다 앱 스토어 심사를 다시 받을 필요가 없습니다.** 앱은 실행 시마다 `coffeetide.dongple.kr`의 최신 페이지를 로드하므로, **Vercel에 웹을 배포하면 모든 사용자의 앱에 즉시 반영됩니다.**

단, 아래 변경은 **네이티브 재빌드 및 심사가 필요합니다.**
- 앱 아이콘 / 스플래시 스크린 변경
- 새로운 네이티브 권한 추가 (예: 카메라)
- Capacitor 플러그인 추가·버전 업
- `capacitor.config.ts` 수정 (도메인 변경 포함)

> 도메인은 사실상 앱에 하드코딩되는 값입니다. 운영 도메인을 옮길 계획이 있다면 **첫 출시 전에** 확정하세요.
