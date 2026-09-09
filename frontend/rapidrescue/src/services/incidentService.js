import api from './api';

export const INCIDENT_STATUSES = [
  { value: 'Pending', label: 'Pending', hint: 'Waiting for dispatch' },
  { value: 'Dispatch', label: 'Dispatch', hint: 'Ambulance/responders have been dispatched' },
  { value: 'Arrived', label: 'Arrived', hint: 'Responders arrived at scene' },
  { value: 'Resolved', label: 'Resolved', hint: 'Emergency resolved' },
  { value: 'Cancelled', label: 'Cancelled', hint: 'Incident cancelled' },
  { value: 'Archived', label: 'Archived', hint: 'Moved to archive' },
];

export const DISPATCH_STATUS_ALIASES = ['Dispatch', 'In Progress', 'En Route'];

export function normalizeCityStatus(status) {
  if (DISPATCH_STATUS_ALIASES.includes(status)) return 'Dispatch';
  return status;
}

export const OUTSIDE_STATUSES = [
  { value: 'Outside', label: 'Outside', hint: 'You are outside Cabadbaran. We are coordinating a referral.' },
  { value: 'For Referral', label: 'For Referral', hint: 'Your request is being prepared for the nearest station.' },
  { value: 'Referred', label: 'Referred', hint: 'Referred to the nearest station. Please wait.' },
  { value: 'Completed', label: 'Completed', hint: 'Your request has been completed.' },
];

export const OUTSIDE_STATUS_VALUES = OUTSIDE_STATUSES.map((s) => s.value);

/** Status can only move forward. Archive is not in this dropdown. */
export function getAvailableStatuses(currentStatus) {
  const dropdownStatuses = INCIDENT_STATUSES.filter((s) => s.value !== 'Archived');
  const normalized = normalizeCityStatus(currentStatus);

  if (normalized === 'Resolved') {
    return dropdownStatuses.filter((s) => s.value === 'Resolved');
  }
  if (normalized === 'Cancelled') {
    return dropdownStatuses.filter((s) => s.value === 'Cancelled');
  }

  const idx = dropdownStatuses.findIndex((s) => s.value === normalized);
  if (idx < 0) return dropdownStatuses;
  return dropdownStatuses.slice(idx);
}

export function isReferralOnlyIncident(inc) {
  const t = String(inc?.incident_type || '');
  return t.startsWith('Fire') || t.includes('Crime');
}

export const REFERRAL_ONLY_STATUSES = [
  { value: 'Pending', label: 'Pending', hint: 'Waiting for referral' },
  { value: 'Referred', label: 'Referred', hint: 'Referred to the nearest station.' },
];

function displayDispatchLabel(status) {
  if (DISPATCH_STATUS_ALIASES.includes(status)) return 'Dispatch';
  return status;
}

export function getStatusesForIncident(inc, currentStatus, isOutside = false) {
  if (isReferralOnlyIncident(inc)) {
    if (currentStatus === 'Referred') {
      return REFERRAL_ONLY_STATUSES.filter((s) => s.value === 'Referred');
    }
    if (DISPATCH_STATUS_ALIASES.includes(currentStatus) || currentStatus === 'Arrived') {
      return [
        { value: currentStatus, label: displayDispatchLabel(currentStatus), hint: 'Waiting for referral' },
        { value: 'Referred', label: 'Referred', hint: 'Referred to the nearest station.' },
      ];
    }
    return REFERRAL_ONLY_STATUSES;
  }
  return isOutside ? getOutsideStatuses(currentStatus) : getAvailableStatuses(currentStatus);
}

export function getOutsideStatuses(currentStatus) {
  const normalized = currentStatus === 'Pending' ? 'Outside' : currentStatus;
  if (normalized === 'Referred') {
    return OUTSIDE_STATUSES.filter((s) => s.value === 'Referred');
  }
  const idx = OUTSIDE_STATUSES.findIndex((s) => s.value === normalized);
  if (idx < 0) return OUTSIDE_STATUSES;
  return OUTSIDE_STATUSES.slice(idx);
}

export async function updateIncidentStatus(incidentId, incident_status, extra = {}) {
  const res = await api.patch(`/incidents/${incidentId}/status`, { incident_status, ...extra });
  return res.data;
}

export async function archiveIncident(incidentId) {
  const res = await api.patch(`/incidents/${incidentId}/archive`);
  return res.data;
}

export async function restoreIncident(incidentId, previous_status) {
  const res = await api.patch(`/incidents/${incidentId}/restore`, { previous_status });
  return res.data;
}

export async function deleteIncident(incidentId, previous_status) {
  const res = await api.delete(`/incidents/${incidentId}`, { data: { previous_status } });
  return res.data;
}

export async function permanentDeleteIncident(incidentId) {
  const res = await api.delete(`/incidents/${incidentId}/permanent`);
  return res.data;
}
