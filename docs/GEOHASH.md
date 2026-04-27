# GeoHash Geographic Query System for Fungimap

## Overview

Fungimap previously loaded **all sightings** into memory via a single `onSnapshot` listener on the `sightings` collection. This does not scale — as the dataset grows, memory usage, bandwidth, and render time degrade linearly.

The GeoHash system replaces this with **viewport-based geographic queries**: only sightings within the visible map area are fetched and rendered.

---

## How It Works

### 1. GeoHash Encoding

Each sighting stores a `geohash` field — a base32 string encoding its latitude/longitude. Example:

```
lat: -34.6037, lng: -58.3816  →  geohash: "6gkzwgjzn"
```

Geohash strings have a spatial ordering property: **nearby points share long prefixes**. This allows Firestore range queries (`startAt` / `endAt`) to efficiently find points in a geographic area without native geo-indexing.

### 2. Viewport Query Flow

```
Map viewport (NE, SW bounds)
    ↓
getGeohashRanges(bounds)  →  generates N geohash prefix ranges
    ↓
Firestore: query(sightings, orderBy('geohash'), startAt(X), endAt(Y))
    ↓
Client-side filter: exact lat/lng within viewport
    ↓
Rendered markers
```

### 3. Smart Caching

The `useGeoQuery` hook caches results and skips re-querying if the viewport changes by **less than 20%**. Instead, it filters the cached dataset to the new viewport bounds. This prevents excessive Firestore reads during minor map panning/zooming.

---

## Files

| File | Purpose |
|------|---------|
| `src/utils/geohash.ts` | Pure geohash encoder/decoder, Haversine distance, viewport helpers |
| `src/hooks/useGeoQuery.ts` | React hook: viewport-based Firestore queries with caching |
| `src/utils/migration.ts` | Batch migration script to add `geohash` to existing sightings |

---

## Migration Steps

### Step 1: Add `geohash` to new sightings

Update `handleAddNewSighting` in `App.tsx` to include the geohash when creating a sighting:

```tsx
import { encodeGeohash } from './utils/geohash';

// In handleAddNewSighting:
await addDoc(collection(db, 'sightings'), {
  userId: user.uid,
  userName: user.displayName || 'Explorador',
  // ... other fields ...
  lat: pos[0],
  lng: pos[1],
  geohash: encodeGeohash(pos[0], pos[1], 9),  // ← ADD THIS
  status: initialStatus,
  // ...
});
```

### Step 2: Run migration for existing data

Add a one-time migration button in an admin component (or run manually):

```tsx
import { migrateAddGeohash } from './utils/migration';

// In admin panel or a one-off script:
<button onClick={async () => {
  const result = await migrateAddGeohash();
  console.log('Migration complete:', result);
}}>
  Run GeoHash Migration
</button>
```

The migration:
- Processes sightings in batches of 400 (Firestore limit = 500)
- Skips documents that already have a `geohash`
- Reports progress and errors

### Step 3: Create Firestore Index

**Critical**: Firestore requires a composite index for `orderBy('geohash')` with range filters.

Go to Firebase Console → Firestore Database → Indexes → Composite Indexes, and add:

```
Collection: sightings
Fields:
  - geohash (Ascending)
  - createdAt (Descending)   // optional, for ordering results
```

Or create via Firebase CLI:

```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "sightings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "geohash", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### Step 4: Replace the sightings listener in App.tsx

Replace the current global `onSnapshot` with `useGeoQuery`:

```tsx
import { useGeoQuery, getMapBounds } from './hooks/useGeoQuery';

// Inside App component:
const [mapBounds, setMapBounds] = useState<ViewportBounds | null>(null);
const { sightings, loading: geoLoading } = useGeoQuery(mapBounds);

// In a Leaflet map event handler:
const MapEvents = () => {
  const map = useMapEvents({
    moveend() {
      setMapBounds(getMapBounds(map));
    },
    zoomend() {
      setMapBounds(getMapBounds(map));
    },
  });
  return null;
};
```

Remove the old global sightings `useEffect`:
```tsx
// REMOVE THIS BLOCK:
useEffect(() => {
  const q = query(collection(db, 'sightings'), orderBy('createdAt', 'desc'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Sighting[];
    setSightings(data);
  });
  return () => unsubscribe();
}, []);
```

---

## Limitations & Considerations

### 1. The "Geohash Edge" Problem

Geohash cells are rectangles, but the Earth is a sphere. Near the poles and at high zoom levels, a single geohash cell may span more longitude than the viewport. The `useGeoQuery` hook filters results client-side to ensure exact viewport matching.

### 2. Query Parallelism

Large viewports may generate 2–8 geohash range queries. Each query is an independent Firestore read. The hook subscribes to all in parallel and merges results. Monitor Firestore read quotas if users frequently zoom out to continent-level.

### 3. Maximum Results Per Range

Each geohash range query is limited by Firestore's query limits. The default `limit: 500` per range is usually sufficient for map viewports. If a dense urban area has >500 sightings in a single geohash cell, some markers won't appear until the user zooms in.

### 4. No `orderBy` on Other Fields

When using `orderBy('geohash')` with `startAt`/`endAt`, you **cannot** simultaneously `orderBy('createdAt')` in the same query unless you create a composite index on `(geohash, createdAt)`. Results are returned in geohash order, not chronological.

### 5. Cache Invalidation

The 20% viewport cache threshold is a trade-off:
- **Pro**: Fewer Firestore reads during typical map interaction
- **Con**: New sightings just outside the cached viewport won't appear until the user pans >20%

Adjust `CACHE_THRESHOLD` in `useGeoQuery.ts` (0.20 = 20%) based on your app's usage patterns.

### 6. Precision

Default geohash precision is **9 characters** (~2.4m × 4.8m cell). This is precise enough for city-level maps. For country-level zoom, the system automatically reduces precision based on viewport size.

### 7. Antimeridian (±180° longitude)

Viewports that cross the antimeridian (e.g., Pacific Ocean view) require special handling. The current implementation assumes continuous longitude. If your user base spans the Pacific, extend `getGeohashRanges` to split queries at ±180°.

---

## Performance Benchmarks (Estimated)

| Scenario | Old (global) | New (geohash) |
|----------|-------------|---------------|
| 100 sightings, city zoom | 100 docs read | ~5–15 docs read |
| 10,000 sightings, city zoom | 10,000 docs read | ~50–200 docs read |
| Pan map 100m | 10,000 docs re-read | 0 (cache hit) |
| Initial load time | O(n) | O(viewport density) |

---

## Future Improvements

1. **Quadtree index**: For very large datasets (>100K), consider a quadtree-based cloud function that pre-aggregates sightings into zoom-level tiles.
2. **Geohash + time composite**: Add `geohash_7_day` field for time-bounded geo queries ("sightings from last 7 days near me").
3. **Server-side clustering**: Use Cloud Functions to generate pre-clustered tile data for low-zoom levels, reducing client-side MarkerClusterGroup load.
