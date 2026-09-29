"use client";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Turns rendered markdown into prose a voice can read without symbols. */
export function stripMarkdown(md: string): string {
  let t = md;
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\$\$[\s\S]*?\$\$/g, " ");
  t = t.replace(/\$([^$]+)\$/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/_([^_]+)_/g, "$1");
  t = t.replace(/^\s{0,3}>\s?/gm, "");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/^\s*\|.*\|\s*$/gm, (row) =>
    row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c && !/^:?-{2,}:?$/.test(c))
      .join(", "),
  );
  t = t.replace(/^[-|: ]{3,}$/gm, "");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ");
  t = t.replace(/\n{2,}/g, ". ");
  t = t.replace(/\s+/g, " ");
  return t.trim();
}

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred =
    voices.find((v) => /natural|neural|google|aria|jenny|samantha|zira/i.test(v.name) && v.lang.startsWith("en")) ||
    voices.find((v) => v.lang === "en-IN") ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0];
  cachedVoice = preferred ?? null;
  return cachedVoice;
}

/** The voice list loads asynchronously in some browsers, so warm it once. */
export function primeVoices(): void {
  if (!isSpeechSynthesisSupported()) return;
  pickVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
}

export function cancelSpeech(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing speaking */
  }
}

export interface SpeakOptions {
  rate?: number;
  lang?: string;
  onEnd?: () => void;
}

export function speakText(text: string, opts: SpeakOptions = {}): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  const clean = stripMarkdown(text).slice(0, 6000);
  if (!clean) return false;

  const synth = window.speechSynthesis;
  cancelSpeech();

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = opts.rate ?? 1;
  utterance.pitch = 1;
  if (opts.lang) utterance.lang = opts.lang;
  const voice = pickVoice();
  if (voice) {
    utterance.voice = voice;
    if (!opts.lang) utterance.lang = voice.lang;
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    opts.onEnd?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  // Chrome drops the first utterance when speak() lands in the same tick as load.
  setTimeout(() => synth.speak(utterance), 30);
  return true;
}
