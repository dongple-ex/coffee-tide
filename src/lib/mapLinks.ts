// 지도 앱 연동 링크 빌더.
//
// 카카오맵·네이버지도 **앱 스킴은 둘 다 좌표가 필수**다(장소 이름만으로는 동작하지 않는다).
//  - 카카오맵: kakaomap://route?sp={lat},{lng}&ep={lat},{lng}&by={car|publictransit|foot|bicycle}
//    https://apis.map.kakao.com/android_v2/docs/api-guide/urlscheme/
//  - 네이버지도: nmap://route/{car|public}?slat=&slng=&sname=&dlat=&dlng=&dname=&appname=
//    https://guide.ncloud-docs.com/docs/maps-url-scheme
//
// 좌표가 없을 때는 이름만으로 동작하는 웹 경로로 내린다.
//  - 카카오맵 웹은 이름 기반 길찾기를 지원한다(sName/eName).
//  - 네이버지도 웹 길찾기는 좌표(또는 내부 place id)를 요구하므로, 목적지 검색으로 내린다.
//
// 좌표는 클라이언트에만 두고 서버로 보내지 않는다 — 집/회사 위치는 날씨용 절삭 좌표보다 민감하다.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapLinkInput {
  origin: string;
  destination: string;
  originCoords?: LatLng | null;
  destCoords?: LatLng | null;
  isCar: boolean;
}

export interface MapLinks {
  kakaoWebUrl: string;
  naverWebUrl: string;
  /** 좌표가 없으면 null — 호출부는 웹으로만 연다 */
  kakaoAppScheme: string | null;
  naverAppScheme: string | null;
  /** 앱 딥링크 가능 여부 (UI 안내용) */
  hasCoords: boolean;
}

/** 네이버 URL Scheme의 호출 주체 식별자 */
const NAVER_APP_NAME = "coffeetide.dongple.kr";

function isValidCoords(c?: LatLng | null): c is LatLng {
  return (
    !!c &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    c.lat >= -90 &&
    c.lat <= 90 &&
    c.lng >= -180 &&
    c.lng <= 180
  );
}

export function buildMapLinks({
  origin,
  destination,
  originCoords,
  destCoords,
  isCar,
}: MapLinkInput): MapLinks {
  const o = encodeURIComponent(origin);
  const d = encodeURIComponent(destination);

  const hasCoords = isValidCoords(originCoords) && isValidCoords(destCoords);

  // 카카오맵 공식 Web Link API URL:
  // 좌표가 있을 때: https://map.kakao.com/link/from/출발지,lat,lng/to/목적지,lat,lng
  // 좌표가 없을 때: https://map.kakao.com/link/to/목적지
  const kakaoWebUrl = hasCoords
    ? `https://map.kakao.com/link/from/${o},${originCoords.lat},${originCoords.lng}/to/${d},${destCoords.lat},${destCoords.lng}`
    : `https://map.kakao.com/link/to/${d}`;

  // 네이버지도 공식 Web Link URL:
  const naverWebUrl = hasCoords
    ? `https://map.naver.com/p/directions/${originCoords.lng},${originCoords.lat},${o}/${destCoords.lng},${destCoords.lat},${d}/${isCar ? "car" : "transit"}`
    : `https://map.naver.com/p/search/${d}`;

  if (!hasCoords) {
    return { kakaoWebUrl, naverWebUrl, kakaoAppScheme: null, naverAppScheme: null, hasCoords: false };
  }

  const kakaoAppScheme =
    `kakaomap://route?sp=${originCoords.lat},${originCoords.lng}` +
    `&ep=${destCoords.lat},${destCoords.lng}` +
    `&by=${isCar ? "CAR" : "PUBLICTRANSIT"}`;

  const naverAppScheme =
    `nmap://route/${isCar ? "car" : "public"}` +
    `?slat=${originCoords.lat}&slng=${originCoords.lng}&sname=${o}` +
    `&dlat=${destCoords.lat}&dlng=${destCoords.lng}&dname=${d}` +
    `&appname=${NAVER_APP_NAME}`;

  return { kakaoWebUrl, naverWebUrl, kakaoAppScheme, naverAppScheme, hasCoords: true };
}
