import { createHash, createHmac } from "node:crypto";
import type { StudioProvider, StudioVoice } from "@/lib/tts/server/types";

const VOICES: StudioVoice[] = [
  { id: "Joanna", name: "Joanna", lang: "en-US" },
  { id: "Matthew", name: "Matthew", lang: "en-US" },
  { id: "Olivia", name: "Olivia", lang: "en-US" },
  { id: "Stephen", name: "Stephen", lang: "en-US" },
  { id: "Amy", name: "Amy", lang: "en-GB" },
  { id: "Brian", name: "Brian", lang: "en-GB" },
];

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

export const pollyProvider: StudioProvider = {
  id: "polly",
  name: "Amazon Polly",
  isConfigured() {
    return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  },
  async listVoices() {
    return VOICES;
  },
  async synthesize(text, voiceId) {
    const accessKey = process.env.AWS_ACCESS_KEY_ID ?? "";
    const secret = process.env.AWS_SECRET_ACCESS_KEY ?? "";
    const region = process.env.AWS_REGION || "us-east-1";
    const sessionToken = process.env.AWS_SESSION_TOKEN;
    const host = `polly.${region}.amazonaws.com`;
    const voice = VOICES.some((item) => item.id === voiceId) ? voiceId : "Joanna";
    const payload = JSON.stringify({
      Engine: "neural",
      OutputFormat: "mp3",
      Text: text,
      TextType: "text",
      VoiceId: voice,
    });
    const payloadBytes = Buffer.from(payload, "utf8");
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const headerEntries: [string, string][] = [
      ["content-type", "application/json"],
      ["host", host],
      ["x-amz-date", amzDate],
    ];
    if (sessionToken) headerEntries.push(["x-amz-security-token", sessionToken]);
    headerEntries.sort((a, b) => a[0].localeCompare(b[0]));
    const canonicalHeaders = headerEntries.map(([key, value]) => `${key}:${value.trim()}\n`).join("");
    const signedHeaders = headerEntries.map(([key]) => key).join(";");
    const canonical = [
      "POST",
      "/v1/speech",
      "",
      canonicalHeaders,
      signedHeaders,
      sha256(payloadBytes),
    ].join("\n");
    const scope = `${date}/${region}/polly/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "polly"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("X-Amz-Date", amzDate);
    headers.set("Authorization", authorization);
    if (sessionToken) headers.set("X-Amz-Security-Token", sessionToken);
    const response = await fetch(`https://${host}/v1/speech`, {
      method: "POST",
      headers,
      body: payloadBytes,
    });
    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 403) throw new Error("Amazon Polly rejected the credentials.");
      throw new Error(detail.slice(0, 240) || "Amazon Polly failed.");
    }
    return new Uint8Array(await response.arrayBuffer());
  },
};
