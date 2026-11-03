/** Per-browser admin preferences saved in localStorage (alarm volume). */
import { ALARM_DEFAULT_VOLUME } from './sosAlarm';

const VOLUME_KEY = 'sosAlarmVolume';

const read = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
};

export function readAlarmVolume() {
  const n = Number(read(VOLUME_KEY));
  return read(VOLUME_KEY) !== null && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : ALARM_DEFAULT_VOLUME;
}

export function saveAlarmVolume(volume) {
  write(VOLUME_KEY, String(volume));
}
