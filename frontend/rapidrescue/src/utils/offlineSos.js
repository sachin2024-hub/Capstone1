/**
 * "Sent offline" detection for the admin dashboard. Plain JS (no React) so it can be unit tested.
 *
 * The phone saves the time the user pressed HELP (`client_created_at`); the server saves the time
 * the request actually arrived (`received_at`). When the two are far apart the phone had no
 * connection and delivered the SOS later, once the signal came back.
 *
 * Older incidents have no `received_at`, so they never show the badge.
 */

/** Normal sends take a few seconds (even with retries), so only a real gap counts as offline. */
export const OFFLINE_DELAY_MS = 60_000;

export function formatDelay(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
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
