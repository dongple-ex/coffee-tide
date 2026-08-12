export interface YouTubeVideo {
  id: string;              // 11자리 Video ID
  title: string;           // 영상 제목
  url: string;             // 영상 전체 URL
  thumbnailUrl: string;    // 고화질 썸네일 URL
  publishedAt: string;     // 업로드 일시 (포맷팅된 문자열 또는 ISO)
  channelTitle: string;    // 채널명
  channelId: string;       // 채널 고유 ID (UC...)
  sourceChannelId?: string; // 번들에 등록된 채널 소스 ID
  sourceChannelName?: string; // 번들에 등록된 채널 표시 이름
  description?: string;    // 영상 설명란
  duration?: string;       // 영상 길이 (예: "15:20")
  summary?: string;        // AI 생성 요약
  points?: string[];       // 핵심 포인트
  chapters?: YouTubeChapter[]; // 챕터/타임스탬프 정보
}

export interface YouTubeChapter {
  time: string;            // "03:45"
  seconds: number;         // 225
  label: string;           // 챕터 소제목
}

export interface YouTubeChannelSource {
  id: string;              // 채널 UC ID 또는 핸들
  name: string;            // 채널 표시 이름
  customUrl?: string;      // "@channel" 또는 URL
  avatarUrl?: string;      // 채널 프로필 이미지
  rssUrl: string;          // https://www.youtube.com/feeds/videos.xml?channel_id=...
}

export interface YouTubeBundle {
  id: string;              // 번들 고유 ID (예: "bundle-finance")
  name: string;            // 번들명 (예: "경제·시황 심층")
  icon: string;            // 아이콘 이모지 (예: "📈")
  category: "finance" | "tech" | "sports" | "bgm" | "study" | "growth" | "custom" | string;
  isPreset?: boolean;      // 기본 프리셋 여부
  enabled: boolean;        // 활성화 여부
  channels: YouTubeChannelSource[]; // 포함된 채널 목록
  updatedAt: string;
}

export interface ContextualRecommendation {
  contextType: "morning" | "focus" | "lunch" | "evening" | "night";
  badge: string;           // "☕ 오전 집중 BGM", "📈 모닝 경제"
  headline: string;        // 상황 브리핑 한 줄
  videos: YouTubeVideo[];
  reason: string;          // 추천 사유
}

export interface YouTubeBundleApiResponse {
  success: boolean;
  bundleId: string;
  bundleName: string;
  videos: YouTubeVideo[];
  briefing?: {
    headline: string;
    keyPoints: string[];
  } | null;
  cached?: boolean;
  reason?: string;
  partial?: boolean;
}

export type YouTubeContinuityOwner = "contextual" | "bundle";

export interface YouTubeContinuitySessionV1 {
  version: 1;
  owner: YouTubeContinuityOwner;
  video: YouTubeVideo;
  videoId: string;
  currentTime: number;
  playerState: "playing" | "paused" | "buffering" | "ended" | "unknown";
  wasPlayingOnHide: boolean;
  isMini: boolean;
  scrollY: number;
  activeWidget: string | null;
  chatDraft: string;
  savedAt: string;
  expiresAt: string;
  userScope?: string;
}

