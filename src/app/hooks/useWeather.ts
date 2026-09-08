"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadLS,
  saveLS,
  LS_WEATHER_ENABLED,
  LS_WEATHER_COORDS,
} from "@/lib/localStore";
import type { WeatherData } from "../components/WelcomeCard";

export interface UseWeatherOptions {
  showToast?: (message: string) => void;
}

/**
 * 날씨 설정, 위치 좌표, 실시간 기상 데이터 조회 훅 (K10)
 */
export function useWeather(options: UseWeatherOptions = {}) {
  const { showToast } = options;

  const [weatherEnabled, setWeatherEnabled] = useState(() =>
    loadLS<boolean>(LS_WEATHER_ENABLED, false)
  );
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lon: number } | null>(() =>
    loadLS<{ lat: number; lon: number } | null>(LS_WEATHER_COORDS, null)
  );
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);

  // 순수 fetch — 상태 갱신은 호출부(비동기 콜백)에서 한다.
  const fetchWeatherData = useCallback(async (lat: number, lon: number): Promise<WeatherData | null> => {
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      const data = (await res.json()) as { success?: boolean; weather?: WeatherData };
      return data.success && data.weather ? data.weather : null;
    } catch (err) {
      console.warn("[coffeeTide] Weather fetch failed:", err);
      return null;
    }
  }, []);

  const enableWeatherLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      showToast?.("이 브라우저는 위치 정보를 지원하지 않아요.");
      return;
    }
    setWeatherBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setWeatherBusy(false);
        const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
        setWeatherCoords(coords);
        setWeatherEnabled(true);
        saveLS(LS_WEATHER_ENABLED, true);
        saveLS(LS_WEATHER_COORDS, coords);
        showToast?.("위치 허용이 완료되어 날씨 브리핑이 활성화되었습니다.");
        void fetchWeatherData(coords.lat, coords.lon).then((weather) => {
          if (weather) setWeatherData(weather);
        });
      },
      (error) => {
        setWeatherBusy(false);
        showToast?.(`위치 권한 오류: ${error.message}`);
      },
      { timeout: 10000 }
    );
  }, [fetchWeatherData, showToast]);

  const disableWeather = useCallback(() => {
    setWeatherEnabled(false);
    setWeatherCoords(null);
    setWeatherData(null);
    saveLS(LS_WEATHER_ENABLED, false);
    saveLS(LS_WEATHER_COORDS, null);
    showToast?.("날씨 브리핑을 껐습니다.");
  }, [showToast]);

  // 날씨 동기화 — 저장된 좌표가 있으면 그 좌표로, 없으면 1회 위치 조회 후 가져온다.
  useEffect(() => {
    if (!weatherEnabled) return;
    let cancelled = false;

    const load = (lat: number, lon: number) => {
      void fetchWeatherData(lat, lon).then((weather) => {
        if (!cancelled && weather) setWeatherData(weather);
      });
    };

    if (weatherCoords) {
      load(weatherCoords.lat, weatherCoords.lon);
    } else if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
          setWeatherCoords(coords);
          saveLS(LS_WEATHER_COORDS, coords);
          load(coords.lat, coords.lon);
        },
        () => {},
        { timeout: 8000 }
      );
    }

    return () => {
      cancelled = true;
    };
  }, [weatherEnabled, weatherCoords, fetchWeatherData]);

  return {
    weatherEnabled,
    weatherCoords,
    weatherData,
    weatherBusy,
    setWeatherEnabled,
    setWeatherCoords,
    setWeatherData,
    fetchWeatherData,
    enableWeatherLocation,
    disableWeather,
    disableWeatherLocation: disableWeather,
  };
}
