/**
 * Password strength for the Change Password form. Keep the rule in sync with
 * `isStrongPassword` in backend/routes/adminAuth.js.
 *
 * Strong = every requirement met. Medium = 8+ characters and at least 3 requirements met. Weak = anything else.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) },
  { id: 'symbol', label: 'A symbol (e.g. ! @ # $)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function checkPassword(password = '') {
  const results = PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(password) }));
  const metCount = results.filter((r) => r.met).length;
  let level = 'weak';
  if (metCount === PASSWORD_RULES.length) level = 'strong';
  else if (password.length >= 8 && metCount >= 3) level = 'medium';
  return { results, level, label: level.charAt(0).toUpperCase() + level.slice(1) };
}
