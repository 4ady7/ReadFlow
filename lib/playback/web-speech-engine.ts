import { sentenceIndexAtChar } from "@/lib/text/chunks";
import type { SpeechChunk } from "@/types/reading";

export interface SpeechHooks {
  onSentence: (index: number) => void;
  onEnded: () => void;
  onError: (message: string) => void;
}

export interface SpeechOptions {
  rate: number;
  pitch: number;
  volume: number;
  lang: string;
  voice: SpeechSynthesisVoice | null;
}

/**
 * Browser speech cannot be pre-rendered into audio buffers. Utterances are
 * queued two ahead so the engine does not wait for a round trip between
 * chunks. Pause cancels the queue; resume replays the current sentence.
 */
export class WebSpeechEngine {
  private synth: SpeechSynthesis | null = null;
  private generation = 0;
  private chunks: SpeechChunk[] = [];
  private options: SpeechOptions | null = null;
  private primed = -1;
  private index = 0;
  private utterances: SpeechSynthesisUtterance[] = [];
  private ignoring = false;
  private started = false;
  private finished = false;
  private sawSpeaking = false;
  private quietTicks = 0;
  private timer = 0;
  private recoveries = 0;

  constructor(private readonly hooks: SpeechHooks) {}

  private synthesis() {
    if (!this.synth && typeof window !== "undefined" && window.speechSynthesis) {
      this.synth = window.speechSynthesis;
    }
    return this.synth;
  }

  play(chunks: SpeechChunk[], options: SpeechOptions) {
    const synth = this.synthesis();
    if (!synth) {
      this.hooks.onError("This browser can't speak text. Try Chrome, Safari, or Edge.");
      return;
    }
    this.stop();
    this.generation += 1;
    const generation = this.generation;
    this.chunks = chunks;
    this.options = options;
    this.primed = -1;
    this.index = 0;
    this.utterances = [];
    this.ignoring = false;
    this.started = false;
    this.finished = false;
    this.sawSpeaking = false;
    this.quietTicks = 0;
    this.recoveries = 0;
    window.setTimeout(() => {
      if (generation !== this.generation) return;
      if (synth.paused) synth.resume();
      this.enqueue(0, generation);
      this.enqueue(1, generation);
      this.watch(generation);
    }, 40);
  }

  stop() {
    this.generation += 1;
    this.ignoring = true;
    this.finished = true;
    window.clearInterval(this.timer);
    this.synthesis()?.cancel();
    this.utterances = [];
  }

  private watch(generation: number) {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (generation !== this.generation || this.finished) return;
      const synth = this.synthesis();
      if (!synth || !this.started) return;
      if (synth.speaking || synth.pending) {
        this.sawSpeaking = true;
        this.quietTicks = 0;
        return;
      }
      if (!this.sawSpeaking) return;
      this.quietTicks += 1;
      if (this.quietTicks >= 2) this.recover(generation);
    }, 700);
  }

  private recover(generation: number) {
    if (this.recoveries >= 2) {
      this.hooks.onError("Speech stopped unexpectedly. Press play to continue.");
      this.stop();
      return;
    }
    this.recoveries += 1;
    this.ignoring = true;
    this.primed = this.index - 1;
    this.quietTicks = 0;
    this.synthesis()?.cancel();
    window.setTimeout(() => {
      if (generation !== this.generation) return;
      this.ignoring = false;
      this.enqueue(this.index, generation);
      this.enqueue(this.index + 1, generation);
    }, 50);
  }

  private enqueue(index: number, generation: number) {
    if (generation !== this.generation || index <= this.primed) return;
    const chunk = this.chunks[index];
    const options = this.options;
    const synth = this.synthesis();
    if (!chunk || !options || !synth || !chunk.spokenText.trim()) return;

    const utterance = new SpeechSynthesisUtterance(chunk.spokenText);
    utterance.rate = options.rate;
    utterance.pitch = options.pitch;
    utterance.volume = options.volume;
    utterance.lang = options.lang;
    if (options.voice) utterance.voice = options.voice;

    let estimated = false;
    const startedAt = { value: 0 };
    const estimate = window.setInterval(() => {
      if (generation !== this.generation || estimated) {
        window.clearInterval(estimate);
        return;
      }
      if (!startedAt.value) return;
      const duration = Math.max(1.2, chunk.spokenText.length / (14 * options.rate));
      const fraction = Math.min(0.98, (Date.now() - startedAt.value) / 1000 / duration);
      this.hooks.onSentence(
        sentenceIndexAtChar(chunk, Math.floor(fraction * chunk.spokenText.length)),
      );
    }, 220);

    utterance.onstart = () => {
      if (generation !== this.generation || this.ignoring) return;
      this.started = true;
      this.index = index;
      startedAt.value = Date.now();
      const first = chunk.ranges[0]?.sentenceIndex;
      if (first !== undefined) this.hooks.onSentence(first);
    };
    utterance.onboundary = (event) => {
      if (generation !== this.generation || this.ignoring) return;
      estimated = true;
      window.clearInterval(estimate);
      this.hooks.onSentence(sentenceIndexAtChar(chunk, event.charIndex ?? 0));
    };
    utterance.onend = () => {
      window.clearInterval(estimate);
      if (generation !== this.generation || this.ignoring) return;
      if (index >= this.chunks.length - 1) {
        this.finished = true;
        window.clearInterval(this.timer);
        this.hooks.onEnded();
        return;
      }
      this.enqueue(index + 2, generation);
    };
    utterance.onerror = (event) => {
      window.clearInterval(estimate);
      if (generation !== this.generation || this.ignoring) return;
      if (event.error === "interrupted" || event.error === "canceled") return;
      this.hooks.onError("Speech stopped unexpectedly. Press play to continue.");
    };

    this.utterances.push(utterance);
    this.primed = index;
    synth.speak(utterance);
  }
}
