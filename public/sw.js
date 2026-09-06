// coffeeTide Service Worker — 웹 푸시 수신 (백로그 H5)

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "🥤 coffeeTide", {
      body: data.body || "",
      tag: data.tag || "coffeetide-briefing",
      // Android Chrome 등은 알림 icon에 SVG를 지원하지 않음 — PNG + 단색 badge로 브랜드 유지
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : `${self.location.origin}/`;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          const navigated = await client.navigate(url);
          if (navigated) return navigated.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
