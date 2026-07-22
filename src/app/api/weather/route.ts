import { NextResponse } from "next/server";

interface WeatherCacheEntry {
  timestamp: number;
  data: {
    temp: number;
    description: string;
    main: string;
    city: string;
  };
}

// 좌표(소수점 2자리) 기반 서버 인메모리 캐시 (20분 유효)
const weatherCache = new Map<string, WeatherCacheEntry>();
const CACHE_TTL_MS = 20 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");

  if (!latRaw || !lonRaw) {
    return NextResponse.json(
      { success: false, reason: "Missing lat/lon parameters" },
      { status: 400 }
    );
  }

  const lat = parseFloat(latRaw).toFixed(2);
  const lon = parseFloat(lonRaw).toFixed(2);
  const cacheKey = `${lat},${lon}`;
  const now = Date.now();

  const cached = weatherCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, weather: cached.data, cached: true });
  }

  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      reason: "WEATHER_API_KEY environment variable is not configured",
    });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`;
    const res = await fetch(url, { next: { revalidate: 1200 } });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Weather API] OpenWeatherMap request failed (${res.status}): ${errText}`);
      return NextResponse.json({
        success: false,
        reason: `OpenWeatherMap returned status ${res.status}`,
      });
    }

    const json = await res.json();
    const weatherData = {
      temp: Math.round(json.main?.temp ?? 0),
      description: json.weather?.[0]?.description ?? "밝음",
      main: json.weather?.[0]?.main ?? "Clear",
      city: json.name ?? "현재 위치",
    };

    weatherCache.set(cacheKey, { timestamp: now, data: weatherData });

    return NextResponse.json({ success: true, weather: weatherData, cached: false });
  } catch (error) {
    console.error("[Weather API] Failed to fetch weather:", error);
    return NextResponse.json({
      success: false,
      reason: "Internal weather fetch error",
    });
  }
}
