# 소식 번들과 휴식·도구 폴더

## 사용 방법

휴식·도구 모음은 생활·도구, 소식·번들, 뉴스·읽을거리, 영상·채널 폴더로 표시한다.
폴더별 펼침 상태를 브라우저에 저장하며 이름·주소로 검색할 수 있다. 영상 사이트는
도메인으로 분류한다. 등록된 항목이 없는 폴더는 표시하지 않는다.

같은 URL이 여러 번 저장되어 있으면 탐색 목록에서만 하나로 합친다. 원래 설정을
삭제하지 않으며 현재 열린 위젯의 ID를 우선 보존한다. 주소의 경로와 쿼리는 구분한다.

소식·번들 → 소식 번들에서 주제별 번들을 만들고 다음 소스를 등록한다.

- X 계정 또는 최근 검색어(API 검색 연산자 포함)
- Instagram 공개 비즈니스·크리에이터 계정
- Threads 공개 계정 페이지
- RSS, 공개 사이트 또는 유튜브 채널 URL

등록한 기존 사이트도 선택해 번들에 담을 수 있다. 번들당 소스는 6개, 브라우저별
번들은 20개까지다. 게시물 목록은 URL 중복을 제거하고 해석 가능한 게시 시각순으로
정렬한다. 상대 시각만 제공하는 Threads 게시물은 정확한 날짜로 바꾸지 않는다.
서비스별 필터, 읽음 표시, 최대 100개 게시물 저장을 지원한다. 설정·읽음·저장은
로그인 사용자 스코프별 localStorage에 보관하며 클라우드 동기화는 하지 않는다.

사이트 글은 본문 일부와 원문 링크를 보여준다. 게시 날짜만 제공되는 경우 시각을
만들어 표시하지 않는다.

소스 등록·번들 선택·화면 재진입만으로 수집하지 않는다. `새 소식 가져오기`를 누르면
실제 외부 조회를 시도한다. `AI 브리핑`은 확보한 텍스트만 기존 Gemini 요약기로 전달한다.
AI 미설정이나 실패 시 AI 요약을 생성했다고 표시하지 않는다.

## 서버 설정

`.env.local` 등 서버 환경에 다음 값을 설정하고 서버를 재시작한다. 키는 UI나
localStorage에 입력하지 않는다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

```dotenv
MOCK_MODE=false
X_BEARER_TOKEN=
X_FEED_DAILY_REQUEST_LIMIT=50
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_USER_ID=
INSTAGRAM_GRAPH_API_VERSION=v25.0
```

X는 [Developer Console](https://console.x.com/)에서 개발자 앱의 Bearer Token과
조회 크레딧을 준비한다. 계정 조회는 `/2/users/by/username/{username}` 및
`/2/users/{id}/tweets`, 검색은 `/2/tweets/search/recent`를 사용한다.
한 소스에서 최대 10개 게시물을 조회한다. X 계정은 답글·리포스트를 제외한다.
[X 공식 요금](https://docs.x.com/x-api/getting-started/pricing)은 변동 가능하므로
Console에서 사용량과 지출 한도를 확인한다.

Instagram은 **Facebook Login 방식**의 액세스 토큰과, Facebook 페이지에 연결된
본인 Instagram 프로 계정의 숫자 ID가 필요하다. 해당 계정 노드에서
`business_discovery.username(대상계정){username,media{...}}`로 공개 프로 계정을
조회한다. 필요한 읽기 권한과 실제 서비스 제공에 필요한 앱 심사·접근 수준을
Meta 앱 설정에서 확인한다. Instagram Login 방식의 토큰은 이 경로에 사용하지 않는다.
Graph API 버전은 서버 환경으로 변경할 수 있다.

개인·비공개 계정, 팔로잉 홈 피드, Instagram 해시태그 검색·스토리 수집은 현재
구현 범위에서 제외한다. 관련 문서:
[Meta 공식 API 컬렉션](https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login),
[Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery/).

Threads는 기존 `src/lib/threads/server.ts`의 Jina Reader 공개 페이지 수집기를
재사용한다. 공식 Threads API 연결이 아니며 로그인 요구나 공개 페이지 형식 변경으로
수집이 실패할 수 있다. 사이트·RSS·유튜브는 기존 뉴스 수집 파이프라인을 재사용한다.

## 제한과 검증 범위

- API 키가 없으면 소스별 `연결 필요`를 표시하고 게시물을 만들어 넣지 않는다.
- `MOCK_MODE=true`이면 외부 수집을 비활성화하고 샘플 게시물도 만들지 않는다.
- `설정됨` 배지는 키 존재만 뜻한다. 실제 성공 여부는 수집 결과에서 확인한다.
- 한 소스가 실패해도 다른 소스의 결과와 소스별 실패 안내를 표시한다.
- 소스별 조회 결과와 조회 중 요청은 서버에서 공유한다. 성공·빈 결과는 10분간
  캐시하며 UI에는 원래 확인 시각과 캐시 여부를 표시한다. 갱신 버튼도 캐시를 따른다.
- 요청당 인증을 확인하고 타 사이트 Origin을 거부한다. 사용자당 분당 4회 요청과
  서버 프로세스별 UTC 하루 X HTTP 요청 한도를 적용한다. 계정 ID 조회도 한도에 포함한다.
- 캐시와 한도는 **프로세스 메모리 기반**이다. 서버 재시작·여러 인스턴스·서버리스에서
  전체 과금을 제한하는 장치는 아니다. X Developer Console의 지출 한도를 함께 설정한다.
- 토큰은 HTTP Authorization 헤더로만 외부 API에 전달한다. 외부 오류 본문과 토큰은
  UI에 전달하지 않고, 인증 헤더를 포함하는 리디렉션을 허용하지 않는다.
- 자동 주기 수집, OAuth 연결 UI, 플랫폼 간 사용자 클라우드 동기화는 추가 구현 대상이다.

관련 HTTP 테스트는 모의 응답으로 검증한다. 실계정 게시물 수집·요금 청구·Instagram
앱 심사는 유효한 자격증명으로 별도 확인해야 한다.
