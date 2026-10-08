import { readError, type StudioProvider, type StudioVoice } from "@/lib/tts/server/types";

const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
let cache: { at: number; voices: StudioVoice[] } | null = null;

export const elevenLabsProvider: StudioProvider = {
  id: "elevenlabs",
  name: "ElevenLabs",
  isConfigured() {
    return Boolean(process.env.ELEVENLABS_API_KEY);
  },
  async listVoices() {
    if (cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.voices;
    const fallback = [{ id: DEFAULT_VOICE, name: "Rachel", lang: "en" }];
    try {
      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
      });
      if (!response.ok) return fallback;
      const body = (await response.json()) as {
        voices?: { voice_id: string; name: string; labels?: { language?: string } }[];
      };
      const voices =
        body.voices?.slice(0, 24).map((voice) => ({
          id: voice.voice_id,
          name: voice.name,
          lang: voice.labels?.language || "multi",
        })) ?? fallback;
      cache = { at: Date.now(), voices: voices.length ? voices : fallback };
      return cache.voices;
    } catch {
      return fallback;
    }
  },
  async synthesize(text, voiceId) {
    const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("The ElevenLabs speech key was rejected.");
      throw new Error(await readError(response));
    }
    return new Uint8Array(await response.arrayBuffer());
  },
};
