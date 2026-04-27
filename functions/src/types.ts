// =============================================================================
// Fungimap — Shared Types for Cloud Functions
// =============================================================================

/** Schema retornado por Gemini Vision API */
export interface MushroomIdentification {
  scientificName: string;
  commonName: string;
  toxicity: 'Comestible' | 'Tóxico' | 'Mortal' | 'Desconocido';
  description: string;
  habitat: string;
  features: string;
}

/** Payload del cliente para identifyMushroom */
export interface IdentifyMushroomInput {
  base64Image: string;
  mimeType?: string;
}

/** Payload del cliente para createSighting */
export interface CreateSightingInput {
  mushroomName: string;
  description: string;
  toxicity: string;
  habitat?: string;
  features?: string;
  lat: number;
  lng: number;
  status: 'identified' | 'unconfirmed' | 'draft';
  /** base64 encoded images (first is primary) */
  images: string[];
  /** MIME types matching images array */
  mimeTypes?: string[];
  /** AI identification result to attach */
  aiIdentification?: MushroomIdentification;
}

/** Sighting document in Firestore */
export interface Sighting {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  mushroomName: string;
  description: string;
  toxicity?: string;
  lat: number;
  lng: number;
  imageUrl?: string;
  thumbnailUrl?: string;
  images?: SightingImage[];
  networkId?: string;
  status: 'identified' | 'unconfirmed' | 'expert_verified' | 'draft';
  habitat?: string;
  features?: string;
  createdAt: any;
  updatedAt?: any;
  lastGeofirmedAt?: any;
  geofirmedBy?: string;
}

export interface SightingImage {
  url: string;
  thumbnailUrl?: string;
  createdAt: any;
  isPrimary?: boolean;
  aiScore?: number;
}

/** Payload del cliente para geofirmSighting */
export interface GeofirmSightingInput {
  sightingId: string;
  userLat: number;
  userLng: number;
}

/** Payload del cliente para submitReport */
export interface SubmitReportInput {
  type: 'message' | 'user' | 'sighting' | 'comment';
  targetId: string;
  reason: string;
  content?: string;
}

/** Report document in Firestore */
export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  type: 'message' | 'user' | 'sighting' | 'comment';
  targetId: string;
  reason: string;
  content?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: any;
}

/** User profile in Firestore */
export interface UserProfile {
  id: string;
  displayName: string;
  photoURL?: string;
  points: number;
  merits: string[];
  lastSeen: any;
  location: { lat: number; lng: number };
  email: string;
}

/** Action log in Firestore */
export interface ActionLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  createdAt: any;
}

/** Payload para exportGeoJSON */
export interface ExportGeoJSONInput {
  /** Optional filter by status */
  status?: Sighting['status'];
  /** Optional bounding box [south, west, north, east] */
  bounds?: [number, number, number, number];
  /** Optional species name filter (case-insensitive contains) */
  speciesFilter?: string;
  /** Date range start (ISO string) */
  dateFrom?: string;
  /** Date range end (ISO string) */
  dateTo?: string;
}
