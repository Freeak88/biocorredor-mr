/**
 * GeoHash utility for compact geographic indexing.
 *
 * Implements a pure geohash encoder/decoder and bounding-box query generator.
 * No external dependencies — fully self-contained.
 *
 * Based on the standard geohash algorithm (base32 encoding of interleaved lat/lng bits).
 */

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

const BITS = [16, 8, 4, 2, 1];

interface LatLng {
  lat: number;
  lng: number;
}

interface Bounds {
  northEast: LatLng;
  southWest: LatLng;
}

/**
 * Encode latitude/longitude to a geohash string.
 * @param lat Latitude (-90 to 90)
 * @param lng Longitude (-180 to 180)
 * @param precision Length of geohash (default 9). Higher = more precise.
 * @returns Geohash string
 */
export function encodeGeohash(lat: number, lng: number, precision: number = 9): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latRange = { min: -90.0, max: 90.0 };
  let lngRange = { min: -180.0, max: 180.0 };

  while (geohash.length < precision) {
    if (evenBit) {
      // Longitude
      const mid = (lngRange.min + lngRange.max) / 2;
      if (lng >= mid) {
        idx |= BITS[bit];
        lngRange.min = mid;
      } else {
        lngRange.max = mid;
      }
    } else {
      // Latitude
      const mid = (latRange.min + latRange.max) / 2;
      if (lat >= mid) {
        idx |= BITS[bit];
        latRange.min = mid;
      } else {
        latRange.max = mid;
      }
    }

    evenBit = !evenBit;

    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/**
 * Decode a geohash string back to approximate lat/lng (center of the cell).
 * @param geohash Geohash string
 * @returns Center lat/lng of the geohash cell
 */
export function decodeGeohash(geohash: string): LatLng {
  let evenBit = true;
  let latRange = { min: -90.0, max: 90.0 };
  let lngRange = { min: -180.0, max: 180.0 };

  for (let i = 0; i < geohash.length; i++) {
    const cd = BASE32.indexOf(geohash[i]);
    if (cd === -1) throw new Error(`Invalid geohash character: ${geohash[i]}`);

    for (let j = 0; j < 5; j++) {
      const bit = BITS[j];
      if (evenBit) {
        // Longitude
        const mid = (lngRange.min + lngRange.max) / 2;
        if (cd & bit) {
          lngRange.min = mid;
        } else {
          lngRange.max = mid;
        }
      } else {
        // Latitude
        const mid = (latRange.min + latRange.max) / 2;
        if (cd & bit) {
          latRange.min = mid;
        } else {
          latRange.max = mid;
        }
      }
      evenBit = !evenBit;
    }
  }

  return {
    lat: (latRange.min + latRange.max) / 2,
    lng: (lngRange.min + lngRange.max) / 2,
  };
}

/**
 * Calculate geohash precision (character length) needed for a given radius in km.
 * @param radiusKm Search radius in kilometers
 * @returns Recommended geohash precision
 */
export function geohashPrecisionForRadius(radiusKm: number): number {
  if (radiusKm <= 0.019) return 9;
  if (radiusKm <= 0.076) return 8;
  if (radiusKm <= 0.61) return 7;
  if (radiusKm <= 2.4) return 6;
  if (radiusKm <= 20) return 5;
  if (radiusKm <= 78) return 4;
  if (radiusKm <= 630) return 3;
  if (radiusKm <= 2500) return 2;
  return 1;
}

/**
 * Generate geohash bounding box prefixes for a given viewport.
 *
 * This helper generates coarse geohash ranges that cover the viewport. The
 * active PocketBase map flow queries lat/lng bounds directly, while these
 * ranges remain available for future server-side geohash optimizations.
 * 1. Compute the geohash precision based on the viewport size
 * 2. Generate the set of geohash prefixes that cover the viewport
 * 3. Query each prefix with startAt/endAt on the geohash field
 *
 * @param bounds Viewport bounds { northEast, southWest }
 * @returns Array of { start: string, end: string } ranges for geohash queries
 */
export function getGeohashRanges(bounds: Bounds): Array<{ start: string; end: string }> {
  const { northEast, southWest } = bounds;

  // Calculate approximate viewport size to determine geohash precision
  const latDiff = northEast.lat - southWest.lat;
  const lngDiff = northEast.lng - southWest.lng;
  const maxDiff = Math.max(latDiff, lngDiff);

  // Convert degrees to km (rough approximation at equator)
  const kmApprox = maxDiff * 111;
  const precision = geohashPrecisionForRadius(kmApprox);

  // Encode the corners
  const neHash = encodeGeohash(northEast.lat, northEast.lng, precision);
  const swHash = encodeGeohash(southWest.lat, southWest.lng, precision);

  // Generate all prefixes between sw and ne
  // For small viewports, this is usually 1-4 ranges
  const ranges: Array<{ start: string; end: string }> = [];

  // Simple approach: if the hashes share a common prefix, use that
  // Otherwise, we need to generate multiple ranges
  const commonPrefix = getCommonPrefix(neHash, swHash);

  if (commonPrefix.length >= precision - 1) {
    // Viewport is small enough to be covered by a single prefix range
    ranges.push({
      start: swHash,
      end: neHash + "~", // ~ is after 'z' in ASCII, ensures we get all hashes starting with neHash
    });
  } else {
    // Viewport spans multiple geohash cells — generate ranges for each cell
    const cells = getGeohashCellsForViewport(bounds, precision);
    for (const cell of cells) {
      ranges.push({
        start: cell,
        end: cell + "~",
      });
    }
  }

  return ranges;
}

/**
 * Get all geohash cell prefixes that cover a viewport.
 * This subdivides the viewport into geohash-sized cells and returns their prefixes.
 */
function getGeohashCellsForViewport(bounds: Bounds, precision: number): string[] {
  const { northEast, southWest } = bounds;
  const cells = new Set<string>();

  // Step size in degrees for this precision (rough approximation)
  const latStep = 180 / Math.pow(2, Math.floor(precision * 2.5));
  const lngStep = 360 / Math.pow(2, Math.floor(precision * 2.5));

  for (let lat = southWest.lat; lat <= northEast.lat; lat += latStep) {
    for (let lng = southWest.lng; lng <= northEast.lng; lng += lngStep) {
      cells.add(encodeGeohash(lat, lng, precision));
    }
  }

  return Array.from(cells);
}

function getCommonPrefix(a: string, b: string): string {
  let prefix = "";
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) {
      prefix += a[i];
    } else {
      break;
    }
  }
  return prefix;
}

/**
 * Haversine distance between two points in kilometers.
 * @param lat1 Latitude of point 1
 * @param lng1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lng2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Check if a point is within viewport bounds.
 * Used for client-side filtering after a coarse geographic query.
 */
export function isPointInBounds(
  lat: number,
  lng: number,
  bounds: Bounds
): boolean {
  return (
    lat >= bounds.southWest.lat &&
    lat <= bounds.northEast.lat &&
    lng >= bounds.southWest.lng &&
    lng <= bounds.northEast.lng
  );
}

/**
 * Calculate viewport area change percentage between two bounds.
 * Returns 0-1 where 1 = 100% change.
 */
export function viewportChangePercent(
  oldBounds: Bounds,
  newBounds: Bounds
): number {
  const oldArea =
    (oldBounds.northEast.lat - oldBounds.southWest.lat) *
    (oldBounds.northEast.lng - oldBounds.southWest.lng);
  const newArea =
    (newBounds.northEast.lat - newBounds.southWest.lat) *
    (newBounds.northEast.lng - newBounds.southWest.lng);

  if (oldArea === 0) return 1;
  return Math.min(1, Math.abs(newArea - oldArea) / Math.abs(oldArea));
}
