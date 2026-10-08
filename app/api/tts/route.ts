import { findStudioProvider, configuredStudioProviders } from "@/lib/tts/server/registry";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const hits = new Map<string, number[]>();

function isLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 90) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (isLimited(ip)) {
    return NextResponse.json(
      { error: "Too many speech requests. Wait a moment, then press play." },
      { status: 429 },
    );
  }

  let body: { text?: unknown; voice?: unknown; provider?: unknown; lang?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "The speech request was invalid." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4500) {
    return NextResponse.json(
      { error: "A speech passage must be between 1 and 4500 characters." },
      { status: 400 },
    );
  }

  const configured = configuredStudioProviders();
  if (!configured.length) {
    return NextResponse.json(
      { error: "No studio voice is configured. Use a voice on this device." },
      { status: 503 },
    );
  }

  const requested = typeof body.provider === "string" ? body.provider : configured[0]?.id;
  const provider = requested ? findStudioProvider(requested) : null;
  if (!provider || !provider.isConfigured()) {
    return NextResponse.json({ error: "That voice is not available." }, { status: 503 });
  }

  try {
    const audio = await provider.synthesize(
      text,
      typeof body.voice === "string" ? body.voice : "",
      typeof body.lang === "string" ? body.lang : "en-US",
    );
    return new NextResponse(Buffer.from(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech could not be generated.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
