import { readError, xmlEscape, type StudioProvider, type StudioVoice } from "@/lib/tts/server/types";

const VOICES: StudioVoice[] = [
  { id: "en-US-JennyNeural", name: "Jenny", lang: "en-US" },
  { id: "en-US-GuyNeural", name: "Guy", lang: "en-US" },
  { id: "en-US-AriaNeural", name: "Aria", lang: "en-US" },
  { id: "en-GB-SoniaNeural", name: "Sonia", lang: "en-GB" },
  { id: "en-GB-RyanNeural", name: "Ryan", lang: "en-GB" },
];

export const azureProvider: StudioProvider = {
  id: "azure",
  name: "Azure",
  isConfigured() {
    return Boolean(process.env.AZURE_SPEECH_KEY);
  },
  async listVoices() {
    return VOICES;
  },
  async synthesize(text, voiceId) {
    const voice = VOICES.find((item) => item.id === voiceId) ?? VOICES[0];
    const region = process.env.AZURE_SPEECH_REGION || "eastus";
    const lang = voice?.lang || "en-US";
    const name = voice?.id || "en-US-JennyNeural";
    const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${xmlEscape(name)}">${xmlEscape(text)}</voice></speak>`;
    const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY ?? "",
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "ReadFlow",
      },
      body: ssml,
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("The Azure speech key was rejected.");
      throw new Error(await readError(response));
    }
    return new Uint8Array(await response.arrayBuffer());
  },
};
