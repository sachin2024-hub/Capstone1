import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, requestPasswordReset, verifyResetOtp, resetPassword } from '../../services/authService';
import { APP_IMAGES } from '../../constants/images';
import Icon from '../../components/common/Icon';
import styles from './Auth.module.css';

const FEATURES = [
  { icon: 'monitoring', label: 'Monitor all incidents' },
  { icon: 'group', label: 'Manage users & responders' },
  { icon: 'notifications_active', label: 'Dispatch emergency units fast' },
  { icon: 'map', label: 'Live GPS tracking & routing' },
];

const linkBtn = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#c62828',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

function BackLink({ onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ ...linkBtn, color: '#555', marginTop: 14 }}>
      ← Back to login
    </button>
  );
}

const PW_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'Upper & lowercase letters', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A special character (!@#$…)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const passwordMeetsMinimum = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

function passwordStrength(p) {
  const passed = PW_RULES.filter((r) => r.test(p)).length;
  if (!passwordMeetsMinimum(p) || passed <= 2) return { level: 1, label: 'Weak', color: '#dc2626' };
  if (passed === 3) return { level: 2, label: 'Medium', color: '#f59e0b' };
  return { level: 3, label: 'Strong', color: '#16a34a' };
}

function StrengthMeter({ password }) {
  const s = passwordStrength(password);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 5, flex: 1 }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                flex: 1, height: 6, borderRadius: 4,
                background: n <= s.level ? s.color : '#e5e7eb',
                transition: 'background 0.25s',
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: s.color, minWidth: 52, textAlign: 'right' }}>
          {s.label}
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 4 }}>
        {PW_RULES.map((r) => {
          const ok = r.test(password);
          return (
            <li
              key={r.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
                color: ok ? '#16a34a' : '#6b7280',
              }}
            >
              <Icon name={ok ? 'check_circle' : 'radio_button_unchecked'} size={15} />
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const OTP_LENGTH = 6;

// Six single-digit boxes. Digits are masked as "*" unless `visible` is on.
function OtpBoxes({ value, onChange, visible, onToggleVisible, disabled }) {
  const refs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || '');

  const focusBox = (i) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))]?.focus();

  const setDigit = (i, d) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, OTP_LENGTH));
  };

  const handleInput = (i, e) => {
    const typed = e.target.value.replace(/\D/g, '');
    if (!typed) return;
    // Replace the box with the newest digit typed; spill extra digits (paste/autofill) forward.
    const chars = typed.length > 1 && !digits[i] ? typed : typed.slice(-1);
    const next = digits.slice();
    for (let k = 0; k < chars.length && i + k < OTP_LENGTH; k += 1) next[i + k] = chars[k];
    onChange(next.join(''));
    focusBox(i + chars.length);
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) setDigit(i, '');
      else if (i > 0) { setDigit(i - 1, ''); focusBox(i - 1); }
    } else if (e.key === 'ArrowLeft') focusBox(i - 1);
    else if (e.key === 'ArrowRight') focusBox(i + 1);
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focusBox(pasted.length);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flex: 1 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1}`}
            value={d ? (visible ? d : '*') : ''}
            disabled={disabled}
            onChange={(e) => handleInput(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            style={{
              width: '100%',
              minWidth: 0,
              height: 52,
              textAlign: 'center',
              fontSize: 22,
              fontWeight: 700,
              color: '#111827',
              background: d ? '#fff' : '#f3f4f6',
              border: `1.5px solid ${d ? '#e53935' : '#e5e7eb'}`,
              borderRadius: 12,
              outline: 'none',
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? 'Hide code' : 'Show code'}
        style={{ ...linkBtn, color: '#6b7280', display: 'flex', padding: 6 }}
      >
        <Icon name={visible ? 'visibility_off' : 'visibility'} size={20} />
      </button>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // 'login' | 'request' | 'otp' | 'reset'
  const [view, setView] = useState('login');
  const [resetUsername, setResetUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const goTo = (next) => { setView(next); setError(''); setNotice(''); };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!resetUsername.trim()) { setError('Please enter your username.'); return; }
    setIsLoading(true);
    try {
      const res = await requestPasswordReset(resetUsername.trim());
      setView('otp'); setOtp(''); setError(''); setNotice(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code.'); return; }
    setIsLoading(true);
    try {
      const res = await verifyResetOtp(resetUsername.trim(), otp);
      setResetToken(res.reset_token);
      setView('reset'); setError(''); setNotice('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!passwordMeetsMinimum(newPassword)) {
      setError('Password must be at least 8 characters with a letter and a number.');
      return;
    }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setIsLoading(true);
    try {
      const res = await resetPassword(resetToken, newPassword);
      setResetToken(''); setNewPassword(''); setConfirmPassword(''); setOtp('');
      setForm({ username: resetUsername.trim(), password: '' });
      setView('login'); setError(''); setNotice(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    setIsLoading(true);
    try {
      await login({ username: form.username.trim(), password: form.password });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`${styles.pageWrapper} ${styles.loginPage}`}>
      <svg className={styles.clipDefs} width="0" height="0" aria-hidden="true">
        <defs>
          <clipPath id="loginPanelClip" clipPathUnits="objectBoundingBox">
            <path d="M0,0 L0.94,0 C0.98,0.16 0.84,0.34 0.78,0.50 C0.72,0.66 0.88,0.84 0.98,1 L0,1 Z" />
          </clipPath>
        </defs>
      </svg>
      <div className={styles.ambulanceBg} aria-hidden="true" />
      {/* ── Left Panel ─────────────────────────────── */}
      <div className={styles.leftPanel}>
        <div className={styles.leftArt} aria-hidden="true" />
        <div className={styles.brandBox}>
          <div className={styles.brandLogoWrap}>
            <img
              src={APP_IMAGES.logo}
              alt="CDRRMO Cabadbaran City"
              className={styles.brandLogoImg}
            />
          </div>
          <h1 className={styles.brandName}>Rapid<span className={styles.brandAccent}>Rescue</span></h1>
          <p className={styles.brandTagline}>Admin Control Panel</p>
          <p className={styles.brandCity}><Icon name="location_on" size={14} /> Cabadbaran City, Agusan del Norte</p>

          <div className={styles.features}>
            {FEATURES.map((f) => (
              <div key={f.label} className={styles.feature}>
                <span className={styles.featureIcon}><Icon name={f.icon} size={18} /></span>
                <span className={styles.featureLabel}>{f.label}</span>
              </div>
            ))}
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <div className={styles.statVal}>24/7</div>
              <div className={styles.statKey}>Available</div>
            </div>
            <div className={styles.statItem}>
              <Icon name="apartment" size={15} />
              <div className={styles.statVal}>1</div>
              <div className={styles.statKey}>Station</div>
            </div>
            <div className={styles.statItem}>
              <Icon name="favorite" size={15} />
              <div className={styles.statVal}>Free</div>
              <div className={styles.statKey}>Service</div>
            </div>
          </div>

          <p className={styles.panelFooter}><Icon name="shield" size={13} /> Powered by Cabadbaran City DRRMO</p>
        </div>
      </div>
      <svg className={styles.curveLine} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="dividerGlow" x="-30%" y="-8%" width="160%" height="116%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>
        <path
          d="M94,0 C98,16 84,34 78,50 C72,66 88,84 98,100 L108,100 C98,84 82,66 88,50 C94,34 108,16 104,0 Z"
          fill="rgba(80,0,8,0.55)"
        />
        <path
          d="M94,0 C98,16 84,34 78,50 C72,66 88,84 98,100 L103,100 C93,84 77,66 83,50 C89,34 103,16 99,0 Z"
          fill="#850000"
        />
        <path
          d="M94,0 C98,16 84,34 78,50 C72,66 88,84 98,100 L100.4,100 C90.4,84 74.4,66 80.4,50 C86.4,34 100.4,16 96.4,0 Z"
          fill="#ff1717"
        />
        <path
          d="M94,0 C98,16 84,34 78,50 C72,66 88,84 98,100"
          fill="none"
          stroke="#ff4a4a"
          strokeWidth="5"
          vectorEffect="non-scaling-stroke"
          filter="url(#dividerGlow)"
        />
        <path
          d="M94,0 C98,16 84,34 78,50 C72,66 88,84 98,100"
          fill="none"
          stroke="#fff6f6"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* ── Right Panel ────────────────────────────── */}
      <div className={`${styles.rightPanel} ${styles.rightPanelHero}`}>

        <div className={styles.formCard}>
          <div className={styles.formLogoWrap}>
            <img
              src={APP_IMAGES.logo}
              alt="CDRRMO Cabadbaran City"
              className={styles.formLogoImg}
            />
          </div>

          <div className={styles.adminBadge}><Icon name="lock" size={16} /> Admin Access</div>
          <h2 className={styles.formTitle}>{view === 'login' ? 'Welcome Back' : 'Reset Password'}</h2>
          <p className={styles.formSubtitle}>
            {view === 'login' && 'Sign in to the admin control panel'}
            {view === 'request' && 'Enter your username to receive a verification code by email'}
            {view === 'otp' && 'Enter the 6-digit code sent to your email'}
            {view === 'reset' && 'Choose a new password'}
          </p>

          {notice && (
            <div className={styles.errorAlert} style={{ background: '#e8f5e9', color: '#2e7d32', borderColor: '#c8e6c9' }}>
              <Icon name="check_circle" size={16} /> {notice}
            </div>
          )}

          {error && (
            <div className={styles.errorAlert}>
              <Icon name="warning" size={16} /> {error}
            </div>
          )}

          {view === 'login' && (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Username</label>
              <div className={styles.inputWrapper}>
                <span className={styles.inputIcon}><Icon name="person" size={18} /></span>
                <input
                  type="text"
                  name="username"
                  className={styles.inputWithIcon}
                  placeholder="Enter your username"
                  value={form.username}
                  onChange={handleChange}
                  autoComplete="username"
                  autoCapitalize="none"
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Password</label>
              <div className={styles.passwordWrapper}>
                <span className={styles.inputIcon}><Icon name="lock" size={18} /></span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  className={styles.inputWithIcon}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={18} />
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'right', margin: '-4px 0 14px' }}>
              <button
                type="button"
                onClick={() => { setResetUsername(form.username); goTo('request'); }}
                style={linkBtn}
              >
                Forgot Password?
              </button>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {isLoading ? (
                <><span className={styles.spinner} /> Logging in...</>
              ) : (
                <><Icon name="login" size={18} /> Login</>
              )}
            </button>
          </form>
          )}

          {view === 'request' && (
            <form onSubmit={handleRequestOtp} className={styles.form}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Username</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}><Icon name="person" size={18} /></span>
                  <input
                    type="text"
                    className={styles.inputWithIcon}
                    placeholder="Enter your username"
                    value={resetUsername}
                    onChange={(e) => { setResetUsername(e.target.value); setError(''); }}
                    autoCapitalize="none"
                  />
                </div>
              </div>
              <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                {isLoading ? <><span className={styles.spinner} /> Sending...</> : <><Icon name="mail" size={18} /> Send Code</>}
              </button>
              <BackLink onClick={() => goTo('login')} />
            </form>
          )}

          {view === 'otp' && (
            <form onSubmit={handleVerifyOtp} className={styles.form}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Verification Code</label>
                <OtpBoxes
                  value={otp}
                  onChange={(v) => { setOtp(v); setError(''); }}
                  visible={showOtp}
                  onToggleVisible={() => setShowOtp((v) => !v)}
                  disabled={isLoading}
                />
              </div>
              <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                {isLoading ? <><span className={styles.spinner} /> Verifying...</> : 'Verify Code'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <BackLink onClick={() => goTo('login')} />
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleRequestOtp}
                  style={{ ...linkBtn, marginTop: 14 }}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {view === 'reset' && (
            <form onSubmit={handleResetPassword} className={styles.form}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>New Password</label>
                <div className={styles.passwordWrapper}>
                  <span className={styles.inputIcon}><Icon name="lock" size={18} /></span>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    className={styles.inputWithIcon}
                    placeholder="Create a strong password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowNewPw((v) => !v)}
                    aria-label={showNewPw ? 'Hide password' : 'Show password'}
                  >
                    <Icon name={showNewPw ? 'visibility_off' : 'visibility'} size={18} />
                  </button>
                </div>
                {newPassword && <StrengthMeter password={newPassword} />}
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Confirm Password</label>
                <div className={styles.passwordWrapper}>
                  <span className={styles.inputIcon}><Icon name="lock" size={18} /></span>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    className={styles.inputWithIcon}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                    autoComplete="new-password"
                  />
                </div>
                {confirmPassword && (
                  <div style={{
                    marginTop: 6, fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                    color: confirmPassword === newPassword ? '#16a34a' : '#dc2626',
                  }}>
                    <Icon name={confirmPassword === newPassword ? 'check_circle' : 'cancel'} size={15} />
                    {confirmPassword === newPassword ? 'Passwords match' : 'Passwords do not match yet'}
                  </div>
                )}
              </div>
              <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                {isLoading ? <><span className={styles.spinner} /> Saving...</> : 'Update Password'}
              </button>
              <BackLink onClick={() => goTo('login')} />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
