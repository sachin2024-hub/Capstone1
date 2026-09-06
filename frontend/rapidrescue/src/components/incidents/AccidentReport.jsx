import { useMemo, useState } from 'react';
import { INCIDENT_TYPE_GROUPS, matchingTypeNames } from '../../constants/incidentTypes';
import { STATUS_COLORS } from '../../constants/statusColors';
import { OUTSIDE_STATUS_VALUES } from '../../services/incidentService';
import { parseLocationAddress } from '../../utils/locationFormat';
import { isWithinCabadbaran } from '../../utils/geofence';
import styles from './AccidentReport.module.css';

const RANGES = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
];

const ACTIVE_STATUSES = ['Dispatch', 'In Progress', 'En Route', 'Arrived'];
const HIDDEN_STATUSES = ['Archived', 'Deleted'];
const TYPE_COLORS = ['#c1121f', '#e53935', '#fb8c00', '#1565c0', '#6d28d9', '#0f766e', '#b45309', '#334155'];

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shortDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function rangeStart(rangeId) {
  const now = new Date();
  if (rangeId === 'today') return startOfLocalDay(now);
  if (rangeId === '7d') return startOfLocalDay(addDays(now, -6));
  if (rangeId === '30d') return startOfLocalDay(addDays(now, -29));
  return null;
}

function getLocation(inc) {
  return Array.isArray(inc?.locations) ? inc.locations[0] : inc?.locations;
}

function isGpsOutside(inc) {
  const loc = getLocation(inc);
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

function barangayOf(inc) {
  const loc = getLocation(inc);
  const parsed = parseLocationAddress(loc?.location_address || loc?.address || '');
  if (parsed.barangay) return parsed.barangay;
  if (isOutsideTab(inc)) return 'Outside Cabadbaran';
  return 'Unknown';
}

function countBy(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row) || 'Unknown';
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function buildTrend(rows, range) {
  const end = startOfLocalDay(new Date());
  const dayCount = range === 'today' ? 1 : range === '7d' ? 7 : 14;
  const from = startOfLocalDay(addDays(end, -(dayCount - 1)));
  const byDay = new Map();
  for (let i = 0; i < dayCount; i += 1) {
    byDay.set(dayKey(addDays(from, i)), 0);
  }
  rows.forEach((inc) => {
    if (!inc.date_reported) return;
    const key = dayKey(inc.date_reported);
    if (byDay.has(key)) byDay.set(key, byDay.get(key) + 1);
  });
  return [...byDay.entries()].map(([key, count]) => ({ label: shortDay(key), count }));
}

function hourLabel(hour) {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function pct(count, total) {
  if (!total) return '0%';
  const value = (count / total) * 100;
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function getDispatchTime(inc) {
  const dispatch = Array.isArray(inc.dispatch) ? inc.dispatch[0] : inc.dispatch;
  return dispatch?.dispatch_time || null;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '< 1 min';
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function averageResponseMs(rows) {
  const samples = [];
  rows.forEach((inc) => {
    if (!inc.date_reported) return;
    const dispatched = getDispatchTime(inc);
    if (!dispatched) return;
    const ms = new Date(dispatched) - new Date(inc.date_reported);
    if (ms >= 0 && ms <= 6 * 60 * 60 * 1000) samples.push(ms);
  });
  if (!samples.length) return { avgMs: null, count: 0 };
  const avgMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return { avgMs, count: samples.length };
}

function polar(cx, cy, radius, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

function arcPath(cx, cy, radius, startAngle, endAngle) {
  const [x1, y1] = polar(cx, cy, radius, startAngle);
  const [x2, y2] = polar(cx, cy, radius, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

function DonutChart({ items, size = 168, stroke = 22, centerValue, centerLabel }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const slices = items.filter((item) => item.count > 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - stroke) / 2;
  let angle = 0;

  return (
    <div className={styles.donutWrap}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.donutSvg}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {total > 0 && slices.length === 1 && (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke={slices[0].color} strokeWidth={stroke} />
        )}
        {total > 0 && slices.length > 1 && slices.map((item) => {
          const sweep = (item.count / total) * 360;
          const start = angle;
          const end = angle + sweep;
          angle = end;
          return (
            <path
              key={item.label}
              d={arcPath(cx, cy, radius, start, end)}
              fill="none"
              stroke={item.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
            />
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" className={styles.donutValue}>{centerValue}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className={styles.donutCenterLabel}>{centerLabel}</text>
      </svg>
      <ul className={styles.donutLegend}>
        {items.map((item) => (
          <li key={item.label}>
            <span className={styles.legendDot} style={{ background: item.color }} />
            <span className={styles.legendName}>{item.label}</span>
            <span className={styles.legendCount}>{item.count}</span>
            <span className={styles.legendPct}>{pct(item.count, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarList({ items, colors, total }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  if (!items.length) {
    return <p className={styles.emptyChart}>No data for this period.</p>;
  }
  return (
    <div className={styles.barList}>
      {items.map((item, idx) => (
        <div key={item.label} className={styles.barRow}>
          <span className={styles.barLabel} title={item.label}>{item.label}</span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{
                width: `${(item.count / max) * 100}%`,
                background: Array.isArray(colors) ? colors[idx % colors.length] : (colors[item.label] || colors.default || '#c1121f'),
              }}
            />
          </div>
          <span className={styles.barCount}>{item.count}</span>
          <span className={styles.barPct}>{pct(item.count, total)}</span>
        </div>
      ))}
    </div>
  );
}

function ColumnChart({ points, color = '#c1121f' }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className={styles.columns}>
      {points.map((point) => (
        <div key={point.label} className={styles.col} title={`${point.label}: ${point.count}`}>
          <span className={styles.colValue}>{point.count || ''}</span>
          <div className={styles.colTrack}>
            <div
              className={styles.colBar}
              style={{ height: `${Math.max(point.count ? 8 : 2, (point.count / max) * 100)}%`, background: color }}
            />
          </div>
          <span className={styles.colLabel}>{point.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AccidentReport({ incidents = [], isLoading = false }) {
  const [range, setRange] = useState('all');

  const report = useMemo(() => {
    const start = rangeStart(range);
    const live = (incidents || []).filter((inc) => !HIDDEN_STATUSES.includes(inc.incident_status));
    const rows = live.filter((inc) => {
      if (!start) return true;
      const reported = inc.date_reported ? new Date(inc.date_reported) : null;
      return reported && reported >= start;
    });

    const pending = rows.filter((inc) => inc.incident_status === 'Pending' && !isGpsOutside(inc));
    const active = rows.filter((inc) => ACTIVE_STATUSES.includes(inc.incident_status) && !isGpsOutside(inc));
    const resolved = rows.filter((inc) => inc.incident_status === 'Resolved' && !isGpsOutside(inc));
    const cancelled = rows.filter((inc) => inc.incident_status === 'Cancelled' && !isGpsOutside(inc));
    const outside = rows.filter((inc) => isOutsideTab(inc));
    const unreviewed = pending.filter((inc) => !inc.viewed);
    const stillOpen = pending.length + active.length + outside.length;
    const resolutionRate = rows.length ? (resolved.length / rows.length) * 100 : 0;
    const openRate = rows.length ? (stillOpen / rows.length) * 100 : 0;

    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    rows.forEach((inc) => {
      if (!inc.date_reported) return;
      hours[new Date(inc.date_reported).getHours()].count += 1;
    });
    const peak = hours.reduce((best, item) => (item.count > best.count ? item : best), hours[0]);
    const response = averageResponseMs(rows);
    const types = countBy(rows, (inc) => incidentCategory(inc.incident_type));
    const typeColorMap = Object.fromEntries(types.map((item, idx) => [item.label, TYPE_COLORS[idx % TYPE_COLORS.length]]));

    return {
      total: rows.length,
      pending: pending.length,
      active: active.length,
      resolved: resolved.length,
      cancelled: cancelled.length,
      outside: outside.length,
      unreviewed: unreviewed.length,
      stillOpen,
      resolutionRate,
      openRate,
      types,
      typeColorMap,
      statusSlices: [
        { label: 'Pending', count: pending.length, color: STATUS_COLORS.Pending },
        { label: 'Active response', count: active.length, color: '#1565c0' },
        { label: 'Resolved', count: resolved.length, color: STATUS_COLORS.Resolved },
        { label: 'Outside', count: outside.length, color: STATUS_COLORS.Outside },
        { label: 'Cancelled', count: cancelled.length, color: STATUS_COLORS.Cancelled },
      ],
      typeSlices: types.map((item) => ({
        ...item,
        color: typeColorMap[item.label],
      })),
      statuses: countBy(rows, (inc) => inc.incident_status),
      barangays: countBy(rows, barangayOf),
      trend: buildTrend(rows, range),
      hours: hours.map((item) => ({ label: hourLabel(item.hour), count: item.count })),
      peakHour: peak.count ? hourLabel(peak.hour) : '—',
      peakCount: peak.count,
      avgResponse: formatDuration(response.avgMs),
      avgResponseCount: response.count,
    };
  }, [incidents, range]);

  const printedOn = new Date().toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  if (isLoading) {
    return (
      <div className={styles.loadingBox}>
        <div className={styles.loader} />
        <span>Building accident report...</span>
      </div>
    );
  }

  const kpis = [
    { label: 'Total requests', value: report.total, tone: 'dark' },
    { label: 'Pending', value: report.pending, tone: 'warn' },
    { label: 'Active response', value: report.active, tone: 'info' },
    { label: 'Resolved', value: report.resolved, tone: 'ok' },
    { label: 'Outside', value: report.outside, tone: 'orange' },
    { label: 'Cancelled', value: report.cancelled, tone: 'mute' },
    { label: 'Not reviewed', value: report.unreviewed, tone: 'danger' },
  ];

  return (
    <div className={styles.report}>
      <div className={styles.toolbar}>
        <div>
          <h3 className={styles.title}>Accident Analytic Report</h3>
          <p className={styles.subtitle}>
            Cabadbaran City DRRMO · Same counts as the Accident tabs when All time is selected
          </p>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.rangeGroup}>
            {RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.rangeBtn} ${range === item.id ? styles.rangeBtnActive : ''}`}
                onClick={() => setRange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.printBtn} onClick={() => window.print()}>
            🖨️ Print
          </button>
        </div>
      </div>

      <p className={styles.printMeta}>Generated {printedOn} · Period: {RANGES.find((item) => item.id === range)?.label}</p>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${styles.kpi} ${styles[`kpi_${kpi.tone}`]}`}>
            <div className={styles.kpiValue}>{kpi.value}</div>
            <div className={styles.kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.rateRow}>
        <div className={styles.rateCard}>
          <span className={styles.rateLabel}>Resolution rate</span>
          <strong>{pct(report.resolved, report.total)}</strong>
          <span className={styles.rateHint}>{report.resolved} resolved / {report.total} total</span>
        </div>
        <div className={styles.rateCard}>
          <span className={styles.rateLabel}>Still open</span>
          <strong>{pct(report.stillOpen, report.total)}</strong>
          <span className={styles.rateHint}>
            {report.pending} pending + {report.active} active + {report.outside} outside
          </span>
        </div>
        <div className={styles.rateCard}>
          <span className={styles.rateLabel}>Average response time</span>
          <strong>{report.avgResponse}</strong>
          <span className={styles.rateHint}>
            {report.avgResponseCount
              ? `Report to dispatch · ${report.avgResponseCount} dispatched request${report.avgResponseCount === 1 ? '' : 's'}`
              : 'No dispatched requests in this period'}
          </span>
        </div>
      </div>

      <div className={styles.donutGrid}>
        <section className={styles.card}>
          <h4>Status share</h4>
          <DonutChart
            items={report.statusSlices}
            centerValue={report.total}
            centerLabel="requests"
          />
        </section>
        <section className={styles.card}>
          <h4>Type share</h4>
          <DonutChart
            items={report.typeSlices}
            centerValue={report.total}
            centerLabel="requests"
          />
        </section>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h4>
            {range === 'today'
              ? 'Requests today by hour'
              : range === '7d'
                ? 'Requests over time (last 7 days)'
                : 'Requests over time (last 14 days)'}
          </h4>
          <p className={styles.chartNote}>
            {range === 'today'
              ? 'Hourly count for today only.'
              : range === '7d'
                ? 'Daily count for the last 7 days.'
                : 'Daily count for the last 14 days. Cards above still use the selected period.'}
          </p>
          <ColumnChart points={range === 'today' ? report.hours : report.trend} />
        </section>
        <section className={styles.card}>
          <h4>By incident type ({report.total})</h4>
          <BarList items={report.types} colors={TYPE_COLORS} total={report.total} />
        </section>
        <section className={styles.card}>
          <h4>By exact status</h4>
          <BarList
            items={report.statuses}
            colors={{ ...STATUS_COLORS, default: '#64748b' }}
            total={report.total}
          />
        </section>
        <section className={styles.card}>
          <h4>Top locations</h4>
          <BarList items={report.barangays} colors={TYPE_COLORS} total={report.total} />
        </section>
        {range !== 'today' && (
          <section className={`${styles.card} ${styles.wide}`}>
            <h4>Requests by hour of day</h4>
            <p className={styles.chartNote}>Count of when requests were sent. Peak is {report.peakHour} ({report.peakCount}).</p>
            <ColumnChart points={report.hours} color="#1565c0" />
          </section>
        )}
      </div>
    </div>
  );
}
