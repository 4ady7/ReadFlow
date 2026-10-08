import { offsetForSentence, sentenceAtOffset } from "@/lib/text/chunks";
import type { SpeechChunk } from "@/types/reading";

interface Scheduled {
  index: number;
  source: AudioBufferSourceNode;
  when: number;
  offset: number;
  endAt: number;
  duration: number;
  scheduleId: number;
}

export interface AudioHooks {
  onSentence: (index: number) => void;
  onPreparing: (detail: string) => void;
  onPlaying: () => void;
  onEnded: () => void;
  onError: (message: string) => void;
  onInterrupted: () => void;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

/**
 * Gapless playback for pre-rendered speech. Chunk N+1 is scheduled at the
 * exact end of chunk N, and N+2 is fetched while N plays.
 */
export class BufferedAudioEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private volume = 1;
  private chunks: SpeechChunk[] = [];
  private buffers = new Map<string, AudioBuffer>();
  private bufferOrder: string[] = [];
  private inflight = new Map<string, Promise<AudioBuffer>>();
  private scheduled = new Map<number, Scheduled>();
  private abort = new AbortController();
  private session = 0;
  private scheduleId = 0;
  private running = false;
  private paused = false;
  private raf = 0;
  private rate = 1;
  private voiceKey = "";
  private lastSentence = -1;

  constructor(
    private readonly fetchAudio: (chunk: SpeechChunk, signal: AbortSignal) => Promise<ArrayBuffer>,
    private readonly hooks: AudioHooks,
  ) {}

  setVolume(volume: number) {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = volume;
  }

  canResume() {
    return this.paused && this.ctx?.state === "suspended" && this.scheduled.size > 0;
  }

  private ensureContext() {
    if (!this.ctx) {
      if (typeof AudioContext === "undefined") {
        throw new Error("This browser can't play audio.");
      }
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.ctx.destination);
      this.ctx.onstatechange = () => {
        if (!this.ctx || !this.running || this.paused) return;
        const state = this.ctx.state as string;
        if (state === "suspended" || state === "interrupted") {
          this.paused = true;
          cancelAnimationFrame(this.raf);
          this.hooks.onInterrupted();
        }
      };
    }
    return this.ctx;
  }

  halt() {
    this.session += 1;
    this.scheduleId += 1;
    this.running = false;
    this.paused = false;
    this.abort.abort();
    this.abort = new AbortController();
    this.stopSources();
    cancelAnimationFrame(this.raf);
    this.inflight.clear();
  }

  stopSources() {
    for (const item of this.scheduled.values()) {
      try {
        item.source.onended = null;
        item.source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.scheduled.clear();
  }

  async start(chunks: SpeechChunk[], voiceKey: string, rate: number) {
    this.halt();
    if (voiceKey !== this.voiceKey) {
      this.voiceKey = voiceKey;
      this.buffers.clear();
      this.bufferOrder = [];
    }
    const session = this.session;
    const scheduleId = this.scheduleId;
    this.chunks = chunks;
    this.rate = rate;
    this.running = true;
    this.paused = false;
    this.lastSentence = -1;
    const first = chunks[0];
    if (!first) {
      this.hooks.onEnded();
      return;
    }
    this.hooks.onPreparing("Preparing voice…");
    try {
      const ctx = this.ensureContext();
      if (ctx.state === "suspended") await ctx.resume();
      const buffer = await this.load(0, session);
      if (session !== this.session || scheduleId !== this.scheduleId) return;
      this.schedule(0, buffer, ctx.currentTime + 0.04, 0, scheduleId);
      this.hooks.onPlaying();
      this.watch(session, scheduleId);
      void this.prefetch(0, session, scheduleId);
    } catch (error) {
      if (session !== this.session || isAbort(error)) return;
      this.running = false;
      this.hooks.onError(error instanceof Error ? error.message : "The voice couldn't be generated.");
    }
  }

  pause() {
    if (this.ctx && this.scheduled.size > 0 && this.running) {
      this.paused = true;
      cancelAnimationFrame(this.raf);
      void this.ctx.suspend();
      return "suspended" as const;
    }
    this.halt();
    return "halted" as const;
  }

  async resume() {
    if (!this.ctx || !this.paused) return;
    this.paused = false;
    this.running = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.watch(this.session, this.scheduleId);
  }

  async setRate(rate: number) {
    const position = this.running && !this.paused ? this.position() : null;
    this.rate = rate;
    if (!position) return;
    await this.restartAt(position.index, position.offset);
  }

  private async restartAt(index: number, offset: number) {
    const ctx = this.ensureContext();
    this.scheduleId += 1;
    const scheduleId = this.scheduleId;
    this.stopSources();
    const buffer =
      this.buffers.get(this.chunks[index]?.id ?? "") ?? (await this.load(index, this.session));
    if (scheduleId !== this.scheduleId) return;
    if (ctx.state === "suspended") await ctx.resume();
    this.running = true;
    this.paused = false;
    this.schedule(
      index,
      buffer,
      ctx.currentTime + 0.03,
      Math.min(offset, Math.max(0, buffer.duration - 0.05)),
      scheduleId,
    );
    this.hooks.onPlaying();
    this.watch(this.session, scheduleId);
    void this.prefetch(index, this.session, scheduleId);
  }

  seekSentence(sentenceIndex: number) {
    const index = this.chunks.findIndex((chunk) =>
      chunk.sentences.some((sentence) => sentence.index === sentenceIndex),
    );
    if (index < 0) return false;
    const chunk = this.chunks[index];
    const buffer = chunk ? this.buffers.get(chunk.id) : undefined;
    if (!chunk || !buffer) return false;
    const offset = offsetForSentence(chunk, sentenceIndex, buffer.duration);
    void this.restartAt(index, offset);
    return true;
  }

  private position() {
    if (!this.ctx) return null;
    const now = this.ctx.currentTime;
    let active: Scheduled | null = null;
    for (const item of this.scheduled.values()) {
      if (now + 0.01 >= item.when && now < item.endAt) active = item;
    }
    if (!active) {
      for (const item of this.scheduled.values()) {
        if (item.when <= now && (!active || item.when > active.when)) active = item;
      }
    }
    if (!active) return null;
    const offset = active.offset + Math.max(0, now - active.when) * this.rate;
    return {
      index: active.index,
      offset: Math.min(active.duration - 0.01, Math.max(0, offset)),
    };
  }

  private schedule(index: number, buffer: AudioBuffer, when: number, offset: number, scheduleId: number) {
    const ctx = this.ctx;
    const gain = this.gain;
    const chunk = this.chunks[index];
    if (!ctx || !gain || !chunk) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.rate;
    source.connect(gain);
    const safeOffset = Math.min(Math.max(0, offset), Math.max(0, buffer.duration - 0.02));
    source.start(when, safeOffset);
    const endAt = when + (buffer.duration - safeOffset) / this.rate;
    const item: Scheduled = {
      index,
      source,
      when,
      offset: safeOffset,
      endAt,
      duration: buffer.duration,
      scheduleId,
    };
    this.scheduled.set(index, item);
    source.onended = () => {
      if (item.scheduleId !== this.scheduleId) return;
      this.scheduled.delete(index);
      if (!this.running || this.paused) return;
      if (index >= this.chunks.length - 1) {
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.hooks.onEnded();
        return;
      }
      if (!this.scheduled.has(index + 1)) {
        this.hooks.onPreparing("Preparing the next section…");
        void this.load(index + 1, this.session)
          .then((next) => {
            if (!this.running || this.paused || this.scheduleId !== scheduleId || !this.ctx) return;
            this.schedule(index + 1, next, this.ctx.currentTime + 0.02, 0, scheduleId);
            this.extend(scheduleId);
            this.hooks.onPlaying();
          })
          .catch((error: unknown) => {
            if (this.session !== this.session || isAbort(error)) return;
            if (!isAbort(error)) {
              this.hooks.onError(
                error instanceof Error ? error.message : "The next section couldn't be prepared.",
              );
            }
          });
      }
    };
    this.extend(scheduleId);
  }

  private extend(scheduleId: number) {
    if (!this.running || !this.ctx || scheduleId !== this.scheduleId) return;
    let last = -1;
    let endAt = 0;
    for (const item of this.scheduled.values()) {
      if (item.index >= last) {
        last = item.index;
        endAt = item.endAt;
      }
    }
    const next = last + 1;
    const chunk = this.chunks[next];
    if (!chunk || this.scheduled.has(next)) return;
    const buffer = this.buffers.get(chunk.id);
    if (!buffer) return;
    const when = Math.max(endAt, this.ctx.currentTime + 0.005);
    this.schedule(next, buffer, when, 0, scheduleId);
  }

  private async prefetch(from: number, session: number, scheduleId: number) {
    const last = Math.min(this.chunks.length - 1, from + 2);
    for (let index = from; index <= last; index += 1) {
      if (session !== this.session) return;
      try {
        await this.load(index, session);
        if (session === this.session) this.extend(scheduleId);
      } catch (error) {
        if (session !== this.session || isAbort(error)) return;
        if (index <= from + 1) {
          this.hooks.onError(error instanceof Error ? error.message : "The voice couldn't be generated.");
        }
      }
    }
  }

  private load(index: number, session: number) {
    const chunk = this.chunks[index];
    if (!chunk) return Promise.reject(new Error("Missing speech section."));
    const cached = this.buffers.get(chunk.id);
    if (cached) return Promise.resolve(cached);
    const existing = this.inflight.get(chunk.id);
    if (existing) return existing;
    const pending = (async () => {
      const bytes = await this.fetchAudio(chunk, this.abort.signal);
      if (session !== this.session) throw new DOMException("Aborted", "AbortError");
      const ctx = this.ensureContext();
      const audio = await ctx.decodeAudioData(bytes.slice(0));
      this.remember(chunk.id, audio);
      return audio;
    })().finally(() => {
      this.inflight.delete(chunk.id);
    });
    this.inflight.set(chunk.id, pending);
    return pending;
  }

  private remember(id: string, buffer: AudioBuffer) {
    this.buffers.set(id, buffer);
    this.bufferOrder = this.bufferOrder.filter((key) => key !== id);
    this.bufferOrder.push(id);
    while (this.bufferOrder.length > 8) {
      const oldest = this.bufferOrder.shift();
      if (oldest) this.buffers.delete(oldest);
    }
  }

  private watch(session: number, scheduleId: number) {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.running || this.paused || session !== this.session || scheduleId !== this.scheduleId) {
        return;
      }
      const position = this.position();
      if (position) {
        const chunk = this.chunks[position.index];
        const buffer = chunk ? this.buffers.get(chunk.id) : undefined;
        if (chunk && buffer) {
          const sentence = sentenceAtOffset(chunk, position.offset, buffer.duration);
          if (sentence !== this.lastSentence) {
            this.lastSentence = sentence;
            this.hooks.onSentence(sentence);
          }
        }
        if (position.index !== this.lastPrefetch) {
          this.lastPrefetch = position.index;
          void this.prefetch(position.index, session, scheduleId);
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private lastPrefetch = -1;

  dispose() {
    this.halt();
    void this.ctx?.close();
    this.ctx = null;
  }
}
