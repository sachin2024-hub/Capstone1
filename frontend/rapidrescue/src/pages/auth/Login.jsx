import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../services/authService';
import { APP_IMAGES } from '../../constants/images';
import styles from './Auth.module.css';

const FEATURES = [
  { icon: '📊', label: 'Monitor all incidents' },
  { icon: '👥', label: 'Manage users & responders' },
  { icon: '🚒', label: 'Dispatch emergency units fast' },
  { icon: '🗺️', label: 'Live GPS tracking & routing' },
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
    <div className={styles.pageWrapper}>
      {/* ── Left Panel ─────────────────────────────── */}
      <div className={styles.leftPanel}>
        <div className={styles.brandBox}>
          <div className={styles.brandLogoWrap}>
            <img
              src={APP_IMAGES.logo}
              alt="CDRRMO Cabadbaran City"
              className={styles.brandLogoImg}
            />
          </div>
          <h1 className={styles.brandName}>RapidRescue</h1>
          <p className={styles.brandTagline}>Admin Control Panel</p>
          <p className={styles.brandCity}>📍 Cabadbaran City, Agusan del Norte</p>

          <div className={styles.brandDivider} />

          <div className={styles.features}>
            {FEATURES.map((f) => (
              <div key={f.label} className={styles.feature}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <div className={styles.statVal}>24/7</div>
              <div className={styles.statKey}>Available</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statVal}>4</div>
              <div className={styles.statKey}>Stations</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statVal}>Free</div>
              <div className={styles.statKey}>Service</div>
            </div>
          </div>

          <p className={styles.panelFooter}>🏥 Powered by Cabadbaran City DRRMO</p>
        </div>
      </div>

      {/* ── Right Panel ────────────────────────────── */}
      <div className={`${styles.rightPanel} ${styles.rightPanelHero}`}>
        {/* Animated photo slideshow behind the form */}
        <div className={styles.slideshow} aria-hidden="true">
          {APP_IMAGES.showcase.map((src, i) => (
            <div
              key={src}
              className={styles.slide}
              style={{ animationDelay: `${i * 6}s`, backgroundImage: `url(${src})` }}
            />
          ))}
          <div className={styles.slideOverlay} />
        </div>

        <div className={styles.formCard}>
          <div className={styles.formLogoWrap}>
            <img
              src={APP_IMAGES.logo}
              alt="CDRRMO Cabadbaran City"
              className={styles.formLogoImg}
            />
          </div>

          <div className={styles.adminBadge}>🔐 Admin Access</div>
          <h2 className={styles.formTitle}>Welcome Back</h2>
          <p className={styles.formSubtitle}>Sign in to the admin control panel</p>

          {error && (
            <div className={styles.errorAlert}>
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Username</label>
              <div className={styles.inputWrapper}>
                <span className={styles.inputIcon}>👤</span>
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
                <span className={styles.inputIcon}>🔒</span>
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
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {isLoading ? (
                <><span className={styles.spinner} /> Signing In...</>
              ) : (
                <>🚑 Sign In</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
