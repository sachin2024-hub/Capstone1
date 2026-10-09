import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../services/authService';
import { APP_IMAGES } from '../../constants/images';
import Icon from '../../components/common/Icon';
import styles from './Auth.module.css';

const FEATURES = [
  { icon: 'monitoring', label: 'Monitor all incidents' },
  { icon: 'group', label: 'Manage users & responders' },
  { icon: 'notifications_active', label: 'Dispatch emergency units fast' },
  { icon: 'map', label: 'Live GPS tracking & routing' },
];

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
          <h2 className={styles.formTitle}>Welcome Back</h2>
          <p className={styles.formSubtitle}>Sign in to the admin control panel</p>

          {error && (
            <div className={styles.errorAlert}>
              <Icon name="warning" size={16} /> {error}
            </div>
          )}

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

            <button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {isLoading ? (
                <><span className={styles.spinner} /> Logging in...</>
              ) : (
                <><Icon name="login" size={18} /> Login</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
