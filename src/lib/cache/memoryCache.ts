/**
 * 라우트용 인메모리 TTL 캐시 — 만료 검사와 항목 수 상한을 내장해
 * 사용자 입력 기반 키(좌표·정류소 등)로 인한 무한 증가를 막는다.
 * (알려진 한계: 프로세스 재시작 시 소멸, 인스턴스 간 비공유)
 */
export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 100): TtlCache<T> {
  const store = new Map<string, { value: T; time: number }>();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() - entry.time >= ttlMs) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (store.size >= maxEntries) {
        const now = Date.now();
        for (const [existingKey, entry] of store) {
          if (now - entry.time >= ttlMs) store.delete(existingKey);
        }
        // 만료분을 걷어내도 가득하면 삽입 순서가 가장 오래된 항목부터 제거
        while (store.size >= maxEntries) {
          const oldestKey = store.keys().next().value;
          if (oldestKey === undefined) break;
          store.delete(oldestKey);
        }
      }
      store.set(key, { value, time: Date.now() });
    },
  };
}
