"use client";

import { PlaybackController, type ReadingSession } from "@/lib/playback/controller";
import { useSettings } from "@/components/providers/SettingsProvider";
import { bestBrowserVoice, parseVoiceChoice } from "@/lib/tts/voices";
import { updateDocument } from "@/lib/storage/db";
import { isFormField } from "@/lib/utils";
import { EMPTY_SNAPSHOT, type PlaybackSnapshot } from "@/types/reading";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface PlaybackValue {
  snapshot: PlaybackSnapshot;
  load: (session: ReadingSession) => void;
  clear: () => void;
  playRange: (start: number, end: number, label: string) => void;
  playText: (text: string) => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  next: () => void;
  previous: () => void;
  moveTo: (index: number) => void;
  seekRatio: (ratio: number) => void;
  setIdlePlay: (play: (() => void) | null) => void;
}

const PlaybackContext = createContext<PlaybackValue | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [controller] = useState(() => new PlaybackController());
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(EMPTY_SNAPSHOT);
  const idlePlay = useRef<(() => void) | null>(null);
  const setIdlePlay = useCallback((play: (() => void) | null) => {
    idlePlay.current = play;
  }, []);

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => () => controller.dispose(), [controller]);

  const lang =
    settings.settings.language === "auto" ? snapshot.language || "en-US" : settings.settings.language;

  const resolvedVoice =
    settings.settings.voiceChoice &&
    choiceAvailable(settings.settings.voiceChoice, settings.studios, settings.browserVoices)
      ? settings.settings.voiceChoice
      : settings.statusReady
        ? defaultVoice(settings.studios, settings.browserVoices, lang)
        : settings.settings.voiceChoice;

  useEffect(() => {
    const parsed = parseVoiceChoice(resolvedVoice);
    const provider = parsed?.provider ?? "browser";
    const voiceId = parsed?.id ?? "";
    const browserVoice =
      provider === "browser"
        ? (settings.browserVoices.find((voice) => voice.voiceURI === voiceId) ??
          bestBrowserVoice(settings.browserVoices, lang))
        : null;
    controller.applySettings({
      provider,
      voiceId: provider === "browser" ? (browserVoice?.voiceURI ?? voiceId) : voiceId,
      browserVoice,
      lang,
      rate: settings.settings.rate,
      pitch: settings.settings.pitch,
      volume: settings.settings.volume,
    });
  }, [
    controller,
    lang,
    resolvedVoice,
    settings.browserVoices,
    settings.settings.pitch,
    settings.settings.rate,
    settings.settings.volume,
  ]);

  useEffect(() => {
    if (!snapshot.documentId) return;
    const timer = window.setTimeout(() => {
      void updateDocument(snapshot.documentId!, {
        currentSentenceIndex: snapshot.sentenceIndex,
        currentPage: snapshot.pageNumber,
        progress: snapshot.progress,
        lastOpenedAt: Date.now(),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [snapshot.documentId, snapshot.pageNumber, snapshot.progress, snapshot.sentenceIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isFormField(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (snapshot.status === "playing" || snapshot.status === "preparing") controller.pause();
        else if (snapshot.status === "paused") controller.resume();
        else if (snapshot.status === "ended") controller.replay();
        else idlePlay.current?.();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        controller.next();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        controller.previous();
      } else if (event.key === "[") {
        const index = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].findIndex(
          (rate) => rate === settings.settings.rate,
        );
        const next = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2][Math.max(0, index - 1)];
        if (next) settings.update({ rate: next });
      } else if (event.key === "]") {
        const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        const index = rates.findIndex((rate) => rate === settings.settings.rate);
        const next = rates[Math.min(rates.length - 1, index + 1)];
        if (next) settings.update({ rate: next });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller, settings, snapshot.status]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: snapshot.documentName || "ReadFlow",
      artist: snapshot.currentText.slice(0, 140) || "ReadFlow",
      album: "ReadFlow",
    });
    session.playbackState =
      snapshot.status === "playing" || snapshot.status === "preparing" ? "playing" : "paused";
    const bind = (action: MediaSessionAction, handler: () => void) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* this action is not supported here */
      }
    };
    bind("play", () => {
      if (snapshot.status === "paused") controller.resume();
      else if (snapshot.status === "ended") controller.replay();
      else idlePlay.current?.();
    });
    bind("pause", () => controller.pause());
    bind("previoustrack", () => controller.previous());
    bind("nexttrack", () => controller.next());
  }, [controller, snapshot.currentText, snapshot.documentName, snapshot.status]);

  const api = useMemo<PlaybackValue>(
    () => ({
      snapshot,
      load: (session) => controller.load(session),
      clear: () => controller.clear(),
      playRange: (start, end, label) => controller.playRange(start, end, label),
      playText: (text) => controller.playText(text),
      pause: () => controller.pause(),
      resume: () => controller.resume(),
      replay: () => controller.replay(),
      next: () => controller.next(),
      previous: () => controller.previous(),
      moveTo: (index) => controller.moveTo(index),
      seekRatio: (ratio) => controller.seekRatio(ratio),
      setIdlePlay,
    }),
    [controller, setIdlePlay, snapshot],
  );

  return <PlaybackContext.Provider value={api}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error("Playback is unavailable.");
  return value;
}

function choiceAvailable(
  choice: string,
  studios: { id: string; voices: { id: string }[] }[],
  voices: SpeechSynthesisVoice[],
) {
  const parsed = parseVoiceChoice(choice);
  if (!parsed) return false;
  if (parsed.provider === "browser") {
    return voices.length === 0 || voices.some((voice) => voice.voiceURI === parsed.id);
  }
  return studios.some(
    (studio) => studio.id === parsed.provider && studio.voices.some((voice) => voice.id === parsed.id),
  );
}

function defaultVoice(
  studios: { id: string; voices: { id: string; lang: string }[] }[],
  voices: SpeechSynthesisVoice[],
  lang: string,
) {
  const studio = studios[0];
  const studioVoice =
    studio?.voices.find(
      (voice) =>
        voice.lang === "multi" || voice.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()),
    ) ?? studio?.voices[0];
  if (studio && studioVoice) return `${studio.id}:${studioVoice.id}`;
  const browser = bestBrowserVoice(voices, lang);
  return browser ? `browser:${browser.voiceURI}` : null;
}

export function useIdlePlay(play: () => void) {
  const playback = usePlayback();
  const playRef = useRef(play);
  const setIdlePlay = playback.setIdlePlay;
  useEffect(() => {
    playRef.current = play;
    setIdlePlay(() => playRef.current());
    return () => setIdlePlay(null);
  }, [play, setIdlePlay]);
}
