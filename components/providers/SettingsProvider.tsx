"use client";

import { LANGUAGE_OPTIONS } from "@/lib/text/language";
import {
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
  writeSettings,
  type Settings,
} from "@/lib/storage/settings";
import { browserSpeechAvailable, fetchStudioStatus, type StudioStatus } from "@/lib/tts/voices";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

interface SettingsValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  studios: StudioStatus[];
  browserVoices: SpeechSynthesisVoice[];
  statusReady: boolean;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const settings = useSyncExternalStore(subscribeSettings, getSettingsSnapshot, getServerSettingsSnapshot);
  const update = useCallback((patch: Partial<Settings>) => writeSettings(patch), []);
  const [studios, setStudios] = useState<StudioStatus[]>([]);
  const [statusReady, setStatusReady] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#12110f" : "#f3efe7");
    };
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    let cancelled = false;
    void fetchStudioStatus().then((providers) => {
      if (!cancelled) {
        setStudios(providers);
        setStatusReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!browserSpeechAvailable()) return;
    const synth = window.speechSynthesis;
    const load = () => setBrowserVoices(synth.getVoices());
    load();
    synth.addEventListener("voiceschanged", load);
    const timer = window.setTimeout(load, 500);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      window.clearTimeout(timer);
    };
  }, []);

  const value = useMemo<SettingsValue>(
    () => ({
      settings,
      update,
      studios,
      browserVoices,
      statusReady,
      settingsOpen,
      setSettingsOpen,
    }),
    [browserVoices, settings, settingsOpen, statusReady, studios, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("Settings are unavailable.");
  return value;
}

export { LANGUAGE_OPTIONS };
