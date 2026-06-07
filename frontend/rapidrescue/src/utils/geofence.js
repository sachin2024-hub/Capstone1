import { CABADBARAN } from '../constants/cabadbaran';

export function isWithinCabadbaran(lat, lng) {
  const { south, north, west, east } = CABADBARAN.bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

export const OUTSIDE_CITY_MESSAGE =
  'Naka-lapas na sa Cabadbaran City. Ang RapidRescue available lang sulod sa city.';
