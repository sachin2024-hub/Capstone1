export function resolveMediaUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const origin = window.location.origin.replace(/:\d+$/, ':5000');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function userProfilePhotoUrl(user) {
  if (!user) return '';
  return resolveMediaUrl(
    user.profile_picture_url || user.profile_picture || user.avatar_url || user.photo_url || ''
  );
}
