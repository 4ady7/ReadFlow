import { getCachedAudio, putCachedAudio } from "@/lib/storage/db";
import { hashKey } from "@/lib/utils";

export interface SpeechRequest {
  provider: string;
  voice: string;
  lang: string;
  text: string;
  signal: AbortSignal;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function once(request: SpeechRequest) {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: request.text,
      voice: request.voice,
      provider: request.provider,
      lang: request.lang,
    }),
    signal: request.signal,
  });
  if (!response.ok) {
    let message = "The voice couldn't be generated.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep the fallback */
    }
    throw new Error(message);
  }
  return response.arrayBuffer();
}

export async function loadSpeechAudio(request: SpeechRequest) {
  const key = hashKey([request.provider, request.voice, request.text]);
  try {
    const cached = await getCachedAudio(key);
    if (cached) return cached;
  } catch {
    /* cache misses should not stop playback */
  }

  let last: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const audio = await once(request);
      void putCachedAudio(key, audio.slice(0)).catch(() => undefined);
      return audio;
    } catch (error) {
      if (isAbort(error)) throw error;
      last = error instanceof Error ? error : new Error("The voice couldn't be generated.");
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw last ?? new Error("The voice couldn't be generated.");
}
