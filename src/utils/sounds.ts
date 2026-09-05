export class UISounds {
  private ctx: AudioContext | null = null;

  // Allow passing the primary user-gesture-authorized AudioContext
  setContext(context: AudioContext) {
    this.ctx = context;
  }

  private getContext(): AudioContext | null {
    if (!this.ctx) {
      try {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          this.ctx = new AudioCtxClass();
        }
      } catch (e) {
        console.warn("Could not create AudioContext", e);
        return null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.08, startTimeOffset: number = 0) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      
      const startTime = ctx.currentTime + startTimeOffset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      
      // Smooth attack and exponential decay to prevent clicks
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(vol, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    } catch {
      // Audio autoplay policy or inactive context
    }
  }

  /**
   * Warm ascending cyber-pentatonic chime when SABI wakes up
   */
  playWake() {
    this.playTone(392.00, 'sine', 0.25, 0.06, 0);       // G4
    this.playTone(523.25, 'sine', 0.25, 0.07, 0.08);    // C5
    this.playTone(659.25, 'sine', 0.40, 0.08, 0.16);    // E5
    this.playTone(783.99, 'triangle', 0.60, 0.06, 0.24);// G5
  }

  /**
   * Gentle descending chime when SABI goes to sleep
   */
  playSleep() {
    this.playTone(659.25, 'sine', 0.25, 0.06, 0);       // E5
    this.playTone(523.25, 'sine', 0.25, 0.06, 0.10);    // C5
    this.playTone(392.00, 'sine', 0.50, 0.07, 0.20);    // G4
  }

  /**
   * Subtle tick when switching listening/thinking state
   */
  playTransition() {
    this.playTone(880, 'sine', 0.08, 0.03, 0);
  }

  /**
   * Soft affirmative click for user interactions
   */
  playTap() {
    this.playTone(1046.50, 'sine', 0.04, 0.04, 0);
  }
}

export const uiSounds = new UISounds();
