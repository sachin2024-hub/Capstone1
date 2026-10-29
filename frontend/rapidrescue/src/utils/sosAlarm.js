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
  const readContext = () => (getContext ? getContext() : ownContext);

  const silence = () => {
    if (!sound) return;
    const { osc, gain } = sound;
    sound = null;
    try { gain.gain.cancelScheduledValues(0); gain.gain.value = 0; } catch { /* already gone */ }
    try { osc.onended = null; osc.stop(0); } catch { /* already stopped */ }
    try { osc.disconnect(); gain.disconnect(); } catch { /* already disconnected */ }
  };

  const burst = () => {
    silence(); // never two sirens at once
    const ctx = readContext();
    // browsers keep audio locked until the first click/key, so retry on the next repeat
    if (!ctx || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    for (let t = 0; t < burstSeconds; t += 0.5) {
      osc.frequency.setValueAtTime(t % 1 === 0 ? 880 : 660, start + t);
    }
    const mine = { osc, gain };
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* already disconnected */ }
      if (sound === mine) sound = null;
    };
    sound = mine;
    osc.start(start);
    osc.stop(start + burstSeconds);
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
