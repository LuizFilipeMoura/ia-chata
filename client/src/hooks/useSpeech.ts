import { useCallback, useEffect, useRef, useState } from "react";

// Minimal ambient types: the Web Speech recognition API is not in this TS
// lib.dom version. We declare only what this hook uses (SpeechRecognitionResultList
// is already provided by lib.dom).
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

interface UseSpeechOpts {
  lang: string;
  onTranscript: (text: string) => void;
  onStatus?: (msg: string) => void;
}

export function useSpeech({ lang, onTranscript, onStatus }: UseSpeechOpts) {
  const Impl = (window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }).SpeechRecognition ?? (window as unknown as {
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }).webkitSpeechRecognition;

  const supported = Boolean(Impl);
  const [recording, setRecording] = useState(false);
  const [tts, setTts] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (!Impl) return;
    const rec = new Impl();
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => { setRecording(true); onStatusRef.current?.("Listening…"); };
    rec.onend = () => { setRecording(false); onStatusRef.current?.(""); };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setRecording(false);
      onStatusRef.current?.(`Mic error: ${e.error}`);
    };
    rec.onresult = (e: SpeechRecognitionEvent) =>
      onTranscriptRef.current(e.results[0][0].transcript);
    recRef.current = rec;
    return () => { rec.onresult = null; rec.abort?.(); };
  }, [Impl]);

  const toggleMic = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (recording) { rec.stop(); return; }
    rec.lang = langRef.current;
    try { rec.start(); } catch { /* ignore duplicate start */ }
  }, [recording]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    const voices = window.speechSynthesis.getVoices();
    const pt = voices.find((v) => v.lang === "pt-BR") || voices.find((v) => v.lang?.startsWith("pt"));
    if (pt) u.voice = pt;
    window.speechSynthesis.speak(u);
  }, []);

  const setTtsGuarded = useCallback((v: boolean) => {
    setTts(v);
    if (!v) window.speechSynthesis?.cancel();
  }, []);

  return { supported, recording, toggleMic, tts, setTts: setTtsGuarded, speak };
}
