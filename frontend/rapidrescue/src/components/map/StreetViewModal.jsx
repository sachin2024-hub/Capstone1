import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findNearbyStreetView, getGoogleMapsApiKey, loadGoogleMaps } from './googleMapsLoader';
import { headingBetween, nearestRoadPoint } from './routeService';
import { findNearestPano } from './streetViewPano';
import styles from './StreetViewModal.module.css';

function embedStreetViewUrl(lat, lng, heading = 0, pano = '') {
  const yaw = Math.round(Number(heading) || 0);
  if (pano) {
    return `https://www.google.com/maps?layer=c&panoid=${encodeURIComponent(pano)}&cbp=12,${yaw},0,0,0&hl=en&output=svembed`;
  }
  const latN = Number(lat).toFixed(7);
  const lngN = Number(lng).toFixed(7);
  return `https://www.google.com/maps?layer=c&cbll=${latN},${lngN}&cbp=12,${yaw},0,0,0&hl=en&z=18&output=svembed`;
}

function satelliteUrl(lat, lng) {
  return `https://maps.google.com/maps?q=${Number(lat)},${Number(lng)}&t=k&z=18&ie=UTF8&output=embed`;
}

function mapsUrl(lat, lng, pano) {
  if (pano) {
    return `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(pano)}`;
  }
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export default function StreetViewModal({ target, onClose, portalTarget = null }) {
  const panoRef = useRef(null);
  const panoramaRef = useRef(null);
  const [mode, setMode] = useState('loading');
  const [message, setMessage] = useState('Looking for the nearest road view…');
  const [view, setView] = useState(null);
  const [panoId, setPanoId] = useState('');
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    if (!target) return undefined;
    let cancelled = false;
    setMode('loading');
    setMessage('Looking for the nearest road view…');
    setView(null);
    setPanoId('');
    panoramaRef.current = null;

    (async () => {
      const origin = { lat: Number(target.lat), lng: Number(target.lng) };
      const road = await nearestRoadPoint(origin.lat, origin.lng);
      const lookAt = road && road.distance < 800 ? road : origin;
      if (cancelled) return;

      const found = await findNearestPano(lookAt.lat, lookAt.lng);
      if (cancelled) return;

      const panoSpot = found || lookAt;
      const heading = headingBetween(
        { lat: panoSpot.lat, lng: panoSpot.lng },
        origin
      );

      const key = getGoogleMapsApiKey();
      if (key && found?.pano) {
        try {
          const google = await loadGoogleMaps();
          const data = await findNearbyStreetView(google, found.lat, found.lng);
          if (cancelled) return;
          if (data?.location) {
            const pano = data.location.pano || found.pano;
            setPanoId(pano);
            setView({
              lat: data.location.latLng.lat(),
              lng: data.location.latLng.lng(),
              heading,
            });
            setMode('js');
            requestAnimationFrame(() => {
              if (cancelled || !panoRef.current) return;
              panoramaRef.current = new google.maps.StreetViewPanorama(panoRef.current, {
                pano,
                position: data.location.latLng,
                pov: { heading, pitch: 0 },
                zoom: 1,
                addressControl: true,
                linksControl: true,
                panControl: true,
                zoomControl: true,
                fullscreenControl: true,
                motionTracking: false,
                enableCloseButton: false,
              });
            });
            return;
          }
        } catch {
          /* use embed */
        }
      }

      if (cancelled) return;

      if (found?.pano) {
        setPanoId(found.pano);
        setView({ lat: found.lat, lng: found.lng, heading });
        setMode('embed');
        return;
      }

      setView({ ...origin, heading: 0 });
      setMode('satellite');
    })();

    return () => {
      cancelled = true;
      panoramaRef.current = null;
    };
  }, [target]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!target) return null;

  const host = portalTarget || document.body;
  const viewLat = view?.lat ?? target.lat;
  const viewLng = view?.lng ?? target.lng;
  const openMaps = mapsUrl(viewLat, viewLng, panoId);
  const showingStreet = mode === 'js' || mode === 'embed';

  const node = (
    <div
      className={`${styles.overlay} ${portalTarget ? styles.overlayContained : ''} ${isFull ? styles.overlayFull : ''}`}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.titleRow}>
              <span className={styles.pegman} aria-hidden>🚶</span>
              <h2>{showingStreet ? 'Nearby Street View' : 'Nearby satellite view'}</h2>
            </div>
            <p className={styles.subtitle}>
              {target.label || 'Victim / Help location'}
            </p>
          </div>
          <p className={styles.hint}>
            {showingStreet ? 'Click and drag to look around' : 'Street View is not on this road — satellite shown instead'}
          </p>
          <div className={styles.headerActions}>
            <button type="button" className={styles.fullBtn} onClick={() => setIsFull((v) => !v)}>
              {isFull ? 'Exit' : 'Full'}
            </button>
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {mode === 'js' && <div ref={panoRef} className={styles.pano} />}
          {mode === 'embed' && view && (
            <iframe
              className={styles.pano}
              title="Nearby Street View"
              src={embedStreetViewUrl(view.lat, view.lng, view.heading, panoId)}
              allow="fullscreen; accelerometer; gyroscope; geolocation"
              allowFullScreen
              loading="eager"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
          {mode === 'satellite' && view && (
            <iframe
              className={styles.pano}
              title="Satellite view"
              src={satelliteUrl(view.lat, view.lng)}
              allow="fullscreen"
              allowFullScreen
              loading="eager"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
          {mode === 'loading' && (
            <div className={styles.messageBox}>
              <div className={styles.spinner} />
              <p>{message}</p>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <p className={styles.note}>
            {showingStreet
              ? 'Showing the nearest Google road view. It may not be the exact incident spot.'
              : 'Google has no Street View on this street yet. Satellite is shown so you can still see the area.'}
          </p>
          <div className={styles.footerActions}>
            <a className={styles.mapsLink} href={openMaps} target="_blank" rel="noopener noreferrer">
              Open in Google Maps
            </a>
            <button type="button" className={styles.backBtn} onClick={onClose}>
              Back to Map
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, host);
}
