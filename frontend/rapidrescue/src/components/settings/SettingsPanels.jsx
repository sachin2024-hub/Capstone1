import { useState } from 'react';
import api from '../../services/api';
import Icon from '../common/Icon';
import { checkPassword } from '../../utils/passwordStrength';
import styles from './SettingsPanels.module.css';

function Notice({ notice }) {
  if (!notice) return null;
  return <p className={`${styles.notice} ${notice.ok ? styles.noticeOk : styles.noticeErr}`}>{notice.text}</p>;
}

function Section({ icon, title, description, children }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}><Icon name={icon} size={20} /></span>
        <div>
          <h2 className={styles.sectionTitle}>{title}</h2>
          <p className={styles.sectionDesc}>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function CardTitle({ icon, children }) {
  return <h3 className={styles.title}><Icon name={icon} size={18} /> {children}</h3>;
}

/** Read-only list of label / value rows. */
function InfoCard({ icon, title, rows }) {
  return (
    <div className={styles.card}>
      <CardTitle icon={icon}>{title}</CardTitle>
      <dl className={styles.rows}>
        {rows.map(([label, value]) => (
          <div className={styles.row} key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ProfileCard({ user, onSaved }) {
  const [form, setForm] = useState(() => ({
    first_name: user?.first_name || '',
    middle_name: user?.middle_name || '',
    last_name: user?.last_name || '',
    contact_number: user?.contact_number || '',
    email: user?.email || '',
  }));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setNotice({ ok: false, text: 'First name and last name are required.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await api.patch(`/admin/${user.admin_id}`, form);
      onSaved({ ...user, ...data });
      setNotice({ ok: true, text: 'Profile updated.' });
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.card} onSubmit={submit}>
      <CardTitle icon="edit">Edit Profile</CardTitle>
      <div className={styles.fieldGrid}>
        <label className={styles.field}>First name<input value={form.first_name} onChange={set('first_name')} /></label>
        <label className={styles.field}>Middle name<input value={form.middle_name} onChange={set('middle_name')} /></label>
        <label className={styles.field}>Last name<input value={form.last_name} onChange={set('last_name')} /></label>
        <label className={styles.field}>Contact number<input value={form.contact_number} onChange={set('contact_number')} /></label>
        <label className={`${styles.field} ${styles.span2}`}>Email
          <input type="email" value={form.email} onChange={set('email')} />
        </label>
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        <Notice notice={notice} />
      </div>
    </form>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const strength = checkPassword(form.next);
  const mismatch = form.confirm !== '' && form.confirm !== form.next;

  const submit = async (e) => {
    e.preventDefault();
    if (strength.level !== 'strong') return setNotice({ ok: false, text: 'Password is too weak. Meet all the requirements to make it Strong.' });
    if (form.next !== form.confirm) return setNotice({ ok: false, text: 'New password and confirmation do not match.' });
    setSaving(true);
    setNotice(null);
    try {
      await api.post('/admin/change-password', { current_password: form.current, new_password: form.next });
      setForm({ current: '', next: '', confirm: '' });
      setNotice({ ok: true, text: 'Password changed.' });
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <form className={styles.card} onSubmit={submit}>
      <CardTitle icon="lock">Change Password</CardTitle>
      <div className={styles.fieldGrid3}>
        <label className={styles.field}>Current password
          <input type="password" autoComplete="current-password" value={form.current} onChange={set('current')} />
        </label>
        <label className={styles.field}>New password
          <input type="password" autoComplete="new-password" value={form.next} onChange={set('next')} />
        </label>
        <label className={styles.field}>Confirm new password
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </label>
      </div>
      {mismatch && <p className={`${styles.notice} ${styles.noticeErr}`}>Passwords do not match.</p>}
      {form.next && (
        <div className={styles.strength}>
          <div className={styles.strengthHead}>
            <span>Password strength</span>
            <strong className={styles[`level_${strength.level}`]}>{strength.label}</strong>
          </div>
          <div className={styles.meter} aria-hidden="true">
            {['weak', 'medium', 'strong'].map((lvl, i) => (
              <span
                key={lvl}
                className={i <= ['weak', 'medium', 'strong'].indexOf(strength.level) ? styles[`bar_${strength.level}`] : ''}
              />
            ))}
          </div>
          <ul className={styles.rules}>
            {strength.results.map((r) => (
              <li key={r.id} className={r.met ? styles.ruleMet : ''}>
                <Icon name={r.met ? 'check_circle' : 'radio_button_unchecked'} size={14} /> {r.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!form.next && <p className={styles.hint}>Your new password must be Strong: 8+ characters with uppercase, lowercase, a number, and a symbol.</p>}
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primary}
          disabled={saving || !form.current || strength.level !== 'strong' || form.confirm !== form.next}
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
        <Notice notice={notice} />
      </div>
    </form>
  );
}

function AlarmCard({ volume, onVolume, onPreview }) {
  return (
    <div className={styles.card}>
      <CardTitle icon="notifications">Alarm Sound</CardTitle>
      <div className={styles.field}>
        <div className={styles.volumeHead}>
          <label htmlFor="alarm-volume">Volume</label>
          <span className={styles.volumeValue}>{volume}%</span>
        </div>
        <input
          id="alarm-volume"
          className={styles.slider}
          type="range"
          min="0"
          max="100"
          step="5"
          value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
        />
      </div>
      <p className={styles.hint}>Outside-area requests use a separate beep that is played louder, so it is still heard.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => onPreview('city')}>Test city siren</button>
        <button type="button" className={styles.secondary} onClick={() => onPreview('outside')}>Test outside beep</button>
      </div>
    </div>
  );
}

export default function SettingsPanels({
  user, onProfileSaved, adminRows, systemRows, statRows,
  volume, onVolume, onPreview,
}) {
  return (
    <div className={styles.page}>
      <Section icon="person" title="Account Information" description="Your administrator details.">
        <div className={styles.grid}>
          <InfoCard icon="badge" title="Admin Profile" rows={adminRows} />
          {user?.admin_id != null && <ProfileCard user={user} onSaved={onProfileSaved} />}
        </div>
      </Section>

      <Section icon="dns" title="System Information" description="About this system and its current activity.">
        <div className={styles.grid}>
          <InfoCard icon="info" title="System Info" rows={systemRows} />
          <InfoCard icon="bar_chart" title="Quick Stats" rows={statRows} />
        </div>
      </Section>

      <Section icon="shield" title="Security & Account Protection" description="Keep your account secure.">
        <PasswordCard />
      </Section>

      <Section icon="campaign" title="Alarm Configuration" description="Sound played for new help requests.">
        <AlarmCard volume={volume} onVolume={onVolume} onPreview={onPreview} />
      </Section>
    </div>
  );
}
