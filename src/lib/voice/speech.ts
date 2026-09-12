"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin wrapper over the browser's built-in speech recognition (Web Speech
 * API — Google's Turkish recogniser on Android Chrome, free, needs internet).
 * Audio never leaves the browser API; only text reaches the app.
 */
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function ctor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return ctor() != null;
}

export type UseSpeech = {
  supported: boolean;
  listening: boolean;
  /** Words recognised so far in the current session (final only). */
  transcript: string;
  /** Live, not-yet-final text. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

const ERRORS: Record<string, string> = {
  "not-allowed": "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verin.",
  "service-not-allowed": "Bu tarayıcıda sesli yazma kullanılamıyor.",
  network: "Sesli yazma için internet bağlantısı gerekli.",
  "audio-capture": "Mikrofon bulunamadı.",
  "no-speech": "Ses algılanmadı.",
};

export function useSpeech(opts: { lang?: string; onFinal?: (text: string) => void } = {}): UseSpeech {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);
  const wantRef = useRef(false);
  const onFinalRef = useRef(opts.onFinal);
  onFinalRef.current = opts.onFinal;
  const lang = opts.lang ?? "tr-TR";

  useEffect(() => {
    setSupported(speechSupported());
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) {
      setError("Bu tarayıcı sesli yazmayı desteklemiyor.");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError(ERRORS.network);
      return;
    }
    setError(null);
    wantRef.current = true;
    const rec = new C();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText.trim()) {
        setTranscript((p) => (p ? `${p} ${finalText.trim()}` : finalText.trim()));
        onFinalRef.current?.(finalText.trim());
      }
      setInterim(interimText.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // restart handles it
      setError(ERRORS[e.error] ?? `Sesli yazma hatası: ${e.error}`);
      wantRef.current = false;
      setListening(false);
    };
    rec.onend = () => {
      // Android stops after a few seconds of silence; keep going while wanted.
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through */
        }
      }
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Mikrofon başlatılamadı.");
      setListening(false);
    }
  }, [lang]);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
