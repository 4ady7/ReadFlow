import type { StudioVoice } from "@/lib/tts/server/types";

export interface StudioStatus {
  id: string;
  name: string;
  voices: StudioVoice[];
}

export async function fetchStudioStatus(): Promise<StudioStatus[]> {
  try {
    const response = await fetch("/api/tts/status");
    if (!response.ok) return [];
    const body = (await response.json()) as { providers?: StudioStatus[] };
    return body.providers ?? [];
  } catch {
    return [];
  }
}

export function browserSpeechAvailable() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function rankBrowserVoices(voices: SpeechSynthesisVoice[], lang: string) {
  const prefix = lang.slice(0, 2).toLowerCase();
  return [...voices].sort((a, b) => score(b, prefix) - score(a, prefix));
}

function score(voice: SpeechSynthesisVoice, prefix: string) {
  const name = voice.name.toLowerCase();
  let value = 0;
  if (voice.lang.toLowerCase().startsWith(prefix)) value += 50;
  if (/premium|enhanced|natural|neural|siri/.test(name)) value += 40;
  if (name.includes("google") && name.includes("english")) value += 24;
  if (/samantha|daniel|karen|moira|tessa|serena|aaron/.test(name)) value += 18;
  if (voice.localService) value += 4;
  if (voice.default) value += 2;
  if (/compact|novelty/.test(name)) value -= 20;
  return value;
}

export function bestBrowserVoice(voices: SpeechSynthesisVoice[], lang: string) {
  return rankBrowserVoices(voices, lang)[0] ?? null;
}

export function voiceChoice(provider: string, id: string) {
  return `${provider}:${id}`;
}

export function parseVoiceChoice(choice: string | null) {
  if (!choice) return null;
  const index = choice.indexOf(":");
  if (index <= 0) return null;
  return { provider: choice.slice(0, index), id: choice.slice(index + 1) };
}
