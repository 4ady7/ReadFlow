export interface StudioVoice {
  id: string;
  name: string;
  lang: string;
}

export interface StudioProvider {
  id: "openai" | "elevenlabs" | "google" | "azure" | "polly";
  name: string;
  isConfigured(): boolean;
  listVoices(): Promise<StudioVoice[]>;
  synthesize(text: string, voiceId: string, lang: string): Promise<Uint8Array>;
}

export function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function readError(response: Response) {
  try {
    const text = await response.text();
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error && typeof parsed.error === "object" && parsed.error.message) {
      return parsed.error.message;
    }
    if (parsed.message) return parsed.message;
    return text.slice(0, 240);
  } catch {
    return `The speech service returned ${response.status}.`;
  }
}
