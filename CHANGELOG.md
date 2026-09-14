# coffeeTide Changelog

모든 주요 변경사항은 이 문서에 기록됩니다. 버전 관리는 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [v1.2.0] - 2026-09-14

### 🚀 신규 기능 (Features)
- **지식 아카이브 & RAG 검색 파이프라인**
  - AI 캔버스에서 작성 완료된 문서를 로컬(IndexedDB), 클라우드(Supabase), Google Drive에 분할 보관
  - 한국어 형태소/어휘 추출(`vocabulary.ts`) 및 청크 분할 기반 벡터/키워드 RAG 파이프라인 구축
  - AI 코파일럿 및 캔버스 확장(expand/custom) 시 관련 아카이브 문서를 지식 증거(Evidence)로 자동 주입
  - 지식 아카이브 검색 및 캔버스 복원(Reopen) 전용 모달 UI(`KnowledgeArchiveModal`) 추가
- **3D 캔버스 다이어리/칠판 뷰어 & Document PiP**
  - 양면 펼침 책자 3D 애니메이션 효과, 칠판 및 다이어리 질감 테마 스킨 지원
  - 캔버스 반응형 자동 폭 맞춤 및 50% 축소 줌 모드 추가
  - 브라우저 Document PiP API를 활용한 데스크톱 '항상 위' 독립 분리 창 지원
- **AI 컴패니언 Phase 16/17 (기억·성장·관계성 엔진)**
  - 대화 에피소드 자동 요약 및 기억 저장소(`sessionMemory`, `memoryRetrieval`) 구현
  - 페르소나별 고유 아바타 배정 및 친밀도/성장 엔진(`growthAnalyzer`, `relationshipEngine`) 구축
  - 자모 분리 오타 보정(`hangulTypo`) 및 AI 반복/퇴행 응답 필터링(`sanitizeResponse`)
- **버전 및 업데이트 관리 체계 (What's New)**
  - 신규 버전 감지 시 헤더 및 설정 모달에 `NEW` 업데이트 배지 표시
  - 버전 뱃지 클릭 시 최신 릴리즈 소식과 히스토리를 확인하는 What's New 모달 제공
  - `package.json`과 코드 내 버전 일치를 자동 검증하는 단위 테스트 구축

### ⚡ 개선 사항 (Enhancements)
- **Google Calendar & Drive 수집 연동 안정화**
  - 외부 서비스 인증 만료 시 안전한 폴백 및 부분 실패 격리
  - 업무 추출 시 Drive 일일 백업 폴더 자동 관리
- **모바일 챗 및 테마 UI 최적화**
  - 바리스타 팝업 대화창 모바일 폭 맞춤 및 셀렉트 드롭다운 퀵 리플라이 개선
  - 라이트 및 노트북 테마에서의 배지 및 패널 시인성 향상

---

## [v1.1.0] - 2026-08-20

### ⚡ 개선 사항 (Enhancements)
- 모바일 화면 폭에 최적화된 바리스타 대화창 및 반응형 컨트롤 적용
- 퀵 리플라이 선택 드롭다운 UI 도입
- Notebook 및 라이트 테마 배지 시인성 향상
- Chrome Built-in AI (Prompt API) 지원 환경 감지 및 플래그 가이드 제공

---

## [v1.0.0] - 2026-07-15

### 🚀 최초 릴리스 (Initial Release)
- Google Calendar, Outlook, Gmail, Notion 통합 워크스페이스 구축
- 아침 데스크 브리핑 스케줄러 및 AI 바리스타 대화 기능
- 스마트 캔버스 문서 작성, 일정 추출 및 로컬 자동 저장
