export const STATUS_COLORS = {
  Pending: '#FFC107',
  Outside: '#EF6C00',
  'For Referral': '#2196F3',
  Referred: '#9C27B0',
  Completed: '#4CAF50',
  Dispatch: '#1565C0',
  'In Progress': '#1565C0',
  'En Route': '#1565C0',
  Arrived: '#2E7D32',
  Resolved: '#4CAF50',
  Cancelled: '#9E9E9E',
  Archived: '#757575',
  Deleted: '#B71C1C',
};

export function displayIncidentStatus(status) {
  if (status === 'In Progress' || status === 'En Route') return 'Dispatch';
  return status || 'Pending';
}

export function statusColor(status) {
  const label = displayIncidentStatus(status);
  return STATUS_COLORS[label] || STATUS_COLORS[status] || '#9E9E9E';
}

export const PRIORITY_COLORS = {
  Normal: '#FFC107',
  High: '#E53935',
  Critical: '#B71C1C',
};

export const DISPATCH_COLORS = {
  Assigned: '#FFC107',
  'En Route': '#2196F3',
  Arrived: '#4CAF50',
  Completed: '#9E9E9E',
};
