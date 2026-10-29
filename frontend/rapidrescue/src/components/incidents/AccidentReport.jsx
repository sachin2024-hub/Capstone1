import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toPng } from 'html-to-image';
import * as XLSX from 'xlsx';
import { INCIDENT_TYPE_GROUPS, matchingTypeNames } from '../../constants/incidentTypes';
import { STATUS_COLORS } from '../../constants/statusColors';
import { OUTSIDE_STATUS_VALUES } from '../../services/incidentService';
import { parseLocationAddress } from '../../utils/locationFormat';
import { isWithinCabadbaran } from '../../utils/geofence';
import Icon from '../common/Icon';
import styles from './AccidentReport.module.css';

const ACTIVE_STATUSES = ['Dispatch', 'In Progress', 'En Route', 'Arrived'];
const HIDDEN_STATUSES = ['Archived', 'Deleted'];
// Categorical slots 1-5 (blue, orange, aqua, yellow, magenta) pass the CVD / normal-vision
// checks of the dataviz validator; everything past 5 folds into a neutral "Other".
const TYPE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const OTHER_COLOR = '#94a3b8';
const BRAND = '#c1121f';
const MAX_TYPE_SLICES = TYPE_COLORS.length;

function foldTypes(types) {
  if (types.length <= MAX_TYPE_SLICES) {
    return types.map((item, idx) => ({ ...item, color: TYPE_COLORS[idx] }));
  }
  const head = types.slice(0, MAX_TYPE_SLICES - 1).map((item, idx) => ({ ...item, color: TYPE_COLORS[idx] }));
  const rest = types.slice(MAX_TYPE_SLICES - 1);
  return [...head, { label: 'Other', count: rest.reduce((sum, item) => sum + item.count, 0), color: OTHER_COLOR }];
}

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

function monthLabel(monthIndex) {
  return new Date(2000, monthIndex, 1).toLocaleDateString('en-PH', { month: 'short' });
}

function buildTrend(rows, dateFilter) {
  const mode = dateFilter?.mode || 'all';
  const now = new Date();

  if (mode === 'year') {
    const year = dateFilter.year ?? now.getFullYear();
    const byMonth = Array.from({ length: 12 }, (_, month) => ({ label: monthLabel(month), count: 0 }));
    rows.forEach((inc) => {
      if (!inc.date_reported) return;
      const d = new Date(inc.date_reported);
      if (d.getFullYear() === year) byMonth[d.getMonth()].count += 1;
    });
    return byMonth;
  }

  let dayCount = 14;
  let from = startOfLocalDay(addDays(now, -(dayCount - 1)));

  if (mode === 'week') {
    const start = startOfLocalDay(now);
    const weekday = start.getDay();
    start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));
    from = start;
    dayCount = 7;
  } else if (mode === 'month' || mode === 'date') {
    const year = dateFilter.year ?? now.getFullYear();
    const month = dateFilter.month ?? now.getMonth();
    from = new Date(year, month, 1);
    dayCount = new Date(year, month + 1, 0).getDate();
  } else if (mode === 'day') {
    dayCount = 1;
    from = startOfLocalDay(now);
  }

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

function hourLabel(hour) {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** Groups the 24 hourly counts into 4 parts of the day, which are easier to read than 24 boxes. */
const DAY_PARTS = [
  { label: 'Late night · 12 AM–6 AM', from: 0, to: 6 },
  { label: 'Morning · 6 AM–12 PM', from: 6, to: 12 },
  { label: 'Afternoon · 12 PM–6 PM', from: 12, to: 18 },
  { label: 'Evening · 6 PM–12 AM', from: 18, to: 24 },
];

function dayParts(hours) {
  return DAY_PARTS.map((part) => ({
    label: part.label,
    count: hours.slice(part.from, part.to).reduce((sum, h) => sum + h.count, 0),
  }));
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

function fileStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function slugify(text) {
  return String(text || 'chart')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'chart';
}

async function downloadNodeAsPng(node, filename) {
  if (!node) return;
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    filter: (el) => !(el instanceof HTMLElement && el.dataset?.captureIgnore === 'true'),
  });
  const link = document.createElement('a');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.href = dataUrl;
  link.click();
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

function requestLabel(count) {
  const n = Number(count) || 0;
  return `${n} request${n === 1 ? '' : 's'}`;
}

function ChartTipBubble({ tip }) {
  if (!tip) return null;
  return (
    <div
      className={styles.chartTooltip}
      style={{ left: tip.x, top: tip.y }}
      role="tooltip"
      data-capture-ignore="true"
    >
      <div className={styles.chartTooltipTitle}>{tip.label}</div>
      {tip.value != null && tip.value !== '' && (
        <div className={styles.chartTooltipValue}>{tip.value}</div>
      )}
      {tip.pct != null && tip.pct !== '' && (
        <div className={styles.chartTooltipPct}>{tip.pct}</div>
      )}
    </div>
  );
}

function useHoverTip() {
  const hostRef = useRef(null);
  const tipRef = useRef(null);
  const [tip, setTip] = useState(null);

  const place = (clientX, clientY, payload) => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const pad = 12;
    let x = clientX - rect.left + 14;
    let y = clientY - rect.top - 10;
    const maxX = Math.max(pad, rect.width - 160);
    const maxY = Math.max(pad, rect.height - 70);
    x = Math.min(Math.max(pad, x), maxX);
    y = Math.min(Math.max(pad, y), maxY);
    const next = { ...payload, x, y };
    tipRef.current = next;
    setTip(next);
  };

  const showAtEvent = (e, payload) => {
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    place(point.clientX, point.clientY, payload);
  };

  const hide = () => {
    tipRef.current = null;
    setTip(null);
  };

  const bindItem = (payload) => ({
    onMouseEnter: (e) => showAtEvent(e, payload),
    onMouseMove: (e) => showAtEvent(e, payload),
    onMouseLeave: hide,
    onFocus: (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      place(rect.left + rect.width / 2, rect.top, payload);
    },
    onBlur: hide,
    onClick: (e) => {
      e.stopPropagation();
      if (tipRef.current && tipRef.current.label === payload.label) hide();
      else showAtEvent(e, payload);
    },
  });

  return { hostRef, tip, showAtEvent, hide, bindItem };
}

function DonutChart({ items, size = 168, stroke = 22, centerValue, centerLabel }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const slices = items.filter((item) => item.count > 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - stroke) / 2;
  const { hostRef, tip, showAtEvent, hide, bindItem } = useHoverTip();

  const sliceMeta = [];
  let angle = 0;
  slices.forEach((item) => {
    const sweep = total > 0 ? (item.count / total) * 360 : 0;
    const start = angle;
    const end = angle + sweep;
    sliceMeta.push({ ...item, start, end, sweep });
    angle = end;
  });

  const tipFor = (item) => ({
    label: item.label,
    value: requestLabel(item.count),
    pct: pct(item.count, total),
  });

  const resolveSliceFromPointer = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const point = e.touches?.[0] || e;
    const x = point.clientX - rect.left - cx;
    const y = point.clientY - rect.top - cy;
    const dist = Math.sqrt(x * x + y * y);
    const band = stroke / 2 + 6;
    if (dist < radius - band || dist > radius + band) {
      hide();
      return;
    }
    if (!sliceMeta.length) {
      hide();
      return;
    }
    if (sliceMeta.length === 1) {
      showAtEvent(e, tipFor(sliceMeta[0]));
      return;
    }
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    const hit = sliceMeta.find((s) => deg >= s.start && deg < s.end) || sliceMeta[sliceMeta.length - 1];
    showAtEvent(e, tipFor(hit));
  };

  return (
    <div className={`${styles.donutWrap} ${styles.tipHost}`} ref={hostRef} onMouseLeave={hide}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={styles.donutSvg}
        onMouseMove={resolveSliceFromPointer}
        onMouseLeave={hide}
        onClick={resolveSliceFromPointer}
        onTouchStart={resolveSliceFromPointer}
      >
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {total > 0 && sliceMeta.length === 1 && (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={sliceMeta[0].color}
            strokeWidth={stroke}
            pathLength="100"
            className={`${styles.donutHit} ${styles.donutSlice}`}
          />
        )}
        {total > 0 && sliceMeta.length > 1 && sliceMeta.map((item, index) => (
          <path
            key={item.label}
            d={arcPath(cx, cy, radius, item.start, item.end)}
            fill="none"
            stroke={item.color}
            strokeWidth={stroke}
            strokeLinecap="butt"
            pathLength="100"
            className={`${styles.donutHit} ${styles.donutSlice}`}
            style={{ animationDelay: `${index * 0.12}s` }}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" className={styles.donutValue}>{centerValue}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className={styles.donutCenterLabel}>{centerLabel}</text>
      </svg>
      <ul className={styles.donutLegend}>
        {items.map((item) => (
          <li
            key={item.label}
            className={styles.legendItem}
            tabIndex={0}
            {...bindItem(tipFor(item))}
          >
            <span className={styles.legendDot} style={{ background: item.color }} />
            <span className={styles.legendName}>{item.label}</span>
            <span className={styles.legendCount}>{item.count}</span>
            <span className={styles.legendPct}>{pct(item.count, total)}</span>
          </li>
        ))}
      </ul>
      <ChartTipBubble tip={tip} />
    </div>
  );
}

function BarList({ items, colors, total }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  const { hostRef, tip, hide, bindItem } = useHoverTip();

  if (!items.length) {
    return <p className={styles.emptyChart}>No data for this period.</p>;
  }
  return (
    <div className={`${styles.barList} ${styles.tipHost}`} ref={hostRef} onMouseLeave={hide}>
      {items.map((item, idx) => {
        const payload = {
          label: item.label,
          value: requestLabel(item.count),
          pct: pct(item.count, total),
        };
        return (
          <div
            key={item.label}
            className={styles.barRow}
            tabIndex={0}
            {...bindItem(payload)}
          >
            <span className={styles.barLabel}>{item.label}</span>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{
                  width: `${(item.count / max) * 100}%`,
                  background: Array.isArray(colors) ? colors[idx % colors.length] : (colors[item.label] || colors.default || '#c1121f'),
                  animationDelay: `${idx * 0.06}s`,
                }}
              />
            </div>
            <span className={styles.barCount}>{item.count}</span>
            <span className={styles.barPct}>{pct(item.count, total)}</span>
          </div>
        );
      })}
      <ChartTipBubble tip={tip} />
    </div>
  );
}

function ColumnChart({ points, color = '#c1121f' }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const { hostRef, tip, hide, bindItem } = useHoverTip();

  return (
    <div className={`${styles.columns} ${styles.tipHost}`} ref={hostRef} onMouseLeave={hide}>
      {points.map((point, index) => {
        const payload = {
          label: point.label,
          value: requestLabel(point.count),
          pct: null,
        };
        return (
          <div
            key={point.label}
            className={styles.col}
            tabIndex={0}
            {...bindItem(payload)}
          >
            <span className={styles.colValue}>{point.count || ''}</span>
            <div className={styles.colTrack}>
              <div
                className={styles.colBar}
                style={{
                  height: `${Math.max(point.count ? 8 : 2, (point.count / max) * 100)}%`,
                  background: color,
                  animationDelay: `${index * 0.05}s`,
                }}
              />
            </div>
            <span className={styles.colLabel}>{point.label}</span>
          </div>
        );
      })}
      <ChartTipBubble tip={tip} />
    </div>
  );
}

function RingGauge({ value, size = 96, stroke = 10, color = '#4ade80' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.ring} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={styles.ringArc}
      />
    </svg>
  );
}

function StackBar({ items, total }) {
  const { hostRef, tip, hide, bindItem } = useHoverTip();
  const segments = items.filter((item) => item.count > 0);
  return (
    <div className={`${styles.stack} ${styles.tipHost}`} ref={hostRef} onMouseLeave={hide}>
      <div className={styles.stackTrack}>
        {segments.length === 0 && <span className={styles.stackEmpty} />}
        {segments.map((item) => (
          <span
            key={item.label}
            className={styles.stackSeg}
            style={{ flexGrow: item.count, background: item.color }}
            tabIndex={0}
            {...bindItem({ label: item.label, value: requestLabel(item.count), pct: pct(item.count, total) })}
          />
        ))}
      </div>
      <ul className={styles.stackLegend}>
        {items.map((item) => (
          <li key={item.label}>
            <span className={styles.legendDot} style={{ background: item.color }} />
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </li>
        ))}
      </ul>
      <ChartTipBubble tip={tip} />
    </div>
  );
}

function ChartCard({ title, note, children, wide = false, className = '' }) {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      await downloadNodeAsPng(cardRef.current, `rapidrescue-${slugify(title)}-${fileStamp()}.png`);
    } catch (err) {
      console.error('Chart image download failed:', err);
      window.alert('Could not download chart image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section ref={cardRef} className={`${styles.card} ${wide ? styles.wide : ''} ${className}`}>
      <div className={styles.cardHead}>
        <h4>{title}</h4>
        <button
          type="button"
          className={styles.chartDownloadBtn}
          onClick={handleDownload}
          disabled={busy}
          aria-label={busy ? 'Saving chart image' : 'Download image'}
          data-tooltip={busy ? 'Saving…' : 'Download image'}
          data-capture-ignore="true"
        >
          <Icon name={busy ? 'progress_activity' : 'download'} size={18} />
        </button>
      </div>
      {note ? <p className={styles.chartNote}>{note}</p> : null}
      {children}
    </section>
  );
}

export default function AccidentReport({
  incidents = [],
  dateFilter = { mode: 'all' },
  periodLabel = 'all time',
  isLoading = false,
}) {
  const mode = dateFilter?.mode || 'all';
  const [printOpen, setPrintOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportMeta, setReportMeta] = useState({
    title: 'Accident Analytic Report',
    subtitle: '',
    preparedBy: '',
    notes: '',
  });
  const [printDraft, setPrintDraft] = useState({
    title: 'Accident Analytic Report',
    subtitle: '',
    preparedBy: '',
    notes: '',
  });

  const report = useMemo(() => {
    const rows = (incidents || []).filter((inc) => !HIDDEN_STATUSES.includes(inc.incident_status));

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
    const response = averageResponseMs(rows);
    const types = countBy(rows, (inc) => incidentCategory(inc.incident_type));
    const barangays = countBy(rows, barangayOf);
    const peak = hours.reduce((best, h) => (h.count > best.count ? h : best), hours[0]);

    return {
      rows,
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
      statusSlices: [
        { label: 'Pending', count: pending.length, color: STATUS_COLORS.Pending },
        { label: 'Active response', count: active.length, color: '#1565c0' },
        { label: 'Resolved', count: resolved.length, color: STATUS_COLORS.Resolved },
        { label: 'Outside', count: outside.length, color: STATUS_COLORS.Outside },
        { label: 'Cancelled', count: cancelled.length, color: STATUS_COLORS.Cancelled },
      ],
      typeSlices: foldTypes(types),
      statuses: countBy(rows, (inc) => inc.incident_status),
      barangays,
      topType: types[0] || null,
      topArea: barangays[0] || null,
      peakHour: peak && peak.count > 0 ? hourLabel(peak.hour) : null,
      trend: buildTrend(rows, dateFilter),
      hours: hours.map((item) => ({ label: hourLabel(item.hour), count: item.count })),
      avgResponse: formatDuration(response.avgMs),
      avgResponseCount: response.count,
    };
  }, [incidents, dateFilter]);

  const busy = useMemo(() => {
    const parts = dayParts(report.hours);
    const top = parts.reduce((best, part) => (part.count > best.count ? part : best), parts[0]);
    return { parts, top: top.count > 0 ? top : null };
  }, [report.hours]);

  const printedOn = new Date().toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const openPrintReview = () => {
    const subtitle = reportMeta.subtitle || `Cabadbaran City DRRMO · Showing data for ${periodLabel}`;
    setPrintDraft({
      title: reportMeta.title || 'Accident Analytic Report',
      subtitle,
      preparedBy: reportMeta.preparedBy || '',
      notes: reportMeta.notes || '',
    });
    setPrintOpen(true);
  };

  const confirmPrint = () => {
    flushSync(() => {
      setReportMeta(printDraft);
      setPrintOpen(false);
    });
    window.print();
  };

  const handleExportExcel = () => {
    setExporting(true);
    try {
      const total = report.total;
      const summaryRows = [
        ['Accident Analytic Report — Cabadbaran City DRRMO'],
        ['Period', periodLabel],
        ['Generated', printedOn],
        [],
        ['Metric', 'Value'],
        ['Total Requests', total],
        ['Pending', report.pending],
        ['Active Response', report.active],
        ['Resolved', report.resolved],
        ['Outside', report.outside],
        ['Cancelled', report.cancelled],
        ['Not Reviewed', report.unreviewed],
        ['Resolution Rate', pct(report.resolved, total)],
        ['Still Open %', pct(report.stillOpen, total)],
        ['Still Open Count', report.stillOpen],
        ['Average Response Time', report.avgResponse],
        ['Dispatched Requests (for avg)', report.avgResponseCount],
      ];

      const toSheet = (title, items) => {
        const rows = [[title], ['Label', 'Count', 'Percent of total']];
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
          rows.push(['(no data)', 0, '0%']);
          return rows;
        }
        list.forEach((item) => {
          rows.push([String(item.label ?? ''), Number(item.count) || 0, pct(item.count, total)]);
        });
        return rows;
      };

      const typeItems = report.types.map((item) => ({ label: item.label, count: item.count }));
      const statusItems = report.statuses.map((item) => ({ label: item.label, count: item.count }));
      const locationItems = report.barangays.map((item) => ({ label: item.label, count: item.count }));
      const trendSource = mode === 'day' ? report.hours : report.trend;
      const trendItems = trendSource.map((item) => ({ label: item.label, count: item.count }));

      const recordRows = [
        ['ID', 'Date Reported', 'Type', 'Category', 'Status', 'Location', 'Viewed', 'Dispatch Time'],
        ...report.rows.map((inc) => {
          const loc = getLocation(inc);
          const address = loc?.location_address || loc?.address || barangayOf(inc);
          const dispatched = getDispatchTime(inc);
          return [
            inc.incident_id,
            inc.date_reported ? new Date(inc.date_reported).toLocaleString('en-PH') : '',
            inc.incident_type || '',
            incidentCategory(inc.incident_type),
            inc.incident_status || '',
            address,
            inc.viewed ? 'Yes' : 'No',
            dispatched ? new Date(dispatched).toLocaleString('en-PH') : '',
          ];
        }),
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toSheet('By Incident Type', typeItems)), 'By Type');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toSheet('By Exact Status', statusItems)), 'By Status');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toSheet('Top Locations', locationItems)), 'Locations');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toSheet('Time Series', trendItems)), 'Time Series');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recordRows), 'Records');
      XLSX.writeFile(wb, `rapidrescue-analytics-${slugify(periodLabel)}-${fileStamp()}.xlsx`);
    } catch (err) {
      console.error('Excel export failed:', err);
      window.alert('Could not export Excel file. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingBox}>
        <div className={styles.loader} />
        <span>Building accident report...</span>
      </div>
    );
  }

  const kpis = [
    { label: 'Pending', value: report.pending, color: STATUS_COLORS.Pending },
    { label: 'Active response', value: report.active, color: '#1565c0' },
    { label: 'Resolved', value: report.resolved, color: STATUS_COLORS.Resolved },
    { label: 'Outside', value: report.outside, color: STATUS_COLORS.Outside },
    { label: 'Cancelled', value: report.cancelled, color: STATUS_COLORS.Cancelled },
    { label: 'Not reviewed', value: report.unreviewed, color: BRAND, alert: report.unreviewed > 0 },
  ];

  const insights = [
    {
      label: 'Most common type',
      value: report.topType ? report.topType.label : '—',
      hint: report.topType ? `${report.topType.count} requests · ${pct(report.topType.count, report.total)}` : 'No data yet',
    },
    {
      label: 'Hotspot area',
      value: report.topArea ? report.topArea.label : '—',
      hint: report.topArea ? `${report.topArea.count} requests · ${pct(report.topArea.count, report.total)}` : 'No data yet',
    },
    {
      label: 'Busiest hour',
      value: report.peakHour || '—',
      hint: report.peakHour ? 'Most requests are reported around this time' : 'No data yet',
    },
  ];

  const trendTitle =
    mode === 'day'
      ? 'Requests today by hour'
      : mode === 'week'
        ? 'Requests this week'
        : mode === 'month' || mode === 'date'
          ? 'Requests this month'
          : mode === 'year'
            ? `Requests in ${dateFilter.year}`
            : 'Requests over time (last 14 days)';

  const trendNote =
    mode === 'day'
      ? 'Hourly count for today only.'
      : mode === 'week'
        ? 'Daily count for the current week.'
        : mode === 'month' || mode === 'date'
          ? 'Daily count for the selected month.'
          : mode === 'year'
            ? 'Monthly count for the selected year.'
            : 'Daily count for the last 14 days. Cards above still use the selected period.';

  const displayTitle = reportMeta.title || 'Accident Analytic Report';
  const displaySubtitle = reportMeta.subtitle || `Cabadbaran City DRRMO · Showing data for ${periodLabel}`;

  return (
    <div className={styles.report}>
      <div className={styles.toolbar}>
        <div>
          <h3 className={styles.title}>{displayTitle}</h3>
          <p className={styles.subtitle}>{displaySubtitle}</p>
        </div>
        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.printBtn}
            onClick={handleExportExcel}
            disabled={exporting}
          >
            <Icon name="grid_on" size={16} /> {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button type="button" className={styles.printBtn} onClick={openPrintReview}>
            <Icon name="print" size={16} /> Print
          </button>
        </div>
      </div>

      <p className={styles.printMeta}>
        Generated {printedOn} · Period: {periodLabel}
        {reportMeta.preparedBy ? ` · Prepared by: ${reportMeta.preparedBy}` : ''}
        {reportMeta.notes ? ` · Notes: ${reportMeta.notes}` : ''}
      </p>

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.heroEyebrow}>Total requests</span>
          <strong className={styles.heroValue}>{report.total}</strong>
          <span className={styles.heroSub}>{periodLabel}</span>
        </div>
        <div className={styles.heroGauge}>
          <div className={styles.ringWrap}>
            <RingGauge value={report.total ? (report.resolved / report.total) * 100 : 0} />
            <span className={styles.ringValue}>{pct(report.resolved, report.total)}</span>
          </div>
          <div>
            <span className={styles.heroEyebrow}>Resolution rate</span>
            <span className={styles.heroHint}>{report.resolved} resolved of {report.total}</span>
          </div>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroEyebrow}>Still open</span>
          <strong>{pct(report.stillOpen, report.total)}</strong>
          <span className={styles.heroHint}>
            {report.pending} pending · {report.active} active · {report.outside} outside
          </span>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroEyebrow}>Average response</span>
          <strong>{report.avgResponse}</strong>
          <span className={styles.heroHint}>
            {report.avgResponseCount
              ? `Report to dispatch · ${report.avgResponseCount} request${report.avgResponseCount === 1 ? '' : 's'}`
              : 'No dispatched requests in this period'}
          </span>
        </div>
        <div className={styles.heroBar}>
          <StackBar items={report.statusSlices} total={report.total} />
        </div>
      </section>

      <div className={styles.insightGrid}>
        {insights.map((item) => (
          <div key={item.label} className={styles.insight}>
            <span className={styles.insightLabel}>{item.label}</span>
            <strong className={styles.insightValue}>{item.value}</strong>
            <span className={styles.insightHint}>{item.hint}</span>
          </div>
        ))}
      </div>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${styles.kpi} ${kpi.alert ? styles.kpiAlert : ''}`}>
            <div className={styles.kpiTop}>
              <span className={styles.legendDot} style={{ background: kpi.color }} />
              <span className={styles.kpiLabel}>{kpi.label}</span>
            </div>
            <div className={styles.kpiValue}>{kpi.value}</div>
            <div className={styles.kpiBar}>
              <span style={{ width: report.total ? `${(kpi.value / report.total) * 100}%` : 0, background: kpi.color }} />
            </div>
            <div className={styles.kpiShare}>{pct(kpi.value, report.total)} of requests</div>
          </div>
        ))}
      </div>

      <div className={styles.mainGrid}>
        <ChartCard title={trendTitle} note={trendNote}>
          <ColumnChart points={mode === 'day' ? report.hours : report.trend} />
        </ChartCard>
        <ChartCard title="By incident type">
          <DonutChart
            items={report.typeSlices}
            centerValue={report.total}
            centerLabel="requests"
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Busiest hours of the day"
        note={busy.top
          ? `Most requests come in during the ${busy.top.label.split(' · ')[0].toLowerCase()}${report.peakHour ? `, busiest around ${report.peakHour}` : ''}.`
          : 'No requests in this period yet.'}
        wide
      >
        <p className={styles.emptyChart} style={{ textAlign: 'left', margin: '0 0 8px', fontWeight: 600 }}>
          By part of the day
        </p>
        <BarList
          items={busy.parts}
          colors={busy.top ? { [busy.top.label]: '#c1121f', default: '#f1a7ad' } : { default: '#f1a7ad' }}
          total={report.total}
        />
        <p className={styles.emptyChart} style={{ textAlign: 'left', margin: '16px 0 4px', fontWeight: 600 }}>
          By hour
        </p>
        <ColumnChart points={report.hours} />
      </ChartCard>

      <div className={styles.grid}>
        <ChartCard title="Top locations">
          <BarList items={report.barangays.slice(0, 8)} colors={[BRAND]} total={report.total} />
        </ChartCard>
        <ChartCard title="By exact status">
          <BarList
            items={report.statuses}
            colors={{ ...STATUS_COLORS, default: '#64748b' }}
            total={report.total}
          />
        </ChartCard>
      </div>

      {printOpen && (
        <div className={styles.printOverlay} onClick={() => setPrintOpen(false)} role="presentation">
          <div
            className={styles.printModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Review and edit report before printing"
          >
            <h3 className={styles.printModalTitle}>Review / Edit Report</h3>
            <p className={styles.printModalHint}>
              Edit the fields below, then print. Numbers match the current filter ({periodLabel}).
            </p>

            <label className={styles.printField}>
              <span>Report title</span>
              <input
                type="text"
                value={printDraft.title}
                onChange={(e) => setPrintDraft((prev) => ({ ...prev, title: e.target.value }))}
              />
            </label>
            <label className={styles.printField}>
              <span>Subtitle</span>
              <input
                type="text"
                value={printDraft.subtitle}
                onChange={(e) => setPrintDraft((prev) => ({ ...prev, subtitle: e.target.value }))}
              />
            </label>
            <label className={styles.printField}>
              <span>Prepared by</span>
              <input
                type="text"
                value={printDraft.preparedBy}
                onChange={(e) => setPrintDraft((prev) => ({ ...prev, preparedBy: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className={styles.printField}>
              <span>Notes / remarks</span>
              <textarea
                rows={3}
                value={printDraft.notes}
                onChange={(e) => setPrintDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes included when printing"
              />
            </label>

            <div className={styles.printPreviewBox}>
              <strong>Current totals</strong>
              <ul>
                <li>Total requests: {report.total}</li>
                <li>Pending: {report.pending}</li>
                <li>Active response: {report.active}</li>
                <li>Resolved: {report.resolved}</li>
                <li>Outside: {report.outside}</li>
                <li>Cancelled: {report.cancelled}</li>
                <li>Not reviewed: {report.unreviewed}</li>
                <li>Resolution rate: {pct(report.resolved, report.total)}</li>
                <li>Still open: {pct(report.stillOpen, report.total)}</li>
                <li>Avg response: {report.avgResponse}</li>
              </ul>
            </div>

            <div className={styles.printModalActions}>
              <button type="button" className={styles.printBtn} onClick={() => setPrintOpen(false)}>
                Cancel
              </button>
              <button type="button" className={styles.printPrimaryBtn} onClick={confirmPrint}>
                <Icon name="print" size={16} /> Print Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
