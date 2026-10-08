import { readError, type StudioProvider, type StudioVoice } from "@/lib/tts/server/types";

const VOICES: StudioVoice[] = [
  { id: "en-US-Neural2-F", name: "Neural2 F", lang: "en-US" },
  { id: "en-US-Neural2-D", name: "Neural2 D", lang: "en-US" },
  { id: "en-US-Neural2-C", name: "Neural2 C", lang: "en-US" },
  { id: "en-GB-Neural2-A", name: "Neural2 A", lang: "en-GB" },
  { id: "en-GB-Neural2-B", name: "Neural2 B", lang: "en-GB" },
];

export const googleProvider: StudioProvider = {
  id: "google",
  name: "Google",
  isConfigured() {
    return Boolean(process.env.GOOGLE_TTS_API_KEY);
  },
  async listVoices() {
    return VOICES;
  },
  async synthesize(text, voiceId, lang) {
    const voice = VOICES.find((item) => item.id === voiceId) ?? VOICES[0];
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: voice?.lang || lang || "en-US",
            name: voice?.id || "en-US-Neural2-F",
          },
          audioConfig: { audioEncoding: "MP3" },
        }),
      },
    );
    if (!response.ok) {
      if (response.status === 400 || response.status === 403) {
        throw new Error("Google speech rejected the request. Check the API key.");
      }
      throw new Error(await readError(response));
    }
    const body = (await response.json()) as { audioContent?: string };
    if (!body.audioContent) throw new Error("Google speech returned no audio.");
    return Uint8Array.from(Buffer.from(body.audioContent, "base64"));
  },
};
