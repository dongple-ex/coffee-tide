import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { Readable } from "stream";
import { POST } from "./route";

// msedge-tts mock
vi.mock("msedge-tts", () => {
  class MockMsEdgeTTS {
    async setMetadata() {
      return Promise.resolve();
    }
    toStream() {
      const readable = Readable.from([Buffer.from("mock-audio-data")]);
      return { audioStream: readable, metadataStream: null };
    }
    close() {}
  }

  return {
    OUTPUT_FORMAT: {
      AUDIO_24KHZ_48KBITRATE_MONO_MP3: "audio-24khz-48kbitrate-mono-mp3",
    },
    MsEdgeTTS: MockMsEdgeTTS,
  };
});

describe("/api/voice/tts", () => {
  it("returns 400 when text is empty", async () => {
    const req = new NextRequest("http://localhost:3000/api/voice/tts", {
      method: "POST",
      body: JSON.stringify({ text: "" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("synthesizes audio and returns audio/mpeg for valid text", async () => {
    const req = new NextRequest("http://localhost:3000/api/voice/tts", {
      method: "POST",
      body: JSON.stringify({
        text: "안녕하세요 팀장님! 오늘 일정 정리해 드릴게요.",
        presetId: "karina",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    const arrayBuffer = await res.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);
  });
});
