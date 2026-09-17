export interface ThreadsPost {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  authorAvatar?: string;
  publishedAt: string;
  url: string;
  images: string[];
  replyCount?: string;
  likeCount?: string;
  repostCount?: string;
}

export interface ThreadsChannel {
  username: string; // e.g. "zuck"
  displayName: string; // e.g. "Mark Zuckerberg"
  bio?: string;
  avatarUrl?: string;
  profileUrl: string;
  posts: ThreadsPost[];
  error?: string;
}

export interface ThreadsApiResponse {
  success: boolean;
  channels: ThreadsChannel[];
  cached?: boolean;
  error?: string;
}
