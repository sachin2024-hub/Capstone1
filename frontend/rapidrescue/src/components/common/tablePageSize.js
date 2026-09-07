import { useCallback, useState } from 'react';

export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100, 500, 1000, 'all'];
export const DEFAULT_PAGE_SIZE = 10;
const STORAGE_PREFIX = 'rr-page-size:';

function isAllowedSize(value) {
  return value === 'all' || PAGE_SIZE_OPTIONS.includes(Number(value));
}

export function readPageSize(key, fallback = DEFAULT_PAGE_SIZE) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw === 'all') return 'all';
    const n = Number(raw);
    if (isAllowedSize(n)) return n;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writePageSize(key, value) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(value));
  } catch {
    /* ignore */
  }
}

export function resolvePageSize(pageSize, total) {
  if (pageSize === 'all') return Math.max(Number(total) || 0, 1);
  const n = Number(pageSize);
  return isAllowedSize(n) ? n : DEFAULT_PAGE_SIZE;
}

export function usePersistedPageSize(key, fallback = DEFAULT_PAGE_SIZE) {
  const [pageSize, setPageSizeState] = useState(() => readPageSize(key, fallback));

  const setPageSize = useCallback((value) => {
    const next = value === 'all' ? 'all' : Number(value);
    setPageSizeState(isAllowedSize(next) ? next : fallback);
    writePageSize(key, isAllowedSize(next) ? next : fallback);
  }, [key, fallback]);

  return [pageSize, setPageSize];
}
