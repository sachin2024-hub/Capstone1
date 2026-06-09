import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function MapResizeFix() {
  const map = useMap();

  useEffect(() => {
    const fix = () => {
      map.invalidateSize({ animate: false, pan: false });
    };

    fix();
    const t1 = setTimeout(fix, 100);
    const t2 = setTimeout(fix, 500);

    const container = map.getContainer();
    const parent = container?.parentElement;
    let observer;
    if (parent && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(fix);
      observer.observe(parent);
    }

    window.addEventListener('resize', fix);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      observer?.disconnect();
      window.removeEventListener('resize', fix);
    };
  }, [map]);

  return null;
}
