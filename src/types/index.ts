// ── PocketBase base record fields ──
export interface PBRecord {
  id: string;
  created: string;
  updated: string;
}

// ── Auth user (returned by useAuth, mirrors Firebase User interface shape) ──
export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  isAnonymous: false;
}

// ── User profile (matches PocketBase 'users' auth collection) ──
export interface UserProfile extends PBRecord {
  email: string;
  name: string;
  displayName: string;     // alias for UI compatibility
  avatar?: string;
  photoURL?: string;       // resolved avatar URL for UI compatibility
  points: number;
  merits: string[];
  last_lat: number;
  last_lng: number;
  last_seen: string;
  location?: { lat: number; lng: number };  // computed from last_lat/last_lng
  role: 'user' | 'expert' | 'admin';
}

// Expanded user shape as returned by PocketBase relation expand
// Can be the full object or just the id string depending on context
export type UserRef = string | UserProfile;

// ── Sighting ──
export interface Sighting extends PBRecord {
  user: UserRef;              // relation → users (string id unless expanded)
  mushroom_name: string;
  mushroomName?: string;      // alias for UI compatibility
  description: string;
  toxicity?: 'Comestible' | 'Tóxico' | 'Mortal' | 'Desconocido';
  lat: number;
  lng: number;
  geohash?: string;
  images?: string[];          // PocketBase file field — array of filenames
  status: 'identified' | 'unconfirmed' | 'expert_verified' | 'draft' | 'gbif_import';
  habitat?: string;
  features?: string;
  network_id?: string;
  networkId?: string;         // alias
  geofirmed_by?: string;      // relation → users (id)
  geofirmed_at?: string;
  lastGeofirmedAt?: string;   // alias
  ai_analysis?: Record<string, any>;

  // Convenience aliases populated after fetch/expand
  userName?: string;          // expanded user.name
  userPhoto?: string;         // expanded user.avatar → getFileURL
  userId?: string;            // user id when not expanded
  imageUrl?: string;          // first image URL
  createdAt?: string;         // alias for created (UI compat)

  // GBIF DwC taxonomy
  kingdom?: string;
  phylum?: string;
  taxon_class?: string;
  taxon_order?: string;
  family?: string;
  genus?: string;
  species?: string;
  taxon_rank?: string;

  // GBIF DwC geography
  country?: string;
  state_province?: string;
  locality?: string;

  // GBIF DwC event
  event_date?: string;

  // GBIF DwC record metadata
  basis_of_record?: string;
  occurrence_status?: string;
  dataset_name?: string;
  recorded_by?: string;
  identified_by?: string;
  catalog_number?: string;
  collection_code?: string;
  institution_code?: string;
  individual_count?: number;
  gbif_id?: string;
  publisher?: string;

  // GBIF integration (computed)
  isGbif: boolean;            // computed: status === 'gbif_import'
  gbifUrl?: string;           // link to original GBIF record
  gbif_image_url?: string;    // external image URL from GBIF/MO media
  // Mushroom Observer integration
  moUrl?: string;             // link to original MO observation
  sourceName?: string;        // 'Mushroom Observer' or 'GBIF'

  // Weather & environment context
  weather_context?: Record<string, any>;
  elevation?: number;
  photoperiod?: Record<string, any>;
}

// ── Chat Message ──
export interface ChatMessage extends PBRecord {
  user: UserRef;
  userId?: string;           // alias
  text: string;
  lat: number;
  lng: number;
  createdAt?: string;         // alias for created

  // UI convenience (populated after expand)
  userName?: string;
  userPhoto?: string;
}

// ── Comment ──
export interface Comment extends PBRecord {
  sighting: string;   // relation → sightings
  user: UserRef;
  text: string;

  userName?: string;
  userPhoto?: string;
}

// ── Action Log ──
export interface ActionLog extends PBRecord {
  user: UserRef;
  userId?: string;
  action: string;
  details: string;
  createdAt?: string;   // alias for created

  userName?: string;
}

// ── Report ──
export interface Report extends PBRecord {
  reporter: UserRef;
  type: 'message' | 'user' | 'sighting' | 'comment';
  target_id: string;
  reason: string;
  content?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt?: string;     // alias for created

  reporterName?: string;
}
