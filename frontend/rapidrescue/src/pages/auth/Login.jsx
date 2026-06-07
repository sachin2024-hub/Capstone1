import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../../services/authService';
import styles from './Auth.module.css';

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
          <div className={styles.brandLogo}>✚</div>
          <h1 className={styles.brandName}>RapidRescue</h1>
          <p className={styles.brandTagline}>Admin Control Panel</p>
          <p className={styles.brandCity}>📍 Cabadbaran City, Agusan del Norte</p>

          <div className={styles.brandDivider} />

          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>📊</span>
              <span>Monitor all incidents in real-time</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>👥</span>
              <span>Manage users &amp; responders</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>🚒</span>
              <span>Dispatch emergency units fast</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>🗺️</span>
              <span>Live GPS tracking &amp; routing</span>
            </div>
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
      <div className={styles.rightPanel}>
        <div className={styles.formCard}>
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

          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>or</span>
            <div className={styles.dividerLine} />
          </div>

          <p className={styles.switchText}>
            No admin account?{' '}
            <Link to="/register" className={styles.switchLink}>
              Register Now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
