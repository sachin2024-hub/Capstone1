/**
 * Emergency alarm sound for the admin dashboard. Plain JS (no React) so it can be unit tested.
 *
 * The sound is a two-tone siren made with the Web Audio API (no audio file). The oscillator of
 * the sound that is playing is always kept, so `stop()` silences it immediately instead of
 * waiting for the burst to finish, and only one siren can exist at a time.
 */

export const ALARM_BURST_SECONDS = 4;
/** While an alert is active the siren repeats this often (burst length + a short pause). */
export const ALARM_REPEAT_MS = 10000;
/** Peak loudness (Web Audio gain) at 100% volume. The outside beep is a softer triangle wave, so it gets more gain to be clearly heard. */
export const ALARM_PEAK_GAIN = { city: 0.3, outside: 0.8 };
export const ALARM_DEFAULT_VOLUME = 50;

export function createSosAlarm({
  getContext, // optional override (tests); normally the module creates its own AudioContext
  burstSeconds = ALARM_BURST_SECONDS,
  repeatMs = ALARM_REPEAT_MS,
  schedule = (fn, ms) => setInterval(fn, ms),
  cancel = (id) => clearInterval(id),
}) {
  let sound = null;
  let timer = null;
  let ringing = false;
  let ownContext = null;
  let variant = 'city';
  let volume = ALARM_DEFAULT_VOLUME; // 0-100
  const readContext = () => (getContext ? getContext() : ownContext);

  const silence = () => {
    if (!sound) return;
    const { osc, gain } = sound;
    sound = null;
    try { gain.gain.cancelScheduledValues(0); gain.gain.value = 0; } catch { /* already gone */ }
    try { osc.onended = null; osc.stop(0); } catch { /* already stopped */ }
    try { osc.disconnect(); gain.disconnect(); } catch { /* already disconnected */ }
  };

  const burst = (seconds = burstSeconds) => {
    silence(); // never two sirens at once
    const ctx = readContext();
    // browsers keep audio locked until the first click/key, so retry on the next repeat
    if (!ctx || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // outside-area requests get a softer, slower triangle "beep ... beep" so it is never mistaken
    // for the urgent city siren
    const outside = variant === 'outside';
    osc.type = outside ? 'triangle' : 'square';
    const level = ALARM_PEAK_GAIN[outside ? 'outside' : 'city'] * (volume / 100);
    gain.gain.value = level;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    if (outside) {
      for (let t = 0; t < seconds; t += 1) {
        osc.frequency.setValueAtTime(520, start + t);
        gain.gain.setValueAtTime(level, start + t);
        gain.gain.setValueAtTime(0, start + t + 0.4);
      }
    } else {
      for (let t = 0; t < seconds; t += 0.5) {
        osc.frequency.setValueAtTime(t % 1 === 0 ? 880 : 660, start + t);
      }
    }
    const mine = { osc, gain };
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* already disconnected */ }
      if (sound === mine) sound = null;
    };
    sound = mine;
    osc.start(start);
    osc.stop(start + seconds);
  };

  return {
    /** Browsers only allow sound after a click/key: call this from such an event to unlock audio. */
    unlock() {
      if (getContext) return;
      try {
        if (!ownContext && typeof window !== 'undefined') {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) ownContext = new Ctx();
        }
        ownContext?.resume?.();
      } catch { /* audio unavailable */ }
    },
    /** Ring now and keep repeating until `stop()`. Calling it again while ringing does nothing. */
    start() {
      if (ringing) return;
      ringing = true;
      burst();
      timer = schedule(burst, repeatMs);
    },
    /** 'city' (urgent siren, default) or 'outside' (softer beeps); used from the next burst on. */
    setVariant(next) {
      variant = next === 'outside' ? 'outside' : 'city';
    },
    /** 0-100; used from the next burst on. */
    setVolume(next) {
      const n = Number(next);
      volume = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : ALARM_DEFAULT_VOLUME;
    },
    /** Short sample of 'city' or 'outside' for the Settings page. Does nothing while a real alert rings. */
    preview(kind) {
      if (ringing) return;
      const keep = variant;
      variant = kind === 'outside' ? 'outside' : 'city';
      burst(2);
      variant = keep;
    },
    /** Stop the sound this instant and cancel every repeat. */
    stop() {
      ringing = false;
      if (timer !== null) cancel(timer);
      timer = null;
      silence();
    },
    isRinging: () => ringing,
  };
}

/**
 * Genuinely new incoming requests: ids not seen in the previous list. `known` is null on the first
 * load, so requests that already exist never ring.
 */
export function pickNewIncoming(known, incidents, isIncoming) {
  if (!known) return [];
  return incidents.filter(
    (inc) => !known.has(Number(inc.incident_id)) && isIncoming(inc) && !inc.viewed
  );
}
