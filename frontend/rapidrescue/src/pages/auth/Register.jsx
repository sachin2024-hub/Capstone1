import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../../services/authService';
import { APP_IMAGES } from '../../constants/images';
import Icon from '../../components/common/Icon';
import styles from './Auth.module.css';

const ROLES = ['Admin', 'User'];

const ROLE_ICONS = {
  Admin: 'admin_panel_settings',
  User: 'person',
};

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    username: '',
    password: '',
    confirm_password: '',
    role: 'Admin',
    contact_number: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.username || !form.password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match. Please check again.');
      return;
    }

    setIsLoading(true);
    try {
      await register({
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || undefined,
        last_name: form.last_name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        contact_number: form.contact_number.trim() || undefined,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed. Try again.');
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
            <img src={APP_IMAGES.logo} alt="RapidRescue" className={styles.brandLogoImg} />
          </div>
          <h1 className={styles.brandName}>RapidRescue</h1>
          <p className={styles.brandTagline}>Admin Control Panel</p>
          <p className={styles.brandCity}><Icon name="location_on" size={14} /> Cabadbaran City, Agusan del Norte</p>

          <div className={styles.brandDivider} />

          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}><Icon name="lock" size={18} /></span>
              <span>Secure role-based admin access</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}><Icon name="admin_panel_settings" size={18} /></span>
              <span>Multiple role levels supported</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}><Icon name="smartphone" size={18} /></span>
              <span>Oversee all mobile users</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}><Icon name="cell_tower" size={18} /></span>
              <span>Real-time dispatch control</span>
            </div>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <div className={styles.statVal}>24/7</div>
              <div className={styles.statKey}>Available</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statVal}>1</div>
              <div className={styles.statKey}>Station</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statVal}>Free</div>
              <div className={styles.statKey}>Service</div>
            </div>
          </div>

          <div className={styles.imageShowcase}>
            {APP_IMAGES.showcase.map((src) => (
              <div key={src} className={styles.showcaseItem}>
                <img src={src} alt="" className={styles.showcaseImg} />
              </div>
            ))}
          </div>

          <p className={styles.panelFooter}><Icon name="local_hospital" size={16} /> Powered by Cabadbaran City DRRMO</p>
        </div>
      </div>

      {/* ── Right Panel ────────────────────────────── */}
      <div className={styles.rightPanel}>
        <div className={styles.formCard}>
          <div className={styles.adminBadge}><Icon name="lock" size={16} /> Admin Registration</div>
          <h2 className={styles.formTitle}>Create Admin Account</h2>
          <p className={styles.formSubtitle}>Fill in your details to get access</p>

          {error && (
            <div className={styles.errorAlert}>
              <Icon name="warning" size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.row}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>First Name <span className={styles.required}>*</span></label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}><Icon name="person" size={18} /></span>
                  <input type="text" name="first_name" className={styles.inputWithIcon}
                    placeholder="First name" value={form.first_name} onChange={handleChange} />
                </div>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Last Name <span className={styles.required}>*</span></label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}><Icon name="person" size={18} /></span>
                  <input type="text" name="last_name" className={styles.inputWithIcon}
                    placeholder="Last name" value={form.last_name} onChange={handleChange} />
                </div>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Middle Name</label>
              <div className={styles.inputWrapper}>
                <span className={styles.inputIcon}><Icon name="edit" size={18} /></span>
                <input type="text" name="middle_name" className={styles.inputWithIcon}
                  placeholder="Middle name (optional)" value={form.middle_name} onChange={handleChange} />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Username <span className={styles.required}>*</span></label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}><Icon name="badge" size={18} /></span>
                  <input type="text" name="username" className={styles.inputWithIcon}
                    placeholder="Choose a username" value={form.username} onChange={handleChange}
                    autoCapitalize="none" autoComplete="username" />
                </div>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Contact Number</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}><Icon name="call" size={18} /></span>
                  <input type="tel" name="contact_number" className={styles.inputWithIcon}
                    placeholder="09XXXXXXXXX" value={form.contact_number} onChange={handleChange} />
                </div>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Role</label>
              <div className={styles.inputWrapper}>
                <span className={styles.inputIcon}><Icon name={ROLE_ICONS[form.role] || 'admin_panel_settings'} size={18} /></span>
                <select name="role" className={styles.inputWithIcon} value={form.role} onChange={handleChange}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Password <span className={styles.required}>*</span></label>
                <div className={styles.passwordWrapper}>
                  <span className={styles.inputIcon}><Icon name="lock" size={18} /></span>
                  <input type={showPassword ? 'text' : 'password'} name="password" className={styles.inputWithIcon}
                    placeholder="Min 6 characters" value={form.password} onChange={handleChange} autoComplete="new-password" />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword(!showPassword)}>
                    <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={18} />
                  </button>
                </div>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Confirm Password <span className={styles.required}>*</span></label>
                <div className={styles.passwordWrapper}>
                  <span className={styles.inputIcon}><Icon name="lock" size={18} /></span>
                  <input type={showConfirm ? 'text' : 'password'} name="confirm_password" className={styles.inputWithIcon}
                    placeholder="Re-enter password" value={form.confirm_password} onChange={handleChange} autoComplete="new-password" />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowConfirm(!showConfirm)}>
                    <Icon name={showConfirm ? 'visibility_off' : 'visibility'} size={18} />
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {isLoading ? (
                <><span className={styles.spinner} /> Creating Account...</>
              ) : (
                <><Icon name="person_add" size={18} /> Create Admin Account</>
              )}
            </button>
          </form>

          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>or</span>
            <div className={styles.dividerLine} />
          </div>

          <p className={styles.switchText}>
            Already have an account?{' '}
            <Link to="/login" className={styles.switchLink}>Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
