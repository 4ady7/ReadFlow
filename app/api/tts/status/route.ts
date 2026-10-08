import { configuredStudioProviders } from "@/lib/tts/server/registry";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const providers = await Promise.all(
    configuredStudioProviders().map(async (provider) => {
      try {
        const voices = await provider.listVoices();
        return { id: provider.id, name: provider.name, voices };
      } catch {
        return { id: provider.id, name: provider.name, voices: [] };
      }
    }),
  );

  return NextResponse.json({ providers: providers.filter((provider) => provider.voices.length > 0) });
}
