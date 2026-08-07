// DB 클라이언트 설정 및 환경변수 감지 (Supabase / Upstash / Guest Fallback)

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function getActiveDbProvider(): "supabase" | "upstash" | "guest" {
  if (isSupabaseConfigured()) return "supabase";
  if (isUpstashConfigured()) return "upstash";
  return "guest";
}
