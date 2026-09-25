import { useMemo } from 'react';
import Icon from '../common/Icon';
import { INCIDENT_TYPE_GROUPS, matchingTypeNames } from '../../constants/incidentTypes';
import { OUTSIDE_STATUS_VALUES } from '../../services/incidentService';
import { isWithinCabadbaran } from '../../utils/geofence';
import styles from './MiniAnalyticsPreview.module.css';

const ACTIVE_STATUSES = ['Dispatch', 'In Progress', 'En Route', 'Arrived'];
const HIDDEN = ['Archived', 'Deleted'];

function getLoc(inc) {
  return Array.isArray(inc?.locations) ? inc.locations[0] : inc?.locations;
}

function isGpsOutside(inc) {
  const loc = getLoc(inc);
  if (loc?.latitude == null || loc?.longitude == null) return false;
  return !isWithinCabadbaran(Number(loc.latitude), Number(loc.longitude));
}

function isOutsideTab(inc) {
  return isGpsOutside(inc) || OUTSIDE_STATUS_VALUES.includes(inc.incident_status);
}

function incidentCategory(type) {
  const t = String(type || '').trim() || 'Other Emergency';
  const group = INCIDENT_TYPE_GROUPS.find((g) =>
    matchingTypeNames(g.category).some(
      (name) => t === name || t.startsWith(`${name} —`) || t.startsWith(name)
    )
  );
  if (group) return group.category;
  if (t.startsWith('Traffic Accident')) return 'Vehicular Accident';
  if (t.includes(' — ')) return t.split(' — ')[0];
  return t;
}

function buildPreview(incidents) {
  const rows = (incidents || []).filter((inc) => !HIDDEN.includes(inc.incident_status));
  const pending = rows.filter((inc) => inc.incident_status === 'Pending' && !isGpsOutside(inc));
  const active = rows.filter((inc) => ACTIVE_STATUSES.includes(inc.incident_status) && !isGpsOutside(inc));
  const resolved = rows.filter((inc) => inc.incident_status === 'Resolved' && !isGpsOutside(inc));
  const cancelled = rows.filter((inc) => inc.incident_status === 'Cancelled' && !isGpsOutside(inc));
  const outside = rows.filter((inc) => isOutsideTab(inc));
  const stillOpen = pending.length + active.length + outside.length;
  const resolutionRate = rows.length ? (resolved.length / rows.length) * 100 : 0;

  const statusSlices = [
    { label: 'Pending', count: pending.length, color: '#f59e0b' },
    { label: 'Active', count: active.length, color: '#3b82f6' },
    { label: 'Resolved', count: resolved.length, color: '#22c55e' },
    { label: 'Outside', count: outside.length, color: '#fb923c' },
    { label: 'Cancelled', count: cancelled.length, color: '#94a3b8' },
  ].filter((s) => s.count > 0);

  const typeMap = new Map();
  rows.forEach((inc) => {
    const key = incidentCategory(inc.incident_type);
    typeMap.set(key, (typeMap.get(key) || 0) + 1);
  });
  const types = [...typeMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total: rows.length,
    resolutionRate,
    stillOpen,
    resolved: resolved.length,
    statusSlices,
    types,
  };
}

function MiniDonut({ slices, total }) {
  const size = 96;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const sum = slices.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.donut}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {slices.map((slice) => {
        const len = (slice.count / sum) * c;
        const el = (
          <circle
            key={slice.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={slice.color}
            strokeWidth={stroke}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x="50%" y="48%" textAnchor="middle" className={styles.donutTotal}>{total}</text>
      <text x="50%" y="62%" textAnchor="middle" className={styles.donutSub}>total</text>
    </svg>
  );
}

/**
 * Compact Analytics strip for Dashboard — same Pending/status logic as Analytics page.
 * Full charts remain on the Analytics tab.
 */
export default function MiniAnalyticsPreview({ incidents = [], onViewFull }) {
  const data = useMemo(() => buildPreview(incidents), [incidents]);
  const maxType = Math.max(1, ...data.types.map((t) => t.count));

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          <Icon name="monitoring" size={18} /> Analytics snapshot
        </h3>
        <button type="button" className={styles.link} onClick={onViewFull}>
          View full analytics →
        </button>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Resolution rate</p>
          <p className={styles.bigNum}>{data.resolutionRate.toFixed(1)}%</p>
          <p className={styles.hint}>{data.resolved} resolved · {data.stillOpen} still open</p>
        </div>

        <div className={styles.card}>
          <p className={styles.cardLabel}>Status share</p>
          <div className={styles.donutRow}>
            <MiniDonut slices={data.statusSlices} total={data.total} />
            <ul className={styles.legend}>
              {data.statusSlices.map((s) => (
                <li key={s.label}>
                  <span className={styles.swatch} style={{ background: s.color }} />
                  <span className={styles.legendLabel}>{s.label}</span>
                  <span className={styles.legendCount}>{s.count}</span>
                </li>
              ))}
              {data.statusSlices.length === 0 && (
                <li className={styles.empty}>No incidents in this filter</li>
              )}
            </ul>
          </div>
        </div>

        <div className={styles.card}>
          <p className={styles.cardLabel}>Top types</p>
          <div className={styles.bars}>
            {data.types.map((t) => (
              <div key={t.label} className={styles.barRow}>
                <span className={styles.barName} title={t.label}>{t.label}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${(t.count / maxType) * 100}%` }}
                  />
                </div>
                <span className={styles.barCount}>{t.count}</span>
              </div>
            ))}
            {data.types.length === 0 && (
              <p className={styles.empty}>No type data yet</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
