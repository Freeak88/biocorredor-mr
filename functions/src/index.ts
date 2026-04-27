// =============================================================================
// Fungimap — Cloud Functions
// =============================================================================
//
// Arquitectura backend para Fungimap: app colaborativa de mapeo de hongos.
// Requiere Firebase Blaze plan (para llamadas externas a Gemini API).
//
// Functions:
//   1. identifyMushroom  — Callable, identificación con Gemini Vision
//   2. createSighting    — Callable, crea sighting con Storage + Firestore
//   3. geofirmSighting   — Callable, validación presencial in-situ
//   4. submitReport      — Callable, reportes de contenido
//   5. generateThumbnails— Storage trigger, thumbnails con Sharp
//   6. exportGeoJSON     — Callable, descarga de datos para QGIS
//
// Deploy:
//   cd functions && npm run deploy
//
// =============================================================================

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized, StorageObjectData } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';
import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';
import {
  IdentifyMushroomInput,
  CreateSightingInput,
  MushroomIdentification,
  GeofirmSightingInput,
  SubmitReportInput,
  ExportGeoJSONInput,
  Sighting,
} from './types';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
const bucket = storage.bucket();

// Gemini client — API key from environment (never from client)
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Haversine distance in km between two coordinates */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Check rate limit: returns remaining count or throws */
async function checkRateLimit(
  uid: string,
  action: string,
  maxPerHour: number
): Promise<number> {
  const now = admin.firestore.Timestamp.now();
  const oneHourAgo = new admin.firestore.Timestamp(now.seconds - 3600, 0);

  const snap = await db
    .collection('rate_limits')
    .doc(uid)
    .collection(action)
    .where('ts', '>=', oneHourAgo)
    .count()
    .get();

  const used = snap.data().count;
  if (used >= maxPerHour) {
    throw new HttpsError(
      'resource-exhausted',
      `Rate limit exceeded: ${maxPerHour} ${action} per hour. Used: ${used}.`
    );
  }

  // Log this request
  await db.collection('rate_limits').doc(uid).collection(action).add({ ts: now });

  return maxPerHour - used - 1;
}

/** Create action log */
async function createLog(
  uid: string,
  userName: string,
  action: string,
  details: string
): Promise<void> {
  await db.collection('logs').add({
    userId: uid,
    userName,
    action,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// 1. identifyMushroom — Callable
// ---------------------------------------------------------------------------
/**
 * Recibe una imagen base64 del cliente, la envía a Gemini Vision API,
 * y retorna la identificación taxonómica del hongo.
 *
 * Rate limit: 20 requests/hora por usuario.
 * La API key se lee desde environment config (GEMINI_API_KEY).
 */
export const identifyMushroom = onCall(
  { secrets: ['GEMINI_API_KEY'] },
  async (request) => {
    const data = request.data as IdentifyMushroomInput;

    // --- Auth ---
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required.');
    }
    const uid = request.auth.uid;
    const userName = request.auth.token.name || 'Explorador';

    // --- Validate input ---
    if (!data.base64Image || typeof data.base64Image !== 'string') {
      throw new HttpsError(
        'invalid-argument',
        'base64Image is required and must be a string.'
      );
    }

    // Max ~10MB base64 payload
    if (data.base64Image.length > 14_000_000) {
      throw new HttpsError(
        'invalid-argument',
        'Image too large. Max 10MB.'
      );
    }

    // --- Rate limit ---
    await checkRateLimit(uid, 'identify', 20);

    // --- Call Gemini Vision ---
    try {
      const mimeType = data.mimeType || 'image/jpeg';
      const prompt = `Actúa como un experto micólogo de campo. Analiza esta imagen de un hongo y proporciona una identificación técnica precisa. 
Debes identificar el nombre científico, nombre común probable, nivel de toxicidad, descripción, hábitat natural y características distintivas para el cuaderno de campo.`;

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-preview-05-20',
        contents: {
          parts: [
            { inlineData: { data: data.base64Image, mimeType } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scientificName: { type: Type.STRING },
              commonName: { type: Type.STRING },
              toxicity: {
                type: Type.STRING,
                enum: ['Comestible', 'Tóxico', 'Mortal', 'Desconocido'],
              },
              description: { type: Type.STRING },
              habitat: { type: Type.STRING },
              features: { type: Type.STRING },
            },
            required: [
              'scientificName',
              'commonName',
              'toxicity',
              'description',
              'habitat',
              'features',
            ],
          },
        },
      });

      const result: MushroomIdentification = JSON.parse(response.text || '{}');

      if (!result.scientificName) {
        throw new HttpsError(
          'internal',
          'Gemini returned empty identification.'
        );
      }

      // Log successful identification
      await createLog(uid, userName, 'ai_identify', `Identificó ${result.scientificName}`);

      return result;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('Gemini Vision Error:', error);
      throw new HttpsError(
        'internal',
        'Failed to identify mushroom. Please try again.'
      );
    }
  }
);

// ---------------------------------------------------------------------------
// 2. createSighting — Callable
// ---------------------------------------------------------------------------
/**
 * Valida datos del sighting, sube imágenes a Storage, crea documento
 * en Firestore, asigna puntos (+10 base), busca micelio cercano
 * y vincula networkId.
 */
export const createSighting = onCall(async (request) => {
  const data = request.data as CreateSightingInput;

  // --- Auth ---
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required.');
  }
  const uid = request.auth.uid;
  const userName = request.auth.token.name || 'Explorador';
  const userPhoto = request.auth.token.picture || '';

  // --- Validate required fields ---
  if (!data.mushroomName || typeof data.mushroomName !== 'string') {
    throw new HttpsError('invalid-argument', 'mushroomName required.');
  }
  if (!data.description || typeof data.description !== 'string') {
    throw new HttpsError('invalid-argument', 'description required.');
  }
  if (
    typeof data.lat !== 'number' ||
    typeof data.lng !== 'number' ||
    data.lat < -90 ||
    data.lat > 90 ||
    data.lng < -180 ||
    data.lng > 180
  ) {
    throw new HttpsError('invalid-argument', 'Valid lat/lng required.');
  }
  if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
    throw new HttpsError('invalid-argument', 'At least one image required.');
  }
  if (data.images.length > 5) {
    throw new HttpsError('invalid-argument', 'Maximum 5 images per sighting.');
  }
  const validStatuses = ['identified', 'unconfirmed', 'draft'];
  if (!validStatuses.includes(data.status)) {
    throw new HttpsError('invalid-argument', 'Invalid status.');
  }

  try {
    // --- Upload images to Storage ---
    const uploadedImages: {
      url: string;
      createdAt: admin.firestore.Timestamp;
      isPrimary: boolean;
    }[] = [];

    for (let i = 0; i < data.images.length; i++) {
      const base64Data = data.images[i];
      const mimeType = data.mimeTypes?.[i] || 'image/jpeg';
      const extension = mimeType.split('/')[1] || 'jpg';
      const filePath = `sightings/${uid}/${Date.now()}_${i}.${extension}`;

      const buffer = Buffer.from(base64Data, 'base64');
      const file = bucket.file(filePath);

      await file.save(buffer, {
        metadata: { contentType: mimeType },
        resumable: false,
      });

      // Make publicly readable
      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      uploadedImages.push({
        url: publicUrl,
        createdAt: admin.firestore.Timestamp.now(),
        isPrimary: i === 0,
      });
    }

    // --- Find nearby mycelium (network linking) ---
    let networkId: string | null = null;
    const RADIUS_THRESHOLD = 0.0001; // ~10m in degrees
    const speciesGenus = data.mushroomName.split(' ')[0].toLowerCase();

    const nearbySnap = await db
      .collection('sightings')
      .where('lat', '>=', data.lat - 0.001)
      .where('lat', '<=', data.lat + 0.001)
      .limit(50)
      .get();

    for (const doc of nearbySnap.docs) {
      const existing = doc.data();
      const dist = Math.sqrt(
        (existing.lat - data.lat) ** 2 + (existing.lng - data.lng) ** 2
      );
      const sameGenus = (existing.mushroomName as string)
        .toLowerCase()
        .includes(speciesGenus);

      if (dist < RADIUS_THRESHOLD && sameGenus) {
        networkId = existing.networkId || doc.id;
        break;
      }
    }

    // --- Create Firestore document ---
    const sightingRef = db.collection('sightings').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await sightingRef.set({
      userId: uid,
      userName,
      userPhoto,
      mushroomName: data.mushroomName,
      description: data.description,
      toxicity: data.toxicity || 'Desconocido',
      lat: data.lat,
      lng: data.lng,
      imageUrl: uploadedImages[0]?.url || '',
      images: uploadedImages,
      networkId,
      status: data.status,
      habitat: data.habitat || '',
      features: data.features || '',
      createdAt: now,
      updatedAt: now,
    });

    // --- Assign points ---
    const points = data.status === 'draft' ? 5 : 10;
    const userRef = db.collection('users').doc(uid);
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const currentPoints = (userSnap.data()?.points || 0) as number;
      tx.update(userRef, {
        points: currentPoints + points,
        updatedAt: now,
      });
    });

    // --- Log action ---
    await createLog(
      uid,
      userName,
      'sighting_add',
      `Registró "${data.mushroomName}" como ${data.status === 'draft' ? 'Borrador remoto' : 'Hallazgo'} (+${points} pts)`
    );

    return {
      id: sightingRef.id,
      networkId,
      points,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('createSighting error:', error);
    throw new HttpsError('internal', 'Failed to create sighting.');
  }
});

// ---------------------------------------------------------------------------
// 3. geofirmSighting — Callable
// ---------------------------------------------------------------------------
/**
 * Valida que el usuario esté físicamente cerca (< 50m) del sighting,
 * actualiza el status, asigna puntos al geofirmador (+50),
 * y registra el merit "Geofirmador Oficial".
 */
export const geofirmSighting = onCall(async (request) => {
  const data = request.data as GeofirmSightingInput;

  // --- Auth ---
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required.');
  }
  const uid = request.auth.uid;
  const userName = request.auth.token.name || 'Explorador';

  // --- Validate ---
  if (!data.sightingId || typeof data.sightingId !== 'string') {
    throw new HttpsError('invalid-argument', 'sightingId required.');
  }
  if (
    typeof data.userLat !== 'number' ||
    typeof data.userLng !== 'number'
  ) {
    throw new HttpsError('invalid-argument', 'userLat and userLng required.');
  }

  try {
    const sightingRef = db.collection('sightings').doc(data.sightingId);
    const sightingSnap = await sightingRef.get();

    if (!sightingSnap.exists) {
      throw new HttpsError('not-found', 'Sighting not found.');
    }

    const sighting = sightingSnap.data() as Sighting;

    // Can't geofirm your own sighting
    if (sighting.userId === uid) {
      throw new HttpsError(
        'permission-denied',
        'Cannot geofirm your own sighting.'
      );
    }

    // Already verified?
    if (sighting.status === 'expert_verified') {
      throw new HttpsError(
        'failed-precondition',
        'Sighting is already expert-verified.'
      );
    }

    // --- Distance check (< 50m) ---
    const distanceKm = haversineKm(
      data.userLat,
      data.userLng,
      sighting.lat,
      sighting.lng
    );
    const distanceM = distanceKm * 1000;

    if (distanceM > 50) {
      throw new HttpsError(
        'failed-precondition',
        `Too far away: ${distanceM.toFixed(0)}m. Must be within 50m.`
      );
    }

    // --- Update sighting ---
    const now = admin.firestore.FieldValue.serverTimestamp();
    await sightingRef.update({
      status: 'unconfirmed', // Elevated from draft
      lastGeofirmedAt: now,
      geofirmedBy: uid,
      updatedAt: now,
    });

    // --- Assign points + merit ---
    const userRef = db.collection('users').doc(uid);
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data();
      const currentPoints = (userData?.points || 0) as number;
      const merits: string[] = userData?.merits || [];
      const newMerits = merits.includes('Geofirmador Oficial')
        ? merits
        : [...merits, 'Geofirmador Oficial'];

      tx.update(userRef, {
        points: currentPoints + 50,
        merits: newMerits,
        updatedAt: now,
      });
    });

    // --- Log ---
    await createLog(
      uid,
      userName,
      'geofirm',
      `Geofirmó hallazgo de "${sighting.mushroomName}" in situ (+50 pts)`
    );

    return {
      success: true,
      distanceMeters: Math.round(distanceM),
      pointsAwarded: 50,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('geofirmSighting error:', error);
    throw new HttpsError('internal', 'Geofirm failed.');
  }
});

// ---------------------------------------------------------------------------
// 4. submitReport — Callable
// ---------------------------------------------------------------------------
/**
 * Crea un reporte en Firestore para revisión admin.
 * Opcionalmente notifica al admin (requiere Trigger Email extension).
 */
export const submitReport = onCall(async (request) => {
  const data = request.data as SubmitReportInput;

  // --- Auth ---
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required.');
  }
  const uid = request.auth.uid;
  const userName = request.auth.token.name || 'Explorador';

  // --- Validate ---
  const validTypes = ['message', 'user', 'sighting', 'comment'];
  if (!data.type || !validTypes.includes(data.type)) {
    throw new HttpsError('invalid-argument', 'Invalid report type.');
  }
  if (!data.targetId || typeof data.targetId !== 'string') {
    throw new HttpsError('invalid-argument', 'targetId required.');
  }
  if (!data.reason || typeof data.reason !== 'string' || data.reason.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'reason required.');
  }
  if (data.reason.length > 1000) {
    throw new HttpsError('invalid-argument', 'reason too long (max 1000 chars).');
  }

  try {
    await db.collection('reports').add({
      reporterId: uid,
      reporterName: userName,
      type: data.type,
      targetId: data.targetId,
      reason: data.reason.trim(),
      content: data.content || '',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // --- Optional: Admin notification via Trigger Email extension ---
    // Uncomment if Trigger Email extension is installed:
    // await db.collection('mail').add({
    //   to: process.env.ADMIN_EMAIL,
    //   message: {
    //     subject: `[Fungimap] Nuevo reporte de ${data.type}`,
    //     text: `${userName} reportó ${data.type} (${data.targetId}): ${data.reason}`,
    //   },
    // });

    // --- Log ---
    await createLog(
      uid,
      userName,
      'report_submitted',
      `Denunció ${data.type} (${data.targetId}) por: ${data.reason.trim().slice(0, 80)}`
    );

    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('submitReport error:', error);
    throw new HttpsError('internal', 'Failed to submit report.');
  }
});

// ---------------------------------------------------------------------------
// 5. generateThumbnails — Storage Trigger
// ---------------------------------------------------------------------------
/**
 * Se activa al subir una imagen a Storage (sightings/ prefix).
 * Genera thumbnail 400x400 con Sharp, lo guarda en thumbnails/,
 * y actualiza las URLs en Firestore.
 */
export const generateThumbnails = onObjectFinalized(async (event) => {
  const objectData = event.data as StorageObjectData;
  const filePath = objectData.name;
  if (!filePath) return;

  // Only process sightings images, skip thumbnails and non-images
  if (!filePath.startsWith('sightings/')) return;
  if (filePath.includes('thumbnails/')) return;

  const contentType = objectData.contentType || '';
  if (!contentType.startsWith('image/')) return;

  // Skip tiny files
  if (objectData.size < 1024) return;

  const fileName = filePath.split('/').pop() || 'unknown';
  const thumbPath = `thumbnails/${fileName}`;

  try {
    // Download original
    const tempLocalFile = `/tmp/${fileName}`;
    await bucket.file(filePath).download({ destination: tempLocalFile });

    // Generate thumbnail 400x400 with Sharp
    const thumbLocalFile = `/tmp/thumb_${fileName}`;
    await sharp(tempLocalFile)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbLocalFile);

    // Upload thumbnail
    await bucket.upload(thumbLocalFile, {
      destination: thumbPath,
      metadata: { contentType: 'image/jpeg' },
    });

    // Make thumbnail public
    await bucket.file(thumbPath).makePublic();
    const thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`;

    // Update Firestore sighting with thumbnail URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    const sightingsSnap = await db
      .collection('sightings')
      .where('imageUrl', '==', publicUrl)
      .limit(1)
      .get();

    if (!sightingsSnap.empty) {
      const sightingDoc = sightingsSnap.docs[0];
      const images = sightingDoc.data().images || [];

      const updatedImages = images.map((img: any) => {
        if (img.url === publicUrl) {
          return { ...img, thumbnailUrl };
        }
        return img;
      });

      await sightingDoc.ref.update({
        thumbnailUrl,
        images: updatedImages,
      });
    }

    // Cleanup temp files
    const fs = await import('fs/promises');
    await fs.unlink(tempLocalFile).catch(() => {});
    await fs.unlink(thumbLocalFile).catch(() => {});

    console.log(`Thumbnail generated: ${thumbPath}`);
  } catch (error) {
    console.error('generateThumbnails error:', error);
    // Don't throw — storage triggers should be resilient
  }
});

// ---------------------------------------------------------------------------
// 6. exportGeoJSON — Callable
// ---------------------------------------------------------------------------
/**
 * Genera GeoJSON de sightings filtrados y retorna una signed URL
 * para descarga directa (válida por 1 hora).
 */
export const exportGeoJSON = onCall(async (request) => {
  const data = (request.data || {}) as ExportGeoJSONInput;

  // --- Auth ---
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required.');
  }
  const uid = request.auth.uid;
  const userName = request.auth.token.name || 'Explorador';

  try {
    // --- Build query ---
    let query: FirebaseFirestore.Query = db.collection('sightings');

    if (data.status) {
      query = query.where('status', '==', data.status);
    }

    const snap = await query.orderBy('createdAt', 'desc').limit(5000).get();

    // --- Filter in memory ---
    let sightings = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    // Bounding box filter
    if (data.bounds) {
      const [south, west, north, east] = data.bounds;
      sightings = sightings.filter(
        (s) => s.lat >= south && s.lat <= north && s.lng >= west && s.lng <= east
      );
    }

    // Species filter
    if (data.speciesFilter) {
      const q = data.speciesFilter.toLowerCase();
      sightings = sightings.filter((s) =>
        (s.mushroomName as string).toLowerCase().includes(q)
      );
    }

    // Date range filter
    if (data.dateFrom || data.dateTo) {
      sightings = sightings.filter((s) => {
        if (!s.createdAt) return false;
        const ts = s.createdAt.toDate() as Date;
        const from = data.dateFrom ? new Date(data.dateFrom) : new Date(0);
        const to = data.dateTo ? new Date(data.dateTo) : new Date();
        return ts >= from && ts <= to;
      });
    }

    // --- Build GeoJSON ---
    const geojson = {
      type: 'FeatureCollection' as const,
      features: sightings.map((s) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng, s.lat],
        },
        properties: {
          id: s.id,
          name: s.mushroomName || '',
          description: s.description || '',
          toxicity: s.toxicity || '',
          habitat: s.habitat || '',
          status: s.status || '',
          userName: s.userName || '',
          networkId: s.networkId || null,
          date: s.createdAt ? (s.createdAt.toDate() as Date).toISOString() : null,
          imageUrl: s.imageUrl || '',
          thumbnailUrl: s.thumbnailUrl || '',
        },
      })),
    };

    // --- Write to temp Storage file and generate signed URL ---
    const exportPath = `exports/${uid}/fungimap_export_${Date.now()}.geojson`;
    const buffer = Buffer.from(JSON.stringify(geojson, null, 2), 'utf-8');

    await bucket.file(exportPath).save(buffer, {
      metadata: { contentType: 'application/geo+json' },
    });

    // Generate signed URL valid for 1 hour
    const [signedUrl] = await bucket.file(exportPath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 3600 * 1000,
    });

    // --- Log ---
    await createLog(
      uid,
      userName,
      'export_data',
      `Exportó ${sightings.length} puntos a GeoJSON`
    );

    return {
      url: signedUrl,
      count: sightings.length,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('exportGeoJSON error:', error);
    throw new HttpsError('internal', 'Failed to export GeoJSON.');
  }
});
