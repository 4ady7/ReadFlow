import { loadSpeechAudio } from "@/lib/tts/client";
import { buildSpeechChunks, withFastStart } from "@/lib/text/chunks";
import { BufferedAudioEngine } from "@/lib/playback/audio-engine";
import { WebSpeechEngine } from "@/lib/playback/web-speech-engine";
import { clamp } from "@/lib/utils";
import {
  EMPTY_SNAPSHOT,
  type Extraction,
  type PlaybackSnapshot,
  type Sentence,
} from "@/types/reading";

export interface ReadingSession {
  id: string;
  name: string;
  pageCount: number;
  extraction: Extraction;
  restoreIndex: number;
}

export interface EngineSettings {
  provider: string;
  voiceId: string;
  browserVoice: SpeechSynthesisVoice | null;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
}

type Listener = (snapshot: PlaybackSnapshot) => void;

export class PlaybackController {
  private listeners = new Set<Listener>();
  private session: ReadingSession | null = null;
  private snap: PlaybackSnapshot = { ...EMPTY_SNAPSHOT };
  private cursor = 0;
  private rangeStart = 0;
  private rangeEnd = 0;
  private label = "From here";
  private oneOff = false;
  private oneOffText = "";
  private provider = "browser";
  private voiceId = "";
  private browserVoice: SpeechSynthesisVoice | null = null;
  private lang = "en-US";
  private rate = 1;
  private pitch = 1;
  private suspended = false;
  private sentenceAnchor = 0;
  private accumulated = 0;
  private readonly speech: WebSpeechEngine;
  private readonly audio: BufferedAudioEngine;

  constructor() {
    this.speech = new WebSpeechEngine({
      onSentence: (index) => this.onSentence(index),
      onEnded: () => this.onEnded(),
      onError: (message) => this.fail(message),
    });
    this.audio = new BufferedAudioEngine(
      (chunk, signal) =>
        loadSpeechAudio({
          provider: this.provider,
          voice: this.voiceId,
          lang: this.lang,
          text: chunk.spokenText,
          signal,
        }),
      {
        onSentence: (index) => this.onSentence(index),
        onPreparing: (detail) => {
          if (this.snap.status === "paused") return;
          this.update({ status: "preparing", preparingDetail: detail, error: null });
        },
        onPlaying: () => {
          this.sentenceAnchor = performance.now();
          this.update({ status: "playing", preparingDetail: null, error: null });
        },
        onEnded: () => this.onEnded(),
        onError: (message) => this.fail(message),
        onInterrupted: () => {
          this.accumulated = this.secondsInto();
          this.suspended = true;
          this.update({ status: "paused", preparingDetail: null });
        },
      },
    );
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snap);
    return () => {
      this.listeners.delete(listener);
    };
  }

  load(session: ReadingSession) {
    if (this.session?.id === session.id) {
      this.session = session;
      this.publish();
      return;
    }
    this.hardStop();
    this.session = session;
    this.oneOff = false;
    this.suspended = false;
    const last = Math.max(0, session.extraction.sentences.length - 1);
    this.cursor = clamp(session.restoreIndex, 0, last);
    this.rangeStart = 0;
    this.rangeEnd = last;
    this.label = "From here";
    this.accumulated = 0;
    this.publish("idle");
  }

  clear() {
    this.hardStop();
    this.session = null;
    this.cursor = 0;
    this.oneOff = false;
    this.snap = {
      ...EMPTY_SNAPSHOT,
      rate: this.rate,
      pitch: this.pitch,
      volume: this.snap.volume,
    };
    this.emit();
  }

  applySettings(next: EngineSettings) {
    const voiceChanged =
      next.provider !== this.provider || next.voiceId !== this.voiceId || next.lang !== this.lang;
    const rateChanged = next.rate !== this.rate;
    const pitchChanged = next.pitch !== this.pitch;
    this.provider = next.provider || "browser";
    this.voiceId = next.voiceId;
    this.browserVoice = next.browserVoice;
    this.lang = next.lang || "en-US";
    this.rate = next.rate;
    this.pitch = next.pitch;
    this.audio.setVolume(next.volume);
    this.update({ rate: next.rate, pitch: next.pitch, volume: next.volume });
    if (!this.isLive()) return;
    if (voiceChanged || (pitchChanged && this.provider === "browser")) {
      this.playRange(this.cursor, this.rangeEnd, this.label);
      return;
    }
    if (!rateChanged) return;
    if (this.provider === "browser") this.playRange(this.cursor, this.rangeEnd, this.label);
    else void this.audio.setRate(next.rate);
  }

  playRange(start: number, end: number, label: string) {
    const sentences = this.sentences();
    if (!sentences.length) return;
    const last = sentences.length - 1;
    const startIndex = clamp(start, 0, last);
    const endIndex = clamp(end, startIndex, last);
    this.rangeStart = startIndex;
    this.rangeEnd = endIndex;
    this.label = label;
    this.cursor = startIndex;
    this.oneOff = false;
    this.suspended = false;
    this.accumulated = 0;
    this.sentenceAnchor = performance.now();
    this.launch(sentences.slice(startIndex, endIndex + 1));
  }

  playText(text: string) {
    const spoken = text.replace(/\s+/g, " ").trim();
    if (!spoken || !this.session) return;
    const sentence: Sentence = {
      id: "selection",
      index: -1,
      pageNumber: this.pageOf(this.cursor),
      paragraphId: "selection",
      text: spoken.slice(0, 4000),
      kind: "sentence",
    };
    this.oneOff = true;
    this.oneOffText = sentence.text;
    this.suspended = false;
    this.snap = { ...this.snap, currentText: sentence.text, scopeLabel: "Selection" };
    this.launch([sentence]);
  }

  pause() {
    if (!this.isLive()) return;
    this.accumulated = this.secondsInto();
    this.speech.stop();
    if (this.provider === "browser") {
      this.audio.halt();
      this.suspended = false;
    } else {
      this.suspended = this.audio.pause() === "suspended";
    }
    this.update({ status: "paused", preparingDetail: null });
  }

  resume() {
    if (this.provider !== "browser" && this.suspended && this.audio.canResume()) {
      this.sentenceAnchor = performance.now();
      void this.audio.resume().then(() => {
        this.update({ status: "playing", preparingDetail: null, error: null });
      });
      return;
    }
    if (this.oneOff && this.oneOffText) {
      this.playText(this.oneOffText);
      return;
    }
    this.playRange(this.cursor, Math.max(this.cursor, this.rangeEnd), this.label);
  }

  replay() {
    this.playRange(this.rangeStart, Math.max(this.rangeStart, this.rangeEnd), this.label);
  }

  next() {
    const sentences = this.sentences();
    if (!sentences.length) return;
    const limit = this.snap.status === "idle" ? sentences.length - 1 : this.rangeEnd;
    if (this.cursor >= limit) {
      if (this.isLive()) this.onEnded();
      return;
    }
    this.skipTo(this.cursor + 1);
  }

  previous() {
    if (!this.session) return;
    if (this.isLive() && this.secondsInto() > 2) {
      this.skipTo(this.cursor);
      return;
    }
    const floor = this.snap.status === "idle" ? 0 : this.rangeStart;
    this.skipTo(Math.max(floor, this.cursor - 1));
  }

  moveTo(index: number) {
    if (this.isLive()) {
      const last = Math.max(0, this.sentences().length - 1);
      this.playRange(index, last, "From here");
      return;
    }
    this.park(index);
  }

  seekRatio(ratio: number) {
    const sentences = this.sentences();
    if (!sentences.length) return;
    const index = Math.round(clamp(ratio, 0, 1) * (sentences.length - 1));
    this.skipTo(index);
  }

  private skipTo(index: number) {
    if (this.isLive() && this.provider !== "browser" && !this.oneOff && this.audio.seekSentence(index)) {
      this.cursor = index;
      this.accumulated = 0;
      this.sentenceAnchor = performance.now();
      this.publish(this.snap.status === "preparing" ? "playing" : this.snap.status);
      return;
    }
    if (this.isLive()) this.playRange(index, Math.max(index, this.rangeEnd), this.label);
    else this.park(index);
  }

  private launch(sentences: Sentence[]) {
    const maxChars = this.provider === "browser" ? 230 : 520;
    let chunks = buildSpeechChunks(sentences, maxChars);
    if (this.provider !== "browser") chunks = withFastStart(chunks);
    this.hardStop();
    if (!chunks.length) return;
    if (this.provider === "browser") {
      this.update({
        status: "playing",
        preparingDetail: null,
        error: null,
        endedDocument: false,
        scopeLabel: this.oneOff ? "Selection" : this.label,
      });
      this.speech.play(chunks, {
        rate: this.rate,
        pitch: this.pitch,
        volume: this.snap.volume,
        lang: this.lang,
        voice: this.browserVoice,
      });
      return;
    }
    this.update({
      status: "preparing",
      preparingDetail: "Preparing voice…",
      error: null,
      endedDocument: false,
      scopeLabel: this.oneOff ? "Selection" : this.label,
    });
    void this.audio.start(chunks, `${this.provider}:${this.voiceId}`, this.rate);
  }

  private park(index: number) {
    const sentences = this.sentences();
    if (!sentences.length) return;
    this.hardStop();
    this.oneOff = false;
    this.suspended = false;
    this.cursor = clamp(index, 0, sentences.length - 1);
    this.accumulated = 0;
    const status = this.snap.status === "idle" ? "idle" : "paused";
    this.publish(status);
  }

  private onSentence(index: number) {
    if (index < 0 || this.oneOff) return;
    if (index !== this.cursor) {
      this.accumulated = 0;
      this.sentenceAnchor = performance.now();
      this.cursor = index;
    }
    if (this.snap.status !== "playing" && this.snap.status !== "preparing") return;
    this.publish("playing");
  }

  private onEnded() {
    if (this.oneOff) {
      this.oneOff = false;
      this.hardStop();
      this.publish("paused");
      return;
    }
    const sentences = this.sentences();
    const finished = this.rangeEnd >= sentences.length - 1;
    this.cursor = this.rangeEnd;
    this.hardStop();
    this.publish(finished ? "ended" : "ended");
    this.update({ endedDocument: finished });
  }

  private fail(message: string) {
    this.accumulated = this.secondsInto();
    this.hardStop();
    this.update({ status: "error", error: message, preparingDetail: null });
  }

  private hardStop() {
    this.speech.stop();
    this.audio.halt();
  }

  private isLive() {
    return this.snap.status === "playing" || this.snap.status === "preparing";
  }

  private secondsInto() {
    if (this.snap.status !== "playing") return this.accumulated;
    return this.accumulated + (performance.now() - this.sentenceAnchor) / 1000;
  }

  private sentences() {
    return this.session?.extraction.sentences ?? [];
  }

  private pageOf(index: number) {
    return this.sentences()[index]?.pageNumber ?? this.snap.pageNumber ?? 1;
  }

  private publish(status: PlaybackSnapshot["status"] = this.snap.status) {
    const sentences = this.sentences();
    const sentence = sentences[this.cursor];
    const count = sentences.length;
    const progress = count ? clamp(this.cursor / count, 0, 1) : 0;
    const span = Math.max(1, this.rangeEnd - this.rangeStart);
    const rangeProgress = count ? clamp((this.cursor - this.rangeStart) / span, 0, 1) : 0;
    this.snap = {
      ...this.snap,
      status,
      documentId: this.session?.id ?? null,
      documentName: this.session?.name ?? "",
      sentenceIndex: this.cursor,
      sentenceCount: count,
      pageNumber: sentence?.pageNumber ?? 1,
      pageCount: this.session?.pageCount ?? 0,
      progress: status === "ended" && this.rangeEnd >= count - 1 ? 1 : progress,
      rangeStart: this.rangeStart,
      rangeEnd: this.rangeEnd,
      rangeProgress: status === "ended" ? 1 : rangeProgress,
      currentText: this.oneOff ? this.snap.currentText : (sentence?.text ?? ""),
      scopeLabel: this.oneOff ? "Selection" : this.label,
      endedDocument: status === "ended" && this.rangeEnd >= Math.max(0, count - 1),
      scanned: this.session?.extraction.scanned ?? false,
      hasText: count > 0,
      language: this.session?.extraction.language ?? "en-US",
      error: status === "error" ? this.snap.error : null,
      preparingDetail: status === "preparing" ? this.snap.preparingDetail : null,
      rate: this.rate,
      pitch: this.pitch,
    };
    this.emit();
  }

  private update(patch: Partial<PlaybackSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    if (
      patch.status ||
      patch.sentenceIndex !== undefined ||
      patch.currentText ||
      patch.preparingDetail !== undefined ||
      patch.error !== undefined
    ) {
      this.publish(patch.status ?? this.snap.status);
      return;
    }
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener(this.snap);
  }

  dispose() {
    this.hardStop();
    this.audio.dispose();
    this.listeners.clear();
  }
}
