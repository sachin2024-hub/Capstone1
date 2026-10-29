import test from 'node:test';
import assert from 'node:assert/strict';
import { createSosAlarm, pickNewIncoming } from './sosAlarm.js';

/** Fake Web Audio + fake interval timer, so we can see exactly what is playing. */
function setup({ state = 'running' } = {}) {
  const oscillators = [];
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    createOscillator() {
      const osc = {
        frequency: { setValueAtTime() {} },
        started: false,
        stoppedAt: null,
        connect() {},
        disconnect() {},
        start() { this.started = true; },
        stop(when) { this.stoppedAt = when; },
      };
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      return { gain: { value: 0, cancelScheduledValues() {} }, connect() {}, disconnect() {} };
    },
  };
  const timers = new Map();
  let nextId = 1;
  const alarm = createSosAlarm({
    getContext: () => ctx,
    burstSeconds: 4,
    repeatMs: 10000,
    schedule: (fn) => { timers.set(nextId, fn); return nextId++; },
    cancel: (id) => timers.delete(id),
  });
  const tick = () => [...timers.values()].forEach((fn) => fn());
  return { alarm, oscillators, timers, tick, ctx };
}

// a sound is "playing" when it was started and not silenced early (stop(0)); a finished burst stops at +4s
const playing = (osc) => osc.started && osc.stoppedAt !== 0;

test('Alarm On + new request: the siren plays', () => {
  const { alarm, oscillators } = setup();
  alarm.start();
  assert.equal(oscillators.length, 1);
  assert.equal(playing(oscillators[0]), true);
  assert.equal(alarm.isRinging(), true);
});

test('the siren repeats while the alert is active, with only one sound at a time', () => {
  const { alarm, oscillators, tick } = setup();
  alarm.start();
  tick();
  tick();
  assert.equal(oscillators.length, 3);
  assert.equal(oscillators.filter(playing).length, 1, 'older bursts are silenced before the next one starts');
});

test('Alarm Off while playing: sound stops immediately and nothing is left scheduled', () => {
  const { alarm, oscillators, timers, tick } = setup();
  alarm.start();
  alarm.stop();
  assert.equal(oscillators[0].stoppedAt, 0, 'stopped right now, not at the end of the burst');
  assert.equal(timers.size, 0, 'repeat timer is cancelled');
  tick();
  assert.equal(oscillators.length, 1, 'no further sound after stop');
  assert.equal(alarm.isRinging(), false);
});

test('start() twice does not create a second siren or a second timer', () => {
  const { alarm, oscillators, timers } = setup();
  alarm.start();
  alarm.start();
  assert.equal(oscillators.length, 1);
  assert.equal(timers.size, 1);
});

test('Alarm On again after Off: it rings again for the next request', () => {
  const { alarm, oscillators } = setup();
  alarm.start();
  alarm.stop();
  alarm.start();
  assert.equal(oscillators.length, 2);
  assert.equal(playing(oscillators[1]), true);
});

test('stop() when nothing is playing is harmless', () => {
  const { alarm } = setup();
  assert.doesNotThrow(() => alarm.stop());
});

test('locked audio (no click yet): no sound, but the next repeat plays once unlocked', () => {
  const { alarm, oscillators, tick, ctx } = setup({ state: 'suspended' });
  alarm.start();
  assert.equal(oscillators.length, 0);
  ctx.state = 'running';
  tick();
  assert.equal(oscillators.length, 1);
});

test('only genuinely new, unviewed incoming requests count', () => {
  const incoming = (inc) => inc.incident_status === 'Pending';
  const list = [
    { incident_id: 1, incident_status: 'Pending' },
    { incident_id: 2, incident_status: 'Pending' },
    { incident_id: 3, incident_status: 'Resolved' },
    { incident_id: 4, incident_status: 'Pending', viewed: true },
  ];
  // first load: nothing rings, even though pending requests already exist
  assert.deepEqual(pickNewIncoming(null, list, incoming), []);
  // same list again (e.g. a status update elsewhere): nothing new
  assert.deepEqual(pickNewIncoming(new Set([1, 2, 3, 4]), list, incoming), []);
  // a new pending request appears
  const next = [...list, { incident_id: 5, incident_status: 'Pending' }];
  assert.deepEqual(pickNewIncoming(new Set([1, 2, 3, 4]), next, incoming).map((i) => i.incident_id), [5]);
  // a new request that is already resolved or viewed does not ring
  const quiet = [...list, { incident_id: 6, incident_status: 'Resolved' }, { incident_id: 7, incident_status: 'Pending', viewed: true }];
  assert.deepEqual(pickNewIncoming(new Set([1, 2, 3, 4]), quiet, incoming), []);
});
