import { useEffect, useState } from 'react';
import Icon from '../common/Icon';
import { INCIDENT_TYPE_GROUPS, matchingTypeNames } from '../../constants/incidentTypes';
import { displayIncidentStatus, statusColor } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import { formatIncidentLocation } from '../../utils/locationFormat';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { downloadPhoto, downloadPhotosZip } from '../../utils/downloadPhotos';
import styles from './AccidentPhotoReport.module.css';

const OTHER_CATEGORY = 'Other Emergency';
const NEW_PHOTO_MS = 24 * 60 * 60 * 1000;

/** "New" = the accident was reported within the last 24 hours. */
function isNewReport(incident) {
  return Date.now() - new Date(incident.date_reported).getTime() < NEW_PHOTO_MS;
}

/** Incident types are stored as "Category" or "Category — Specific type". */
function categoryOf(type) {
  const text = String(type || '').trim();
  const group = INCIDENT_TYPE_GROUPS.find((g) =>
    matchingTypeNames(g.category).some((name) => text.startsWith(name))
  );
  return group ? group.category : OTHER_CATEGORY;
}

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** e.g. accident-370-vehicular-accident-car-vs-tricycle-1.jpg */
function photoFileName(incident, url, index) {
  const ext = url.split('.').pop().toLowerCase();
  const type = slugify(incident.incident_type) || 'emergency';
  return `accident-${incident.incident_id}-${type}-${index + 1}.${ext}`;
}

/** One entry per photo, in the same order as the incidents (newest first). */
function collectPhotos(incidents) {
  return incidents
    .filter((inc) => inc.incident_status !== 'Deleted')
    .flatMap((inc) => {
      const urls = Array.isArray(inc.photo_urls) ? inc.photo_urls : [];
      const category = categoryOf(inc.incident_type);
      return urls.map((url, index) => ({
        url: resolveMediaUrl(url),
        fileName: photoFileName(inc, url, index),
        category,
        incident: inc,
      }));
    });
}

function placeOf(incident) {
  const loc = Array.isArray(incident.locations) ? incident.locations[0] : incident.locations;
  return formatIncidentLocation(loc);
}

export default function AccidentPhotoReport({ incidents, periodLabel, isLoading, onOpenIncident }) {
  const [category, setCategory] = useState('all');
  // The open photo is remembered by URL so the 5-second data refresh cannot swap it.
  const [openUrl, setOpenUrl] = useState('');
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const photos = collectPhotos(incidents);
  const shown = category === 'all' ? photos : photos.filter((p) => p.category === category);
  const openIndex = shown.findIndex((p) => p.url === openUrl);
  const open = openIndex >= 0 ? shown[openIndex] : null;

  const filters = [
    { id: 'all', label: 'All categories', count: photos.length },
    ...INCIDENT_TYPE_GROUPS.map((g) => ({
      id: g.category,
      label: g.category,
      count: photos.filter((p) => p.category === g.category).length,
    })),
  ];

  const step = (offset) => {
    const next = shown[(openIndex + offset + shown.length) % shown.length];
    if (next) setOpenUrl(next.url);
  };

  const handleDownload = async (photo) => {
    setDownloadError('');
    try {
      await downloadPhoto(photo);
    } catch {
      setDownloadError(`Could not download the photo of accident #${photo.incident.incident_id}.`);
    }
  };

  // Only the photos of the selected filter are included.
  const handleDownloadAll = async () => {
    setDownloadError('');
    setIsDownloadingAll(true);
    try {
      const zipName = `accident-photos-${slugify(category)}-${slugify(periodLabel)}.zip`;
      const failed = await downloadPhotosZip(shown, zipName);
      if (failed) setDownloadError(`${failed} of ${shown.length} photos could not be downloaded.`);
    } catch {
      setDownloadError('Could not download the photos. Please try again.');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenUrl('');
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (isLoading) return <div className={styles.empty}>Loading photos…</div>;

  return (
    <div>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.downloadAll}
          onClick={handleDownloadAll}
          disabled={isDownloadingAll || shown.length === 0}
        >
          <Icon name="download" size={18} />
          {isDownloadingAll ? 'Downloading…' : `Download All (${shown.length})`}
        </button>
        {downloadError && <span className={styles.error} role="alert">{downloadError}</span>}
        <select
          className={styles.categorySelect}
          value={category}
          onChange={(e) => { setCategory(e.target.value); setDownloadError(''); }}
          aria-label="Filter photos by accident type"
        >
          {filters.map((f) => (
            <option key={f.id} value={f.id}>{f.label} ({f.count})</option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="photo_library" size={36} />
          <p>No {category === 'all' ? 'accident' : category} photos for {periodLabel}.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {shown.map((photo) => {
            const { url, incident } = photo;
            const isNew = isNewReport(incident);
            return (
              <div key={url} className={styles.cardWrap}>
                <button type="button" className={styles.card} onClick={() => setOpenUrl(url)}>
                  <img src={url} alt={`Accident #${incident.incident_id}`} loading="lazy" />
                  <span className={styles.cardBody}>
                    <strong>#{incident.incident_id} · {incident.incident_type || 'Emergency'}</strong>
                    <small>{formatDate(incident.date_reported)}</small>
                    <small>{placeOf(incident)}</small>
                    <span className={styles.status} style={{ background: statusColor(incident.incident_status) }}>
                      {displayIncidentStatus(incident.incident_status)}
                    </span>
                  </span>
                </button>
                <span className={`${styles.age} ${isNew ? styles.ageNew : ''}`}>
                  {isNew ? 'New' : 'Old'}
                </span>
                <button
                  type="button"
                  className={styles.cardDownload}
                  onClick={() => handleDownload(photo)}
                  title="Download photo"
                  aria-label={`Download photo of accident #${incident.incident_id}`}
                >
                  <Icon name="download" size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className={styles.lightbox} onClick={() => setOpenUrl('')} role="dialog" aria-label="Accident photo">
          <div className={styles.viewer} onClick={(e) => e.stopPropagation()}>
            <img src={open.url} alt={`Accident #${open.incident.incident_id}`} />
            <div className={styles.caption}>
              <div>
                <strong>#{open.incident.incident_id} · {open.incident.incident_type || 'Emergency'}</strong>
                <small>{formatDate(open.incident.date_reported)} · {placeOf(open.incident)}</small>
              </div>
              <div className={styles.actions}>
                <button type="button" onClick={() => step(-1)} aria-label="Previous photo">
                  <Icon name="chevron_left" size={18} />
                </button>
                <span>{openIndex + 1} / {shown.length}</span>
                <button type="button" onClick={() => step(1)} aria-label="Next photo">
                  <Icon name="chevron_right" size={18} />
                </button>
                <button type="button" onClick={() => handleDownload(open)}>
                  <Icon name="download" size={18} /> Download
                </button>
                <button
                  type="button"
                  onClick={() => { setOpenUrl(''); onOpenIncident(open.incident); }}
                >
                  View details
                </button>
                <button type="button" onClick={() => setOpenUrl('')}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
