import { readError, type StudioProvider, type StudioVoice } from "@/lib/tts/server/types";

const VOICES: StudioVoice[] = [
  { id: "nova", name: "Nova", lang: "multi" },
  { id: "alloy", name: "Alloy", lang: "multi" },
  { id: "ash", name: "Ash", lang: "multi" },
  { id: "coral", name: "Coral", lang: "multi" },
  { id: "echo", name: "Echo", lang: "multi" },
  { id: "fable", name: "Fable", lang: "multi" },
  { id: "onyx", name: "Onyx", lang: "multi" },
  { id: "sage", name: "Sage", lang: "multi" },
  { id: "shimmer", name: "Shimmer", lang: "multi" },
];

async function requestSpeech(text: string, voiceId: string, model: string) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice: voiceId || "nova",
      input: text,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    const detail = await readError(response);
    const error = new Error(detail);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return new Uint8Array(await response.arrayBuffer());
}

export const openaiProvider: StudioProvider = {
  id: "openai",
  name: "OpenAI",
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  },
  async listVoices() {
    return VOICES;
  },
  async synthesize(text, voiceId) {
    const preferred = process.env.OPENAI_TTS_MODEL || "tts-1-hd";
    try {
      return await requestSpeech(text, voiceId, preferred);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (preferred !== "tts-1-hd" && (status === 400 || status === 404)) {
        return requestSpeech(text, voiceId, "tts-1-hd");
      }
      if (status === 401) throw new Error("The OpenAI speech key was rejected.");
      if (status === 429) throw new Error("The speech service is busy. Wait a moment, then press play.");
      throw error instanceof Error ? error : new Error("OpenAI speech failed.");
    }
  },
};
