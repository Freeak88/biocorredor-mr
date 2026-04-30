# FungiMap — System Blueprint

## Overview
FungiMap es una aplicación PWA para registro y mapeo de hongos con:
- Frontend: React + TypeScript + Vite + TailwindCSS + Leaflet
- Backend: PocketBase (Go-based, single binary)
- AI: Gemini Vision API para identificación de hongos
- Datos externos: GBIF, ITIS, IUCN, WeatherAPI

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (PWA)                                              │
│  ├── React SPA (Vite build → Nginx)                        │
│  ├── Leaflet map with custom markers                       │
│  ├── Service Worker (sw.js) for offline support            │
│  └── PocketBase JS SDK (auth, CRUD, realtime)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Traefik (Reverse Proxy)                                    │
│  ├── fungimap.lab.embudo.com.ar → web container            │
│  ├── /api/* → pb container (PocketBase API)                │
│  └── /_/* → pb container (PocketBase Admin UI)              │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐   ┌─────────────────────────────┐
│  fungimap-web (Docker)  │   │  fungimap-pb (Docker)       │
│  ├── Nginx:80           │   │  ├── PocketBase:8090        │
│  └── /usr/share/nginx/  │   │  ├── pb_data (SQLite DB)    │
│      └── html/ (SPA)    │   │  ├── pb_hooks (JS hooks)    │
│                         │   │  └── pb_migrations            │
└─────────────────────────┘   └─────────────────────────────┘
```

## Data Model (PocketBase)

### Collections

| Collection | Type | Purpose | Key Fields |
|-----------|------|---------|-----------|
| `users` | auth | Auth + profiles | email, name, avatar, role, points, last_lat, last_lng, last_seen |
| `sightings` | base | Registros de hongos | user (relation), mushroom_name, description, toxicity, lat, lng, images, status, weather_context, elevation, photoperiod, + GBIF fields |
| `comments` | base | Comentarios en sightings | sighting (relation), user (relation), text |
| `chat_messages` | base | Chat geolocalizado | user (relation), text, lat, lng |
| `reports` | base | Reportes de contenido | reporter (relation), type, target_id, reason, content, status |
| `logs` | base | Auditoría | user (relation), action, details |
| `rate_limits` | base | Rate limiting AI | user (relation), action |

### Sightings Schema Detail

**Required fields:** user, mushroom_name, description, lat, lng
**Optional fields:** toxicity, habitat, features, geohash, images (max 10, maxSize: 15MB), status, network_id, geofirmed_by, geofirmed_at, ai_analysis
**GBIF fields:** kingdom, phylum, taxon_class, taxon_order, family, genus, species, taxon_rank, country, state_province, locality, event_date, basis_of_record, occurrence_status, dataset_name, recorded_by, identified_by, catalog_number, collection_code, institution_code, individual_count, gbif_id, publisher, gbif_image_url
**Weather fields:** weather_context (JSON), elevation (number), photoperiod (JSON)

## Frontend Structure

### Components
- `App.tsx` — Main layout, map + sidebar + modals
- `MapView.tsx` — Leaflet map, markers, layers (GBIF, mine, others)
- `Sidebar.tsx` — Sighting list, search, filters
- `Header.tsx` — User auth, layer toggles, admin button
- `NewSightingModal.tsx` — Form for new sightings (images, AI recognition)
- `SightingDetail.tsx` — Detail view with weather badge, comments
- `ChatPanel.tsx` — Geolocalized chat
- `AdminPanel.tsx` — Admin dashboard (logs, reports, users)
- `ReportModal.tsx` — Content reporting
- `WeatherBadge.tsx` — Weather display for sighting

### Hooks
- `useSightingForm.ts` — Form state, image upload, AI recognition, create sighting
- `useGeoQuery.ts` — GBIF data fetching
- `useChat.ts` — Chat messages, subscriptions
- `useAdmin.ts` — Admin data loading
- `useSpeciesStats.ts` — Species statistics

### Lib
- `pb.ts` — PocketBase SDK instance
- `gemini.ts` — Gemini Vision API client
- `weather.ts` — WeatherAPI integration
- `offline.ts` — Offline queue management

## Backend (PocketBase)

### JS Hooks (`pb_hooks/main.js`)
1. **AI Recognition Hook** — `onRecordCreateRequest` for sightings
   - If `_ai_recognize` flag is set, calls Gemini Vision API
   - Populates mushroom_name, description, toxicity, habitat, features
   - Rate limited: 20 requests/hour per user

2. **Custom Route** — `POST /api/custom/identify`
   - Standalone mushroom identification without creating sighting
   - Same rate limiting

### Migrations (`pb_migrations/`)
- `001_setup.js` — Base schema (users, sightings, comments, chat, reports, logs, rate_limits)
- `003_gbif_bot.js` — GBIF import bot user
- `004_users_fields.js` — Extra user fields (role, points, merits, last_seen, etc.)
- `1777249672_updated_sightings.js` — GBIF taxonomy fields
- `1777255023_updated_sightings.js` — gbif_image_url field
- `1777256780_updated_sightings.js` — weather_context, elevation, photoperiod

## External Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| Gemini Vision API | AI mushroom identification | ✅ Working |
| WeatherAPI | Weather context for sightings | ✅ Working |
| GBIF API | Fungal occurrence data import | ✅ Working |
| ITIS API | Taxonomic validation | ⚠️ "Failed to fetch" errors |
| IUCN API | Conservation status | ⚠️ "Failed to fetch" errors |

## Optimization Plan (Q2 2026)

### Phase 1: Critical Fixes (Week 1-2)
| # | Task | Effort | Impact | Owner |
|---|------|--------|--------|-------|
| 1.1 | **Image compression** — Compress images client-side before upload (target <500KB) | 4h | 🔥 High | Frontend |
| 1.2 | **Token auto-refresh** — Intercept 401s, refresh token, retry request | 2h | 🔥 High | Frontend |
| 1.3 | **Merits field migration** — Add `merits` JSON field to users collection | 1h | 🔥 High | Backend |
| 1.4 | **Error boundary** — Global error handler with user-friendly messages | 3h | 🔥 High | Frontend |

### Phase 2: Reliability (Week 3-4)
| # | Task | Effort | Impact | Owner |
|---|------|--------|--------|-------|
| 2.1 | **External API proxy** — Route ITIS/IUCN through PB backend to avoid CORS | 4h | 🔥 High | Backend |
| 2.2 | **Admin panel fix** — Update listRule/viewRule for admin collections | 2h | 🔥 High | Backend |
| 2.3 | **Offline queue** — Queue sightings when offline, sync on reconnect | 6h | 🔥 High | Frontend |
| 2.4 | **Rate limit UI** — Show AI request counter + cooldown timer | 2h | 🔥 High | Frontend |

### Phase 3: Architecture (Week 5-6)
| # | Task | Effort | Impact | Owner |
|---|------|--------|--------|-------|
| 3.1 | **Services layer** — Extract GBIF/ITIS/IUCN/Weather into `src/services/` | 4h | 🔥 High | Frontend |
| 3.2 | **Hook refactoring** — Split `useSightingForm` into smaller hooks | 3h | 🔥 High | Frontend |
| 3.3 | **Type safety** — Strict TypeScript, no `any` types | 4h | 🔥 High | Frontend |
| 3.4 | **Test coverage** — Unit tests for hooks and services | 6h | 🔥 High | Frontend |

### Phase 4: Features (Week 7-8)
| # | Task | Effort | Impact | Owner |
|---|------|--------|--------|-------|
| 4.1 | **Email notifications** — Configure SMTP, welcome emails | 3h | 🔥 High | Backend |
| 4.2 | **Data export** — CSV/JSON export for user sightings | 2h | 🔥 High | Frontend |
| 4.3 | **Multi-language** — i18n with Spanish/English | 4h | 🔥 High | Frontend |
| 4.4 | **GBIF sync pipeline** — Automated nightly import | 4h | 🔥 High | Backend |

## Known Issues & Patches

### Current
1. **Token invalidation** — Password resets invalidate all existing JWT tokens. Users need re-login.
2. **ITIS/IUCN fetch failures** — External APIs returning errors. May be CORS or rate limiting.
3. **Location update 404** — `pb.collection('users').update()` for location fails. User ID mismatch?
4. **Admin panel 403** — Admin data loading fails with "Only superusers can perform this action"

### Fixed
- ✅ Image upload size limit increased from 5MB → 15MB
- ✅ Error logging improved in useSightingForm

## Deployment

### Docker Compose
```yaml
services:
  web:
    build: .
    expose: ["80"]
  pb:
    build: ./pocketbase
    expose: ["8090"]
    volumes:
      - pb-data:/pb/pb_data
      - ./pocketbase/pb_migrations:/pb/pb_migrations
      - ./pocketbase/pb_hooks:/pb/pb_hooks
```

### Traefik Routing
- `fungimap.lab.embudo.com.ar` → web container
- `/api/*` and `/_/*` → pb container (priority 100)

## Missing / To Migrate

### Critical (Blockers)
1. **Image compression** — Frontend should compress images before upload (reduce bandwidth, storage)
2. **Token refresh** — Auto-refresh expired tokens instead of failing silently
3. **Merits field** — `merits` field doesn't exist in DB schema but frontend references it
4. **Admin panel permissions** — Fix admin data access rules

### High Priority
5. **External API proxy** — Route ITIS/IUCN through PB backend to avoid CORS/rate limits
6. **Offline queue** — Complete offline support for sighting creation
7. **Error boundaries** — Global error handling with user-friendly messages
8. **Rate limiting UI** — Show remaining AI requests to user

### Medium Priority
9. **Services layer** — Extract GBIF/ITIS/IUCN/Weather into `src/services/`
10. **Hook refactoring** — Split `useSightingForm` into smaller hooks
11. **Type safety** — Strict TypeScript, no `any` types
12. **Test coverage** — Unit tests for hooks and services

### Low Priority
13. **GBIF data sync** — Automated import pipeline
14. **Email notifications** — SMTP not configured
15. **Data export** — CSV/JSON export for user data
16. **Multi-language** — i18n support

## File Inventory

### Source (src/)
```
src/
├── components/          # 11 React components
├── hooks/               # 5 custom hooks
├── lib/                 # 4 utility modules
├── types/               # TypeScript definitions
├── __tests__/           # Test suite
├── __mocks__/           # Mock implementations
├── App.tsx              # Main app
├── main.tsx             # Entry point
└── index.css            # Global styles
```

### Config
```
├── docker-compose.yml
├── Dockerfile
├── nginx.conf
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env (VITE_GEMINI_API_KEY)
```

### PocketBase
```
pocketbase/
├── Dockerfile
├── pb_hooks/
│   └── main.js          # Gemini proxy hooks
└── pb_migrations/
    ├── 001_setup.js
    ├── 003_gbif_bot.js
    ├── 004_users_fields.js
    └── *.js             # Schema updates
```

## Environment Variables

| Variable | Used In | Purpose |
|----------|---------|---------|
| `VITE_GEMINI_API_KEY` | Build arg → gemini.ts | Gemini Vision API |
| `GEMINI_API_KEY` | pb_hooks/main.js | Server-side Gemini API |

