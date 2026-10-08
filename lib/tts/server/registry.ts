import { azureProvider } from "@/lib/tts/server/azure";
import { elevenLabsProvider } from "@/lib/tts/server/elevenlabs";
import { googleProvider } from "@/lib/tts/server/google";
import { openaiProvider } from "@/lib/tts/server/openai";
import { pollyProvider } from "@/lib/tts/server/polly";
import type { StudioProvider } from "@/lib/tts/server/types";

const PROVIDERS: StudioProvider[] = [
  openaiProvider,
  elevenLabsProvider,
  googleProvider,
  azureProvider,
  pollyProvider,
];

export function studioProviders() {
  return PROVIDERS;
}

export function configuredStudioProviders() {
  return PROVIDERS.filter((provider) => provider.isConfigured());
}

export function findStudioProvider(id: string) {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}
