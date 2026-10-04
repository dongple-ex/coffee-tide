import { NextRequest } from "next/server";
import { youtubeEmbedUrl, YOUTUBE_PIP_MESSAGE } from "@/lib/youtube/embed";

/** Document PiP의 about:blank 대신 HTTP 주소를 가진 문서에서 YouTube를 로드한다. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const videoId = params.get("v") ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return new Response("잘못된 동영상 주소입니다.", { status: 400 });
  const requestedStart = Number(params.get("start"));
  const requestedRate = Number(params.get("rate"));
  const playback = {
    start: Number.isFinite(requestedStart) ? Math.max(0, Math.min(604800, Math.floor(requestedStart))) : 0,
    autoplay: params.get("autoplay") === "1",
    muted: params.get("muted") === "1",
    rate: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(requestedRate) ? requestedRate : 1,
  };
  // src는 허용된 동영상 ID와 고정 YouTube 호스트만 사용한다.
  const src = youtubeEmbedUrl(videoId, request.nextUrl.origin, playback).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return new Response(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><title>CoffeeTide 화면속 화면</title>
<style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style></head>
<body><iframe id="player" title="YouTube 동영상" src="${src}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
<script>
const settings = ${JSON.stringify(playback)};
const controller = window.parent.opener || window.parent;
const frame = document.getElementById("player");
const embedUrl = new URL(frame.src);
embedUrl.searchParams.set("origin", location.origin);
frame.src = embedUrl.href;
let player;
let ready = false;
let timer;
const send = (payload) => controller.postMessage({type: "${YOUTUBE_PIP_MESSAGE}", payload}, location.origin);
const report = () => {
  if (ready) send({event: "infoDelivery", info: {currentTime: player.getCurrentTime(), playerState: player.getPlayerState(), duration: player.getDuration(), muted: player.isMuted(), playbackRate: player.getPlaybackRate()}});
};
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("player", {events: {
    onReady: () => {
      ready = true;
      player.setPlaybackRate(settings.rate);
      if (settings.muted) player.mute();
      send({event: "onReady"});
      if (settings.autoplay) player.playVideo();
      else player.pauseVideo();
      report();
      timer = setInterval(report, 250);
    },
    onStateChange: report,
    onError: (event) => send({event: "onError", info: event.data}),
    onAutoplayBlocked: () => send({event: "onAutoplayBlocked"})
  }});
};
const commands = new Set(["playVideo", "pauseVideo", "seekTo", "mute", "unMute", "setPlaybackRate"]);
window.addEventListener("message", (event) => {
  if (!ready || event.origin !== location.origin || event.source !== controller) return;
  try {
    const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    if (data?.event === "command" && commands.has(data.func) && Array.isArray(data.args)) {
      player[data.func](...data.args);
      report();
    }
  } catch {}
});
window.addEventListener("pagehide", () => { clearInterval(timer); report(); });
</script><script src="https://www.youtube.com/iframe_api" referrerpolicy="strict-origin-when-cross-origin" async></script></body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
      "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'; base-uri 'none'; object-src 'none'",
    },
  });
}
