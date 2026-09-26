"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  cleanTextForSpeech,
  getPersonaVoiceConfig,
  findKoreanVoice,
} from "@/lib/ai/voiceUtils";

// Web Speech API 타입 선언 확장
interface IWindowSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((event: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => IWindowSpeechRecognition;
    webkitSpeechRecognition?: new () => IWindowSpeechRecognition;
  }
}

export interface UsePersonaVoiceChatOptions {
  onTranscriptComplete?: (text: string) => void;
  presetId?: string;
}

export function usePersonaVoiceChat(options?: UsePersonaVoiceChatOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<IWindowSpeechRecognition | null>(null);
  const recognitionGenerationRef = useRef(0);
  const speechGenerationRef = useRef(0);
  const speechAbortRef = useRef<AbortController | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // 브라우저 TTS 음성 목록 로드 (폴백용)
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const updateVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
      }
    };
  }, []);

  // 오디오 메모리 및 객체 정리
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // 발화 중단 (Edge-TTS 및 Web Speech 취소)
  const stopSpeaking = useCallback(() => {
    speechGenerationRef.current += 1;
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    cleanupAudio();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [cleanupAudio]);

  // 컴포넌트 언마운트 시 클린업
  useEffect(() => {
    return () => {
      recognitionGenerationRef.current += 1;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      speechGenerationRef.current += 1;
      speechAbortRef.current?.abort();
      cleanupAudio();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [cleanupAudio]);

  // 폴백용 Web Speech 발화 함수
  const speakWithWebSpeech = useCallback(
    (text: string, presetId: string | undefined, generation: number) => {
      if (generation !== speechGenerationRef.current) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setIsSpeaking(false);
        return;
      }

      window.speechSynthesis.cancel();

      const voiceConfig = getPersonaVoiceConfig(presetId);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.pitch = voiceConfig.pitch;
      utterance.rate = voiceConfig.rate;

      const voice = findKoreanVoice(voicesRef.current, voiceConfig.preferredGender);
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        if (generation === speechGenerationRef.current) setIsSpeaking(true);
      };

      utterance.onend = () => {
        if (generation === speechGenerationRef.current) setIsSpeaking(false);
      };

      utterance.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("[VoiceChat] Speech synthesis error:", e);
        }
        if (generation === speechGenerationRef.current) setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    []
  );

  // 페르소나 목소리로 텍스트 발화 (1차: Edge-TTS mp3, 2차: Web Speech API 폴백)
  const speak = useCallback(
    async (rawText: string, presetIdOverride?: string) => {
      const text = cleanTextForSpeech(rawText);
      if (!text) return;

      stopSpeaking();
      const generation = speechGenerationRef.current;
      const controller = new AbortController();
      speechAbortRef.current = controller;

      const presetId = presetIdOverride || optionsRef.current?.presetId;

      // 1차 시도: 초고품질 서버리스 Edge-TTS 오디오
      try {
        const response = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, presetId }),
          signal: controller.signal,
        });
        if (generation !== speechGenerationRef.current) return;

        if (response.ok) {
          const blob = await response.blob();
          if (generation !== speechGenerationRef.current) return;
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            audioUrlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;
            let fallbackStarted = false;

            audio.onplay = () => {
              if (generation === speechGenerationRef.current) setIsSpeaking(true);
            };

            audio.onended = () => {
              if (generation !== speechGenerationRef.current) return;
              setIsSpeaking(false);
              cleanupAudio();
            };

            audio.onerror = () => {
              if (generation !== speechGenerationRef.current || fallbackStarted) return;
              fallbackStarted = true;
              cleanupAudio();
              speakWithWebSpeech(text, presetId, generation);
            };

            try {
              await audio.play();
              return;
            } catch (playErr: unknown) {
              if (generation !== speechGenerationRef.current || fallbackStarted) return;
              if (
                playErr &&
                typeof playErr === "object" &&
                "name" in playErr &&
                (playErr as { name: string }).name === "AbortError"
              ) {
                // 발화가 취소/중단된 경우 Web Speech로 중복 발화하지 않고 종료
                cleanupAudio();
                return;
              }
              throw playErr;
            }
          }
        }
      } catch (err) {
        if (generation !== speechGenerationRef.current || controller.signal.aborted) return;
        console.warn("[VoiceChat] Edge-TTS error, falling back to Web Speech:", err);
      } finally {
        if (speechAbortRef.current === controller) speechAbortRef.current = null;
      }

      // 2차 폴백: 브라우저 Web Speech API
      if (generation === speechGenerationRef.current) {
        cleanupAudio();
        speakWithWebSpeech(text, presetId, generation);
      }
    },
    [stopSpeaking, cleanupAudio, speakWithWebSpeech]
  );

  // 음성 듣기 정지
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // 이미 종료되었을 수 있음
      }
    }
    setIsListening(false);
  }, []);

  // 음성 듣기 시작 (STT)
  const startListening = useCallback(
    (onComplete?: (text: string) => void) => {
      setError(null);
      stopSpeaking();

      if (typeof window === "undefined") return false;

      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionClass) {
        setError("현재 브라우저는 실시간 음성 인식을 지원하지 않습니다.");
        return false;
      }

      try {
        const generation = ++recognitionGenerationRef.current;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            // 무시
          }
        }

        const recognition = new SpeechRecognitionClass();
        recognition.lang = "ko-KR";
        recognition.continuous = false;
        recognition.interimResults = true;

        let finalTranscript = "";
        let recognitionFailed = false;
        setInterimText("");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          if (generation !== recognitionGenerationRef.current) return;
          finalTranscript = "";
          let currentInterim = "";
          for (let i = 0; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res.isFinal) {
              finalTranscript += res[0].transcript;
            } else {
              currentInterim += res[0].transcript;
            }
          }
          setInterimText(currentInterim || finalTranscript);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onerror = (event: any) => {
          if (generation !== recognitionGenerationRef.current) return;
          recognitionFailed = true;
          if (event.error !== "no-speech" && event.error !== "aborted") {
            setError(`음성 인식 오류: ${event.error}`);
          }
          setIsListening(false);
        };

        recognition.onend = () => {
          if (generation !== recognitionGenerationRef.current) return;
          recognitionRef.current = null;
          setIsListening(false);
          setInterimText("");
          const textToSubmit = finalTranscript.trim();
          if (!recognitionFailed && textToSubmit) {
            if (onComplete) {
              onComplete(textToSubmit);
            } else if (optionsRef.current?.onTranscriptComplete) {
              optionsRef.current.onTranscriptComplete(textToSubmit);
            }
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
        return true;
      } catch (err) {
        recognitionGenerationRef.current += 1;
        recognitionRef.current = null;
        console.error("[VoiceChat] Failed to start recognition:", err);
        setError("마이크 권한을 확인해주세요.");
        setIsListening(false);
        return false;
      }
    },
    [stopSpeaking]
  );

  return {
    isListening,
    isSpeaking,
    interimText,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
