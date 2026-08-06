import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

type ParcelProperties = {
  nomenclatura?: string;
  partida?: string;
  superficie_m2?: number | string;
  tipo?: string;
  fuente?: string;
};

type ParcelFeature = Feature<Polygon | MultiPolygon, ParcelProperties>;
type ParcelCollection = { type: 'FeatureCollection'; features: ParcelFeature[] };

export type TerritorialMatch = {
  status: 'matched' | 'indeterminate';
  parcel_code?: string;
  partida?: string;
  surface_m2?: number | string;
  cadastral_type?: string;
  source: 'GeoARBA' | 'local';
  sector?: ParcelSector;
  checked_at: string;
  reason?: string;
};

type ParcelSector = 'noroeste' | 'noreste' | 'suroeste' | 'sureste';

const parcelCache = new Map<ParcelSector, ParcelCollection>();

function sectorFor(lat: number, lng: number): ParcelSector {
  const west = lng < -58.37;
  const north = lat >= -34.88;
  if (north) return west ? 'noroeste' : 'noreste';
  return west ? 'suroeste' : 'sureste';
}

async function loadSector(sector: ParcelSector): Promise<ParcelCollection> {
  const cached = parcelCache.get(sector);
  if (cached) return cached;
  const response = await fetch(`/data/geoarba/ministro-rivadavia-parcels-${sector}.geojson`);
  if (!response.ok) throw new Error(`No se pudo cargar el sector territorial (${response.status}).`);
  const collection = await response.json() as ParcelCollection;
  parcelCache.set(sector, collection);
  return collection;
}

export async function matchParcel(lat: number, lng: number): Promise<TerritorialMatch> {
  const checkedAt = new Date().toISOString();
  const sector = sectorFor(lat, lng);
  try {
    const collection = await loadSector(sector);
    const location = point([lng, lat]);
    const match = collection.features.find((feature) => booleanPointInPolygon(location, feature));
    if (!match) {
      return { status: 'indeterminate', source: 'local', sector, checked_at: checkedAt, reason: 'El punto no coincide con una parcela del sector descargado.' };
    }
    return {
      status: 'matched',
      parcel_code: match.properties?.nomenclatura,
      partida: match.properties?.partida,
      surface_m2: match.properties?.superficie_m2,
      cadastral_type: match.properties?.tipo,
      source: 'GeoARBA',
      sector,
      checked_at: checkedAt,
    };
  } catch (error) {
    return {
      status: 'indeterminate',
      source: 'local',
      sector,
      checked_at: checkedAt,
      reason: error instanceof Error ? error.message : 'No se pudo consultar el parcelario local.',
    };
  }
}
