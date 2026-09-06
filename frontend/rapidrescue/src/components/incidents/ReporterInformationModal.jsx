import { useState } from 'react';
import styles from './ReporterInformationModal.module.css';

function fullName(user) {
  if (!user) return 'Unknown reporter';
  return [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ').trim() || 'Unknown reporter';
}

function initials(user) {
  const first = String(user?.first_name || '').trim().charAt(0);
  const last = String(user?.last_name || '').trim().charAt(0);
  return (first + last).toUpperCase() || '?';
}

function pick(user, keys) {
  if (!user) return '';
  for (const key of keys) {
    const value = user[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function maskIdNumber(value) {
  const raw = String(value || '').replace(/\s+/g, '');
  if (!raw) return '';
  const visible = raw.slice(-4);
  const hidden = '•'.repeat(Math.max(raw.length - 4, 4));
  return `${hidden}${visible}`;
}

function resolveImageSrc(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const origin = window.location.origin.replace(/:\d+$/, ':5000');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function verificationInfo(user) {
  const raw = pick(user, ['verification_status', 'id_verification_status', 'identity_status']);
  const hasId = Boolean(pick(user, ['id_image_url', 'valid_id_url', 'id_image', 'valid_id_image']));
  const normalized = raw.toLowerCase();

  if (normalized === 'verified' || normalized === 'approved' || user?.id_verified === true) {
    return { label: 'Verified', tone: 'verified' };
  }
  if (normalized === 'pending' || normalized === 'in review' || normalized === 'submitted' || hasId) {
    return { label: 'Pending review', tone: 'pending' };
  }
  if (user?.account_status === 'Blocked') {
    return { label: 'Blocked', tone: 'blocked' };
  }
  if (user?.user_id) {
    return { label: 'Unverified', tone: 'unverified' };
  }
  return { label: 'Unknown', tone: 'unverified' };
}

function headerBadge(user) {
  if (user?.account_status === 'Blocked') {
    return { label: 'Blocked Account', tone: 'blocked' };
  }
  if (user?.user_id) {
    return { label: 'Verified User', tone: 'verified' };
  }
  return { label: 'Unknown', tone: 'unverified' };
}

export default function ReporterInformationModal({ user, onClose }) {
  const [showIdViewer, setShowIdViewer] = useState(false);

  const name = fullName(user);
  const photo = resolveImageSrc(pick(user, ['profile_picture', 'avatar_url', 'photo_url', 'profile_photo']));
  const phone = pick(user, ['phone_number', 'contact_number']);
  const email = pick(user, ['email']);
  const address = pick(user, ['address']);
  const idType = pick(user, ['id_type', 'valid_id_type', 'identity_type']);
  const idNumber = pick(user, ['id_number', 'valid_id_number', 'identity_number']);
  const idImage = resolveImageSrc(pick(user, ['id_image_url', 'valid_id_url', 'id_image', 'valid_id_image']));
  const identity = verificationInfo(user);
  const badge = headerBadge(user);
  const userId = user?.user_id;

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="reporter-info-title">
        <div className={styles.header}>
          <h3 id="reporter-info-title" className={styles.title}>Reporter Information</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.profileCard}>
          {photo ? (
            <img src={photo} alt={name} className={styles.avatarImg} />
          ) : (
            <div className={styles.avatar} aria-hidden="true">{initials(user)}</div>
          )}
          <div className={styles.profileMeta}>
            <div className={styles.profileName}>{name}</div>
            <div className={styles.profileId}>{userId ? `#${userId}` : 'No user ID'}</div>
          </div>
          <span className={`${styles.badge} ${styles[`badge_${badge.tone}`]}`}>
            {badge.label}
          </span>
        </div>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Personal Information</h4>
          <div className={styles.grid}>
            <div className={styles.cell}>
              <span className={styles.label}>Mobile Number</span>
              {phone ? (
                <a className={styles.phoneLink} href={`tel:${phone}`}>{phone}</a>
              ) : (
                <span className={styles.value}>—</span>
              )}
            </div>
            <div className={styles.cell}>
              <span className={styles.label}>Email Address</span>
              {email ? (
                <a className={styles.emailLink} href={`mailto:${email}`}>{email}</a>
              ) : (
                <span className={styles.value}>—</span>
              )}
            </div>
            <div className={`${styles.cell} ${styles.cellFull}`}>
              <span className={styles.label}>Complete Address</span>
              <span className={styles.value}>{address || '—'}</span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Identity Verification</h4>
          <div className={styles.grid}>
            <div className={styles.cell}>
              <span className={styles.label}>ID Type</span>
              <span className={styles.value}>{idType || 'Not provided'}</span>
            </div>
            <div className={styles.cell}>
              <span className={styles.label}>ID Number</span>
              <span className={styles.masked}>{idNumber ? maskIdNumber(idNumber) : 'Not provided'}</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.viewIdBtn}
            onClick={() => setShowIdViewer(true)}
          >
            View Valid ID
          </button>
        </section>
      </div>

      {showIdViewer && (
        <div
          className={styles.viewerOverlay}
          onClick={(e) => {
            e.stopPropagation();
            setShowIdViewer(false);
          }}
        >
          <div className={styles.viewer} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Valid ID">
            <div className={styles.viewerHead}>
              <h4>Valid ID</h4>
              <button type="button" className={styles.closeBtn} onClick={() => setShowIdViewer(false)} aria-label="Close">✕</button>
            </div>
            {idImage ? (
              <img src={idImage} alt={`${name} valid ID`} className={styles.idImage} />
            ) : (
              <p className={styles.emptyId}>No valid ID has been uploaded for this reporter.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
