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

/**
 * WGS84 위경도를 기상청 격자 좌표(NX, NY)로 변환하는 LCC 공식
 */
function dfs_xy_conv(v1: number, v2: number): { nx: number; ny: number } {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0; // 투영 위도1(degree)
  const SLAT2 = 60.0; // 투영 위도2(degree)
  const OLON = 126.0; // 기준점 경도(degree)
  const OLAT = 38.0; // 기준점 위도(degree)
  const XO = 43; // 기준점 X좌표(GRID)
  const YO = 136; // 기준점 Y좌표(GRID)

  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  const ra = Math.tan(Math.PI * 0.25 + v1 * DEGRAD * 0.5);
  const ra_calc = (re * sf) / Math.pow(ra, sn);
  let theta = v2 * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const x = Math.floor(ra_calc * Math.sin(theta) + XO + 0.5);
  const y = Math.floor(ro - ra_calc * Math.cos(theta) + YO + 0.5);

  return { nx: x, ny: y };
}

/**
 * 기상청 공식 가이드 기준 base_date, base_time 계산
 * - 초단기실황(getUltraSrtNcst): 매시 10분 이후 갱신 (10분 미만이면 이전 시간 00분)
 * - 초단기예보(getUltraSrtFcst): 매시 45분 이후 갱신 (45분 미만이면 이전 시간 30분)
 */
function getKmaNcstBaseDateTime(): { baseDate: string; baseTime: string } {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 60 * 60 * 1000);

  let year = kst.getFullYear();
  let month = kst.getMonth() + 1;
  let date = kst.getDate();
  let hours = kst.getHours();
  let minutes = kst.getMinutes();

  // 가이드 문서: 매시 10분 이후 호출
  if (minutes < 10) {
    hours -= 1;
    if (hours < 0) {
      hours = 23;
      kst.setDate(kst.getDate() - 1);
      year = kst.getFullYear();
      month = kst.getMonth() + 1;
      date = kst.getDate();
    }
  }

  const baseDate = `${year}${String(month).padStart(2, "0")}${String(date).padStart(2, "0")}`;
  const baseTime = `${String(hours).padStart(2, "0")}00`;
  return { baseDate, baseTime };
}

function getKmaFcstBaseDateTime(): { baseDate: string; baseTime: string } {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 60 * 60 * 1000);

  let year = kst.getFullYear();
  let month = kst.getMonth() + 1;
  let date = kst.getDate();
  let hours = kst.getHours();
  let minutes = kst.getMinutes();

  // 가이드 문서: 매시 45분 이후 호출 (base_time: HH30)
  if (minutes < 45) {
    hours -= 1;
    if (hours < 0) {
      hours = 23;
      kst.setDate(kst.getDate() - 1);
      year = kst.getFullYear();
      month = kst.getMonth() + 1;
      date = kst.getDate();
    }
    const baseDate = `${year}${String(month).padStart(2, "0")}${String(date).padStart(2, "0")}`;
    const baseTime = `${String(hours).padStart(2, "0")}30`;
    return { baseDate, baseTime };
  }

  const baseDate = `${year}${String(month).padStart(2, "0")}${String(date).padStart(2, "0")}`;
  const baseTime = `${String(hours).padStart(2, "0")}30`;
  return { baseDate, baseTime };
}

/**
 * WGS84 좌표 기반 한글 행정동/구 이름 역지오코딩 (Reverse Geocoding)
 */
async function fetchKoreanDistrictName(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return "현재 위치";
    const data = (await res.json()) as {
      locality?: string;
      city?: string;
      localityInfo?: {
        administrative?: Array<{ name: string; order?: number }>;
      };
    };

    const admins = data.localityInfo?.administrative ?? [];

    // 1차 검색: '동', '읍', '면'으로 끝나는 이름 (예: 역삼동, 서초동)
    const dongObj = admins.slice().reverse().find((a) => /[동읍면]$/.test(a.name));
    if (dongObj) return dongObj.name;

    // 2차 검색: '구', '군'으로 끝나는 이름 (예: 강남구, 서초구)
    const guObj = admins.slice().reverse().find((a) => /[구군]$/.test(a.name));
    if (guObj) return guObj.name;

    if (data.locality) return data.locality;
    if (data.city) return data.city;
    return "현재 위치";
  } catch {
    return "현재 위치";
  }
}

/**
 * 공공데이터포털 기상청 단기예보/초단기실황 조회 (가이드 문서 명세 적용)
 */
async function fetchKmaWeather(lat: number, lon: number, serviceKey: string) {
  const { nx, ny } = dfs_xy_conv(lat, lon);
  const ncstTime = getKmaNcstBaseDateTime();
  const fcstTime = getKmaFcstBaseDateTime();

  // 서비스키 이중 인코딩 방지 (Decoding 키든 Encoding 키든 안전하게 처리)
  const decodedKey = decodeURIComponent(serviceKey);
  const encodedKey = encodeURIComponent(decodedKey);

  const ncstUrl = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${encodedKey}&numOfRows=10&pageNo=1&dataType=JSON&base_date=${ncstTime.baseDate}&base_time=${ncstTime.baseTime}&nx=${nx}&ny=${ny}`;
  const fcstUrl = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?serviceKey=${encodedKey}&numOfRows=20&pageNo=1&dataType=JSON&base_date=${fcstTime.baseDate}&base_time=${fcstTime.baseTime}&nx=${nx}&ny=${ny}`;

  const [ncstRes, fcstRes] = await Promise.all([
    fetch(ncstUrl, { next: { revalidate: 600 } }),
    fetch(fcstUrl, { next: { revalidate: 600 } }),
  ]);

  if (!ncstRes.ok) {
    throw new Error(`KMA Ncst API returned status ${ncstRes.status}`);
  }

  const ncstJson = await ncstRes.json();
  const ncstItems = ncstJson.response?.body?.items?.item ?? [];

  let temp = 0;
  let pty = "0";

  for (const item of ncstItems) {
    if (item.category === "T1H") temp = Math.round(parseFloat(item.obsrValue));
    if (item.category === "PTY") pty = String(item.obsrValue);
  }

  let sky = "1";
  if (fcstRes.ok) {
    try {
      const fcstJson = await fcstRes.json();
      const fcstItems = fcstJson.response?.body?.items?.item ?? [];
      const skyItem = fcstItems.find((i: { category: string }) => i.category === "SKY");
      if (skyItem) sky = String(skyItem.fcstValue);
    } catch {
      // fcst 실패 시 pty 활용
    }
  }

  // 가이드 문서 PTY 코드표: 0=없음, 1=비, 2=비/눈, 3=눈, 5=빗방울, 6=빗방울눈날림, 7=눈날림
  // 가이드 문서 SKY 코드표: 1=맑음, 3=구름많음, 4=흐림
  let description = "맑음";
  let main = "Clear";

  if (pty === "1" || pty === "5") {
    description = "비";
    main = "Rain";
  } else if (pty === "2" || pty === "6") {
    description = "비/눈";
    main = "Rain/Snow";
  } else if (pty === "3" || pty === "7") {
    description = "눈";
    main = "Snow";
  } else {
    if (sky === "3") {
      description = "구름많음";
      main = "Clouds";
    } else if (sky === "4") {
      description = "흐림";
      main = "Clouds";
    } else {
      description = "맑음";
      main = "Clear";
    }
  }

  const districtName = await fetchKoreanDistrictName(lat, lon);
  return {
    temp,
    description,
    main,
    city: districtName,
  };
}

/**
 * OpenWeatherMap 대체 호출
 */
async function fetchOpenWeatherMap(lat: number, lon: number, apiKey: string) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`;
  const res = await fetch(url, { next: { revalidate: 1200 } });

  if (!res.ok) {
    throw new Error(`OpenWeatherMap returned status ${res.status}`);
  }

  const json = await res.json();
  const districtName = await fetchKoreanDistrictName(lat, lon);
  return {
    temp: Math.round(json.main?.temp ?? 0),
    description: json.weather?.[0]?.description ?? "맑음",
    main: json.weather?.[0]?.main ?? "Clear",
    city: districtName !== "현재 위치" ? districtName : (json.name ?? "현재 위치"),
  };
}

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

  const latNum = parseFloat(latRaw);
  const lonNum = parseFloat(lonRaw);
  const lat = latNum.toFixed(2);
  const lon = lonNum.toFixed(2);
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

  // 1. 기상청 API 시도 (WEATHER_API_KEY 사용)
  try {
    const kmaData = await fetchKmaWeather(latNum, lonNum, apiKey);
    weatherCache.set(cacheKey, { timestamp: now, data: kmaData });
    return NextResponse.json({ success: true, weather: kmaData, source: "kma", cached: false });
  } catch (kmaErr) {
    console.warn("[Weather API] KMA Weather API call failed, trying OpenWeatherMap fallback:", kmaErr);
  }

  // 2. OpenWeatherMap 대체 시도 (WEATHER_API_KEY 사용)
  try {
    const owmData = await fetchOpenWeatherMap(latNum, lonNum, apiKey);
    weatherCache.set(cacheKey, { timestamp: now, data: owmData });
    return NextResponse.json({ success: true, weather: owmData, source: "openweathermap", cached: false });
  } catch (owmErr) {
    console.warn("[Weather API] OpenWeatherMap call failed:", owmErr);
  }

  return NextResponse.json({
    success: false,
    reason: "All weather services failed",
  });
}

