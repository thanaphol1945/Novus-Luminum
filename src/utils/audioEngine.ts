// Zero-dependency Web Audio API Sound Effects & Ambient Pad Engine

class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private lastTickAt = 0;
  private ambientNodes: {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    filter: BiquadFilterNode;
    gain: GainNode;
  } | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!this.ctx) {
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    volume = 0.08,
    delaySec = 0,
    endFreq?: number,
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (typeof endFreq === 'number') {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playTypewriterTick(enabled: boolean) {
    if (!enabled) return;
    const nowMs = performance.now();
    if (nowMs - this.lastTickAt < 58) return;
    this.lastTickAt = nowMs;
    this.playTone(760 + Math.random() * 140, 0.028, 'triangle', 0.02);
  }

  public playDiceRoll(enabled: boolean) {
    if (!enabled) return;
    [0, 0.055, 0.11, 0.17].forEach((delay, idx) => {
      this.playTone(280 + idx * 75 + Math.random() * 60, 0.05, 'square', 0.035, delay);
    });
  }

  public playCritSuccess(enabled: boolean) {
    if (!enabled) return;
    this.playTone(523.25, 0.16, 'triangle', 0.08, 0);
    this.playTone(659.25, 0.16, 'triangle', 0.08, 0.09);
    this.playTone(783.99, 0.24, 'triangle', 0.09, 0.18);
    this.playTone(1046.5, 0.35, 'sine', 0.09, 0.27);
  }

  public playCritFail(enabled: boolean) {
    if (!enabled) return;
    this.playTone(240, 0.22, 'sawtooth', 0.055, 0, 150);
    this.playTone(165, 0.32, 'sawtooth', 0.05, 0.16, 110);
  }

  public playAffinityChange(enabled: boolean, delta: number) {
    if (!enabled || delta === 0) return;
    if (delta > 0) {
      this.playTone(587.33, 0.14, 'sine', 0.06, 0);
      this.playTone(880, 0.22, 'sine', 0.065, 0.09);
    } else {
      this.playTone(329.63, 0.16, 'triangle', 0.05, 0, 260);
    }
  }

  public playMilestone(enabled: boolean) {
    if (!enabled) return;
    this.playTone(523.25, 0.18, 'sine', 0.075, 0);
    this.playTone(659.25, 0.18, 'sine', 0.075, 0.1);
    this.playTone(783.99, 0.22, 'sine', 0.08, 0.2);
    this.playTone(987.77, 0.36, 'triangle', 0.075, 0.3);
  }

  public playLevelUp(enabled: boolean) {
    if (!enabled) return;
    this.playTone(440, 0.13, 'triangle', 0.08, 0);
    this.playTone(554.37, 0.13, 'triangle', 0.08, 0.1);
    this.playTone(659.25, 0.15, 'triangle', 0.085, 0.2);
    this.playTone(880, 0.42, 'sine', 0.095, 0.31);
  }

  public playHeal(enabled: boolean) {
    if (!enabled) return;
    this.playTone(493.88, 0.18, 'sine', 0.065, 0);
    this.playTone(659.25, 0.22, 'sine', 0.065, 0.1);
    this.playTone(987.77, 0.32, 'sine', 0.06, 0.2);
  }

  public playItemUse(enabled: boolean) {
    if (!enabled) return;
    this.playTone(440, 0.1, 'triangle', 0.06, 0, 620);
    this.playTone(660, 0.14, 'sine', 0.055, 0.08);
  }

  public setAmbient(enabled: boolean, tension = 25) {
    if (!enabled) {
      this.stopAmbient();
      return;
    }

    const ctx = this.getContext();
    if (!ctx) return;

    const baseFreq = tension >= 70 ? 92.5 : tension >= 45 ? 110 : 130.81;
    const cutoff = tension >= 70 ? 480 : 340;

    if (this.ambientNodes) {
      const now = ctx.currentTime;
      this.ambientNodes.osc1.frequency.setTargetAtTime(baseFreq, now, 0.8);
      this.ambientNodes.osc2.frequency.setTargetAtTime(baseFreq * 1.498, now, 0.8);
      this.ambientNodes.filter.frequency.setTargetAtTime(cutoff, now, 0.8);
      return;
    }

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = baseFreq;
    osc2.frequency.value = baseFreq * 1.498;

    filter.type = 'lowpass';
    filter.frequency.value = cutoff;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 1.2);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    this.ambientNodes = { osc1, osc2, filter, gain };
  }

  public stopAmbient() {
    if (!this.ambientNodes || !this.ctx) {
      this.ambientNodes = null;
      return;
    }
    const { osc1, osc2, gain } = this.ambientNodes;
    const now = this.ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.25);
      window.setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          osc1.disconnect();
          osc2.disconnect();
          gain.disconnect();
        } catch {}
      }, 450);
    } catch {}
    this.ambientNodes = null;
  }
}

export const soundEngine = new StudioAudioEngine();
