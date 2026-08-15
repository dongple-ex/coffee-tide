"use client";

import { useState, useRef, useCallback } from "react";

const MAX_RECORDING_SECONDS = 10 * 60;
const MAX_RECORDING_BYTES = Math.floor(3.8 * 1024 * 1024);

export interface VoiceRecorderState {
  isRecording: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  reset: () => void;
}

export function useVoiceRecorder(): VoiceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBytesRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setIsRecording(false);
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setIsRecording(false);

        recorder.stream.getTracks().forEach((track) => track.stop());
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];
    recordedBytesRef.current = 0;

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("현재 브라우저는 마이크 입력을 지원하지 않습니다.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 지원되는 MIME 타입 선택
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (mediaRecorder.state !== "inactive") void stopRecording();
        };
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          recordedBytesRef.current += event.data.size;
          if (recordedBytesRef.current >= MAX_RECORDING_BYTES && mediaRecorder.state !== "inactive") {
            void stopRecording();
          }
        }
      };

      mediaRecorder.start(250); // 250ms chunks
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            queueMicrotask(() => void stopRecording());
          }
          return next;
        });
      }, 1000);

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "마이크 권한이 필요합니다.";
      setError(msg);
      return false;
    }
  }, [stopRecording]);

  const cancelRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    setRecordingTime(0);
    setAudioBlob(null);
    chunksRef.current = [];
    recordedBytesRef.current = 0;
  }, []);

  const reset = useCallback(() => {
    cancelRecording();
    setError(null);
  }, [cancelRecording]);

  return {
    isRecording,
    recordingTime,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  };
}
