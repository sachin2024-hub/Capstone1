/**
 * "Sent offline" detection for the admin dashboard. Plain JS (no React) so it can be unit tested.
 *
 * The phone saves the time the user pressed HELP (`client_created_at`); the server saves the time
 * the request actually arrived (`received_at`). When the two are far apart the phone had no
 * connection and delivered the SOS later, once the signal came back.
 *
 * Older incidents have no `received_at`, so they never show the badge.
 */

/** Normal sends take a few seconds, so only a clearly longer gap counts as offline (shown to the second). */
export const OFFLINE_DELAY_MS = 15_000;

export function formatDelay(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins}m ${String(total % 60).padStart(2, '0')}s`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}

/** Returns { ms, label, pressedAt, receivedAt } for a request delivered late, otherwise null. */
export function getOfflineDelay(incident) {
  if (!incident?.client_created_at || !incident?.received_at) return null;
  const pressed = Date.parse(incident.client_created_at);
  const received = Date.parse(incident.received_at);
  if (!Number.isFinite(pressed) || !Number.isFinite(received)) return null;
  const ms = received - pressed;
  if (ms < OFFLINE_DELAY_MS) return null;
  return {
    ms,
    label: formatDelay(ms),
    pressedAt: new Date(pressed),
    receivedAt: new Date(received),
  };
}
