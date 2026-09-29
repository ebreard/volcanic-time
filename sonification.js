const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function voiceParameters(event) {
  const known = Number.isFinite(event.vei) && event.vei >= 0;
  const vei = known ? clamp(Math.round(event.vei), 0, 8) : null;
  return {
    vei,
    duration: known ? .65 + vei * .24 : .85,
    frequency: known ? 82 / (1 + vei * .18) : null,
    attack: event.precision === 2 ? .018 : event.precision === 1 ? .055 : .11,
  };
}

export function synthesizeEruption(event, sampleRate) {
  const voice = voiceParameters(event);
  const samples = new Float32Array(Math.ceil(sampleRate * voice.duration));
  let seed = 1979 + (voice.vei ?? 13) * 7919;
  let low = 0, mid = 0, grain = 0, phase = 0, previous = 0, highpass = 0;
  let peak = 0;
  const lowAlpha = 1 - Math.exp(-TAU * 110 / sampleRate);
  const midAlpha = 1 - Math.exp(-TAU * 600 / sampleRate);
  const highpassDecay = Math.exp(-TAU * 22 / sampleRate);
  const grainDecay = Math.exp(-1 / (sampleRate * .028));
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    const noise = random() * 2 - 1;
    low += lowAlpha * (noise - low);
    mid += midAlpha * (noise - mid);
    grain *= grainDecay;
    if (random() < (2.5 + (voice.vei ?? 0) * .65) / sampleRate) grain = .5 + random() * .5;
    const attack = Math.sin(clamp(time / voice.attack, 0, 1) * Math.PI / 2) ** 2;
    const tail = clamp((voice.duration - time) / .15, 0, 1) ** 2;
    const envelope = attack * Math.exp(-3.8 * time / voice.duration) * tail;
    let signal;
    if (voice.vei === null) {
      signal = low * .9 + (mid - low) * (.55 + grain * .7);
    } else {
      phase += TAU * voice.frequency * (1 + .14 * Math.exp(-time / .16)
        + .006 * Math.sin(TAU * .85 * time)) / sampleRate;
      const resonance = Math.sin(phase) * .44 + Math.sin(phase * .987) * .17
        + Math.sin(phase * 2.003) * .13;
      const rumble = low * (2.1 + voice.vei * .14) * (1 + .13 * Math.sin(TAU * 2.1 * time));
      signal = resonance + rumble + (mid - low) * (.12 + grain * .4);
    }
    highpass = highpassDecay * (highpass + signal - previous);
    previous = signal;
    samples[i] = highpass * envelope;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const level = voice.vei === null ? .32 : .36 + voice.vei * .012;
  const gain = peak ? level / peak : 0;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  samples[0] = 0;
  samples[samples.length - 1] = 0;
  return samples;
}

export function eruptionPan(longitude, centerLongitude, zoom = 1) {
  return Number.isFinite(longitude) ? clamp(longitude / 180, -.8, .8) : 0;
}

export const PIANO_PITCHES = [74, 71, 69, 66, 64, 62, 59, 57, 54];
export const DRUM_KIT = ['closed-hat', 'kick', 'snare', 'rack-tom', 'floor-tom', 'ride', 'crash', 'china', 'china'];
export function musicParameters(event) {
  const known = Number.isFinite(event.vei) && event.vei >= 0;
  const vei = known ? clamp(Math.round(event.vei), 0, 8) : null;
  const precision = event.precision === 2 ? 2 : event.precision === 1 ? 1 : 0;
  return {
    vei, precision, midi: known ? PIANO_PITCHES[vei] : null,
    drum: known ? DRUM_KIT[vei] : 'side-stick',
    piano: known ? `piano-${vei}-${precision}` : null,
    attack: [.012, .006, .003][precision],
    duration: known ? .24 + .065 * vei : .18,
  };
}

// Compatibility export: event order no longer affects any sound parameter.
export function orchestralPhrase(event, sequence) {
  const p = musicParameters(event);
  return { ...p, lead: p.drum };
}

export function eventOffset(event, timing) {
  if (timing?.offsetFor) return clamp(timing.offsetFor(event), 0, timing.duration);
  if (!timing || !Number.isFinite(event.t) || !Number.isFinite(timing.fromYear)
    || !Number.isFinite(timing.toYear) || !(timing.toYear > timing.fromYear)
    || !Number.isFinite(timing.duration) || timing.duration <= 0) return 0;
  return clamp((event.t - timing.fromYear) / (timing.toYear - timing.fromYear), 0, 1) * timing.duration;
}

export function densityGain(count) {
  return 1 / Math.max(1, count / 3);
}

// Firefox has no cancelAndHoldAtTime; cancelling what lies ahead and pinning
// the current value holds the level the same way.
function holdAt(param, time) {
  if (param.cancelAndHoldAtTime) { param.cancelAndHoldAtTime(time); return; }
  const value = param.value;
  param.cancelScheduledValues(time);
  param.setValueAtTime(value, time);
}

let tonePromise;
const sampleBytes = new Map();
async function loadTone() {
  if (!tonePromise) tonePromise = import("./vendor/tone/Tone.js").then(() => {
    if (!globalThis.Tone) throw new Error("The instrument engine did not load.");
    return globalThis.Tone;
  }).catch(error => { tonePromise = null; throw error; });
  return tonePromise;
}

async function loadSample(name, context) {
  if (!sampleBytes.has(name)) {
    const url = new URL(`./assets/sonification/${name}.wav`, import.meta.url);
    sampleBytes.set(name, fetch(url, { signal: AbortSignal.timeout(20000) }).then(response => {
      if (!response.ok) throw new Error("Instrument samples could not load. Tap Sound to retry.");
      return response.arrayBuffer();
    }).catch(error => { sampleBytes.delete(name); throw error; }));
  }
  return context.decodeAudioData((await sampleBytes.get(name)).slice(0));
}

export class VolcanoSound {
  constructor(createContext = () => {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) throw new Error("Audio is not supported in this browser");
    return new AudioContext();
  }) {
    this.createContext = createContext;
    this.context = null;
    this.enabled = false;
    this.playing = false;
    this.volume = .45;
    this.voices = new Set();
    this.buffers = new Map();
    this.retiring = new Set();
    this.stats = { scheduled: 0, pianoNotes: 0, truncated: 0, cancelled: 0 };
    this.generation = 0;
    this.disposed = false;
  }

  async setEnabled(enabled) {
    const generation = ++this.generation;
    if (!enabled) {
      this.enabled = false;
      this.stop();
      return;
    }
    if (this.disposed) throw new Error("This sound session has closed.");
    // iPhone Safari mutes Web Audio under the silent switch unless the page asks for playback audio.
    if (navigator.audioSession) navigator.audioSession.type = "playback";
    if (!this.ready) {
      this.context = this.createContext();
      // Resume in the user gesture, before fetching instruments or importing Tone.
      const resumed = this.resume();
      this.ready = this.initialize(resumed).catch(async error => {
        await this.releaseContext();
        this.ready = null;
        throw error;
      });
    }
    await this.ready;
    if (generation !== this.generation || this.disposed) return;
    await this.resume();
    this.enabled = true;
  }

  async initialize(resumed) {
    const names = [...new Set(DRUM_KIT), 'side-stick',
      ...PIANO_PITCHES.flatMap((_, vei) => [0, 1, 2].map(precision => `piano-${vei}-${precision}`))];
    const loading = (async () => {
      const result = [];
      for (let i = 0; i < names.length; i += 4) {
        result.push(...await Promise.all(names.slice(i, i + 4).map(name => loadSample(name, this.context))));
      }
      return result;
    })();
    const [Tone, , samples] = await Promise.all([loadTone(), resumed, loading]);
    this.Tone = Tone;
    // Explicit contexts keep the live player independent from MP4 recording.
    this.toneContext = new Tone.Context({ context: this.context, lookAhead: .025 });
    this.samples = Object.fromEntries(names.map((name, i) => [name, samples[i]]));
    const context = this.toneContext;
    this.limiter = new Tone.Limiter({ context, threshold: -4 });
    this.mix = this.context.createGain();
    Tone.connect(this.mix, this.limiter);
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.limiter.connect(this.master);
    this.master.connect(this.context.destination);
  }

  async resume() {
    const context = this.context;
    if (!context) return;
    if (context.state !== "running") {
      let timer;
      try {
        await Promise.race([
          context.resume(),
          new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Audio needs a click to resume")), 2000);
          }),
        ]);
      } finally { clearTimeout(timer); }
    }
    if (context.state !== "running") throw new Error("Audio could not start; tap Sound to retry");
  }

  setVolume(value) {
    this.volume = Number.isFinite(value) ? clamp(value, 0, 1) : this.volume;
    if (this.enabled && this.playing) this.rampMaster(this.volume * .8);
    if (!this.volume) this.stop();
  }

  rampMaster(value, duration = .025) {
    if (!this.master) return;
    const gain = this.master.gain, now = this.context.currentTime;
    holdAt(gain, now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(value, now + duration);
  }

  captureStream() {
    if (!this.context || !this.master) throw new Error("Enable sound before recording it.");
    if (!this.recordingDestination) {
      this.recordingDestination = this.context.createMediaStreamDestination();
      this.master.disconnect();
      this.master.connect(this.recordingDestination);
    }
    return this.recordingDestination.stream;
  }

  async dispose() {
    this.disposed = true;
    ++this.generation;
    this.enabled = false;
    this.setPlaying(false);
    try { await this.ready; } catch { /* Failed initialization already released its context. */ }
    await this.releaseContext();
  }

  async releaseContext() {
    this.stop();
    for (const voice of [...this.voices, ...this.retiring]) this.disposeVoice(voice);
    this.reverb?.dispose();
    this.reverb = null;
    this.reverbReturn?.dispose();
    this.reverbReturn = null;
    this.limiter?.dispose();
    this.mix?.disconnect();
    this.mix = null;
    this.master?.disconnect();
    for (const track of this.recordingDestination?.stream.getTracks() || []) track.stop();
    if (this.toneContext) {
      await this.toneContext.close();
      this.toneContext.dispose();
    } else if (this.context && this.context.state !== "closed") await this.context.close();
    this.context = null;
    this.master = null;
    this.recordingDestination = null;
    this.buffers.clear();
    this.samples = null;
    this.tapBuffer = null;
    this.toneContext = null;
  }

  setPlaying(playing) {
    this.playing = playing;
    if (!playing) this.stop();
  }

  stop() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.rampMaster(0, .008);
    for (const voice of [...this.voices, ...this.retiring]) {
      if (voice.at > now) { this.disposeVoice(voice); continue; }
      this.fadeVoice(voice, now, .025);
      clearTimeout(voice.timer);
      voice.timer = setTimeout(() => this.disposeVoice(voice), 45);
    }
    // Dispose the delay network so a scrub or resume cannot resurrect an old tail.
    this.reverb?.disconnect();
    this.reverb?.dispose();
    this.reverb = null;
    this.reverbReturn?.dispose();
    this.reverbReturn = null;
  }

  disposeVoice(voice) {
    if (voice.disposed) return;
    voice.disposed = true;
    clearTimeout(voice.timer);
    voice.source.onended = null;
    voice.source.stop();
    for (const node of voice.nodes) node.disconnect();
    this.voices.delete(voice);
    this.retiring.delete(voice);
  }

  fadeVoice(voice, now, duration) {
    const gain = voice.output.gain;
    holdAt(gain, now);
    gain.linearRampToValueAtTime(0, now + duration);
    voice.source.stop(now + duration);
  }

  playEvents(events, centerLongitude, zoom = 1, timing) {
    const ctx = this.context;
    if (!this.enabled || !this.playing || !this.volume || !ctx || ctx.state !== "running") return false;
    // Browser timers can be throttled; also reap fades on the audio clock.
    for (const voice of this.retiring) if (voice.retireAt <= ctx.currentTime) this.disposeVoice(voice);
    for (const voice of this.voices) if (voice.ends <= ctx.currentTime) this.disposeVoice(voice);
    // Leave headroom before simultaneous onsets reach the shared limiter.
    const count = [...this.voices].reduce((sum, voice) => sum + voice.eventCount, 0) + events.length;
    const target = densityGain(count);
    this.mix.gain.setTargetAtTime(target, ctx.currentTime, target < this.mix.gain.value ? .004 : .12);
    if (events.length) this.playBatch(events, timing);
    this.stats.scheduled += events.length;
    this.stats.pianoNotes += events.filter(event => musicParameters(event).piano).length;
    if (events.length) this.rampMaster(this.volume * .8);
    return events.length > 0;
  }

  playEvent(event, centerLongitude, zoom, at) {
    return this.playBatch([event], null, at);
  }

  playBatch(events, timing, at) {
    const ctx = this.context;
    // Sum all records into a short stereo block; node count follows frames, not eruptions.
    const groups = new Map();
    for (const event of events) {
      const p = musicParameters(event);
      const offset = Math.round(eventOffset(event, timing) * ctx.sampleRate);
      const pan = eruptionPan(event.lon);
      const key = `${p.drum}:${p.piano}:${offset}:${pan}`;
      const entry = groups.get(key);
      if (entry) entry.count++;
      else groups.set(key, { buffer: this.eventBuffer(p), offset, pan, count: 1 });
    }
    const entries = [...groups.values()];
    const length = Math.max(...entries.map(entry => entry.offset + entry.buffer.length));
    const block = ctx.createBuffer(2, length, ctx.sampleRate);
    const left = block.getChannelData(0), right = block.getChannelData(1);
    for (const entry of entries) {
      const mono = entry.buffer.getChannelData(0);
      const angle = (entry.pan + 1) * Math.PI / 4;
      // Identical simultaneous waveforms add linearly; multiplicity is retained, not selected out.
      const l = Math.cos(angle) * entry.count, r = Math.sin(angle) * entry.count;
      for (let i = 0; i < mono.length; i++) {
        left[entry.offset + i] += mono[i] * l;
        right[entry.offset + i] += mono[i] * r;
      }
    }
    at = Math.max(at || 0, ctx.currentTime + .03);
    const source = ctx.createBufferSource();
    const output = ctx.createGain();
    source.connect(output); output.connect(this.mix);
    const nodes = [source, output];
    source.buffer = block;
    const ends = at + source.buffer.duration;
    output.gain.setValueAtTime(1, at);
    const voice = { nodes, source, output, at, ends, eventCount: events.length, timer: null };
    this.voices.add(voice);
    source.onended = () => this.disposeVoice(voice);
    source.start(at);
    source.stop(ends);
  }

  eventBuffer(p) {
    const key = `${p.drum}:${p.piano || 'none'}`;
    if (!this.buffers.has(key)) {
      const layers = [this.samples[p.drum], ...(p.piano ? [this.samples[p.piano]] : [])];
      const length = Math.max(...layers.map(buffer => buffer.length));
      const result = this.context.createBuffer(1, length, this.context.sampleRate);
      const channel = result.getChannelData(0);
      for (const layer of layers) {
        const samples = layer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) channel[i] += samples[i];
      }
      this.buffers.set(key, result);
    }
    return this.buffers.get(key);
  }
}
