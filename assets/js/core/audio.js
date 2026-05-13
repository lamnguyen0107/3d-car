const STORAGE_KEY = 'archeon-engine-audio';
const ENTRY_RAMP_SECONDS = 3;
const ENTRY_GAIN_MULTIPLIER = 2;

const SECTION_INTENSITY = {
  prelude: 0.46,
  hero: 0.58,
  performance: 0.9,
  engineering: 0.72,
  finale: 0.5
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * 0.45;
  }

  return buffer;
}

function readStoredPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredPreference(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Ignore storage errors in privacy-restricted environments.
  }
}

export class EngineAudioController {
  constructor({ lowPower = false } = {}) {
    this.lowPower = lowPower;
    this.AudioContextCtor = window.AudioContext || window.webkitAudioContext || null;
    this.isSupported = Boolean(this.AudioContextCtor);
    this.button = null;
    this.stateNode = null;
    this.desiredEnabled = readStoredPreference();
    this.enabled = false;
    this.isExperienceReady = false;
    this.loadProgress = 0;
    this.sectionId = 'prelude';
    this.nextSectionId = null;
    this.sectionBlend = 0;
    this.entryRampStartTime = 0;
    this.resumeOnGesture = this.desiredEnabled;
    this.context = null;
    this.masterGain = null;
    this.engineGain = null;
    this.noiseGain = null;
    this.engineFilter = null;
    this.presenceFilter = null;
    this.oscillators = [];
    this.noiseSource = null;

    this.handleToggle = this.handleToggle.bind(this);
    this.handleGestureResume = this.handleGestureResume.bind(this);
  }

  mount() {
    this.button = document.getElementById('sound-toggle');
    this.stateNode = document.querySelector('[data-sound-state]');

    if (!this.button) return;

    this.button.addEventListener('click', this.handleToggle);

    if (!this.isSupported) {
      this.button.disabled = true;
      this.setUiState(false, 'N/A');
      return;
    }

    this.setUiState(false, this.desiredEnabled ? 'Armed' : 'Off');
    window.addEventListener('pointerdown', this.handleGestureResume, { passive: true });
    window.addEventListener('keydown', this.handleGestureResume);
  }

  async handleToggle() {
    if (!this.isSupported) return;

    this.desiredEnabled = !this.desiredEnabled;
    writeStoredPreference(this.desiredEnabled);

    if (this.desiredEnabled) {
      await this.enable();
      return;
    }

    await this.disable();
  }

  async handleGestureResume() {
    if (!this.resumeOnGesture || this.enabled || !this.desiredEnabled) return;
    await this.enable();
  }

  async ensureGraph() {
    if (this.context) return;

    const context = new this.AudioContextCtor();
    const masterGain = context.createGain();
    const engineGain = context.createGain();
    const noiseGain = context.createGain();
    const engineFilter = context.createBiquadFilter();
    const presenceFilter = context.createBiquadFilter();
    const shaper = context.createWaveShaper();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    const noiseFilter = context.createBiquadFilter();
    const noiseSource = context.createBufferSource();

    const curve = new Float32Array(256);
    for (let index = 0; index < curve.length; index += 1) {
      const x = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * 2.4);
    }

    shaper.curve = curve;
    shaper.oversample = '2x';

    masterGain.gain.value = 0;
    engineGain.gain.value = 0.42;
    noiseGain.gain.value = 0;
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 640;
    engineFilter.Q.value = 1.2;
    presenceFilter.type = 'bandpass';
    presenceFilter.frequency.value = 980;
    presenceFilter.Q.value = 0.75;
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 1500;
    noiseFilter.Q.value = 0.8;
    lfo.type = 'triangle';
    lfo.frequency.value = this.lowPower ? 2.4 : 3.8;
    lfoGain.gain.value = this.lowPower ? 28 : 42;

    const oscillators = [
      ['sawtooth', 34, 0.13],
      ['triangle', 51, 0.11],
      ['sine', 18, 0.08]
    ].map(([type, frequency, gainAmount]) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gainNode.gain.value = gainAmount;

      oscillator.connect(gainNode);
      gainNode.connect(shaper);
      oscillator.start();

      return oscillator;
    });

    noiseSource.buffer = createNoiseBuffer(context);
    noiseSource.loop = true;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseSource.start();

    shaper.connect(engineFilter);
    engineFilter.connect(presenceFilter);
    presenceFilter.connect(engineGain);
    engineGain.connect(masterGain);
    noiseGain.connect(masterGain);
    masterGain.connect(context.destination);

    lfo.connect(lfoGain);
    lfoGain.connect(engineFilter.frequency);
    lfo.start();

    this.context = context;
    this.masterGain = masterGain;
    this.engineGain = engineGain;
    this.noiseGain = noiseGain;
    this.engineFilter = engineFilter;
    this.presenceFilter = presenceFilter;
    this.oscillators = oscillators;
    this.noiseSource = noiseSource;
  }

  async enable() {
    if (!this.isSupported) return;

    await this.ensureGraph();
    await this.context.resume();

    this.enabled = true;
    this.resumeOnGesture = false;
    this.entryRampStartTime = this.context.currentTime;
    this.setUiState(true, 'Live');
    this.syncEngineState();
  }

  async disable() {
    if (!this.context) {
      this.enabled = false;
      this.resumeOnGesture = false;
      this.setUiState(false, 'Off');
      return;
    }

    const now = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(0, now, 0.08);
    this.enabled = false;
    this.resumeOnGesture = false;
    this.setUiState(false, 'Off');

    window.setTimeout(async () => {
      if (!this.context || this.enabled) return;
      await this.context.suspend();
    }, 220);
  }

  setUiState(isOn, label) {
    if (this.button) {
      this.button.classList.toggle('is-on', isOn);
      this.button.setAttribute('aria-pressed', String(isOn));
      this.button.setAttribute('aria-label', isOn ? 'Disable engine audio' : 'Enable engine audio');
    }

    if (this.stateNode) {
      this.stateNode.textContent = label;
    }
  }

  setLoadProgress(value) {
    this.loadProgress = clamp(value);
    if (!this.isExperienceReady) {
      this.syncEngineState();
    }
  }

  markReady() {
    this.isExperienceReady = true;
    this.syncEngineState();
  }

  setDriveState(sectionId, blend = 0, nextSectionId = null) {
    this.sectionId = sectionId || this.sectionId;
    this.sectionBlend = clamp(blend);
    this.nextSectionId = nextSectionId || null;
    if (this.isExperienceReady) {
      this.syncEngineState();
    }
  }

  syncEngineState() {
    if (!this.context || !this.enabled) return;

    const now = this.context.currentTime;
    const sectionBase = SECTION_INTENSITY[this.sectionId] ?? 0.52;
    const nextSectionBase = this.nextSectionId
      ? SECTION_INTENSITY[this.nextSectionId] ?? sectionBase
      : sectionBase;
    const intensity = this.isExperienceReady
      ? clamp(sectionBase + (nextSectionBase - sectionBase) * this.sectionBlend, 0.18, 1)
      : clamp(0.16 + this.loadProgress * 0.84, 0.16, 1);
    const entryRampProgress = smoothstep((now - this.entryRampStartTime) / ENTRY_RAMP_SECONDS);
    const entryGain = 0.22 + entryRampProgress * (ENTRY_GAIN_MULTIPLIER - 0.22);
    const toneGain = 0.7 + entryRampProgress * 0.45;

    const baseFrequency = 28 + intensity * 78;
    const harmonics = [1, 1.62, 0.54];

    this.oscillators.forEach((oscillator, index) => {
      oscillator.frequency.setTargetAtTime(baseFrequency * harmonics[index], now, 0.12);
    });

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime((0.024 + intensity * 0.042) * entryGain, now, 0.22);
    this.engineGain.gain.setTargetAtTime((0.26 + intensity * 0.24) * toneGain, now, 0.24);
    this.noiseGain.gain.setTargetAtTime((0.006 + intensity * 0.03) * (0.72 + entryRampProgress * 0.48), now, 0.26);
    this.engineFilter.frequency.setTargetAtTime(440 + intensity * 1580, now, 0.22);
    this.presenceFilter.frequency.setTargetAtTime(760 + intensity * 1040, now, 0.22);
  }
}
