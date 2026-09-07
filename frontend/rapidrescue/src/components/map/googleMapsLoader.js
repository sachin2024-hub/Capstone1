let loadingPromise = null;

export function getGoogleMapsApiKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

export function loadGoogleMaps() {
  const key = getGoogleMapsApiKey();
  if (!key) {
    return Promise.reject(new Error('MISSING_KEY'));
  }

  if (window.google?.maps?.StreetViewService) {
    return Promise.resolve(window.google);
  }

  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const callbackName = '__rrInitGoogleMaps';
    const previousAuth = window.gm_authFailure;

    window.gm_authFailure = () => {
      loadingPromise = null;
      if (typeof previousAuth === 'function') previousAuth();
      reject(new Error('INVALID_KEY'));
    };

    window[callbackName] = () => {
      delete window[callbackName];
      if (window.google?.maps?.StreetViewService) resolve(window.google);
      else {
        loadingPromise = null;
        reject(new Error('LOAD_FAILED'));
      }
    };

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${callbackName}&v=weekly`;
    script.onerror = () => {
      loadingPromise = null;
      delete window[callbackName];
      reject(new Error('LOAD_FAILED'));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}

export function findNearbyStreetView(google, lat, lng) {
  const service = new google.maps.StreetViewService();
  const location = { lat: Number(lat), lng: Number(lng) };
  const radii = [150, 350, 600];

  const lookup = (radius) =>
    new Promise((resolve) => {
      service.getPanorama(
        {
          location,
          radius,
          ...(google.maps.StreetViewSource
            ? { source: google.maps.StreetViewSource.OUTDOOR }
            : {}),
        },
        (data, status) => {
          if (status === google.maps.StreetViewStatus.OK && data?.location) {
            resolve(data);
          } else {
            resolve(null);
          }
        }
      );
    });

  return radii.reduce(
    (chain, radius) => chain.then((found) => found || lookup(radius)),
    Promise.resolve(null)
  );
}
