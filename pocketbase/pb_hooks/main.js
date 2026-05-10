/// <reference path="../pb_data/types.d.ts" />

// Debug: log all sightings creates to stderr
onRecordCreateRequest((e) => {
  if (e.collection.name === "sightings") {
    const fs = require("fs");
    const data = {
      time: new Date().toISOString(),
      body: e.requestInfo().body,
      auth: e.requestInfo().auth ? e.requestInfo().auth.id : "none",
      record: e.record ? e.record.export() : "none"
    };
    $app.logger().info("DEBUG_SIGHTING_CREATE", "data", JSON.stringify(data));
  }
  return e.next();
}, "sightings");

// ── Tracking: first sightings, badges, streaks ──
// Haversine distance in km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Run after sighting is created
onRecordAfterCreateRequest((e) => {
  if (e.collection.name !== "sightings") return e.next();
  const sighting = e.record;
  if (!sighting) return e.next();

  const userId = sighting.getString("user");
  const species = sighting.getString("mushroom_name") || "";
  const lat = sighting.get("lat");
  const lng = sighting.get("lng");
  const now = new Date();

  if (!userId || !species) return e.next();

  try {
    const dao = $app.dao();

    // 1. Increment sightings_total
    const user = dao.findRecordById("users", userId);
    if (user) {
      const total = (user.get("sightings_total") || 0) + 1;
      user.set("sightings_total", total);

      // 2. Check first_global
      const globalRecords = dao.findRecordsByFilter("first_sightings_log",
        `species = "${species}" && type = "global"`);
      const isFirstGlobal = !globalRecords.some((r) => r.getString("user") !== userId);
      if (isFirstGlobal) {
        const firstGlobal = (user.get("sightings_first_global") || 0) + 1;
        user.set("sightings_first_global", firstGlobal);

        const log = new Record(dao.findCollectionByNameOrId("first_sightings_log"));
        log.set("user", userId);
        log.set("sighting", sighting.id);
        log.set("type", "global");
        log.set("species", species);
        dao.saveRecord(log);

        const badges = JSON.parse(user.get("badges") || "[]");
        const badgeId = `first_global:${species.toLowerCase().replace(/\s+/g, "_")}`;
        if (!badges.includes(badgeId)) {
          badges.push(badgeId);
          user.set("badges", JSON.stringify(badges));
        }
      }

      // 3. Check first_local (30km)
      const RADIUS_KM = 30;
      let isFirstLocal = true;
      try {
        const allSightings = dao.findRecordsByFilter("sightings",
          `mushroom_name = "${species}" && user != "${userId}"`);
        for (const other of allSightings) {
          const otherLat = other.get("lat");
          const otherLng = other.get("lng");
          if (otherLat != null && otherLng != null) {
            const dist = haversine(lat, lng, otherLat, otherLng);
            if (dist < RADIUS_KM) {
              isFirstLocal = false;
              break;
            }
          }
        }
      } catch (geoErr) {
        $app.logger().warn("first_local_geo_query_failed", "error", geoErr);
      }

      if (isFirstLocal) {
        const firstLocal = (user.get("sightings_first_local") || 0) + 1;
        user.set("sightings_first_local", firstLocal);

        const log = new Record(dao.findCollectionByNameOrId("first_sightings_log"));
        log.set("user", userId);
        log.set("sighting", sighting.id);
        log.set("type", "local");
        log.set("species", species);
        log.set("radius_km", RADIUS_KM);
        dao.saveRecord(log);

        const badges = JSON.parse(user.get("badges") || "[]");
        const badgeId = `first_local:30km:${species.toLowerCase().replace(/\s+/g, "_")}`;
        if (!badges.includes(badgeId)) {
          badges.push(badgeId);
          user.set("badges", JSON.stringify(badges));
        }
      }

      // 4. Update streaks
      const lastSightingAt = user.getDateTime("last_sighting_at");
      let streakCurrent = user.get("sightings_streak_current") || 0;
      let streakMax = user.get("sightings_streak_max") || 0;

      if (lastSightingAt) {
        const lastDate = new Date(lastSightingAt.time || lastSightingAt);
        const diffMs = now.getTime() - lastDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays >= 2) {
          streakCurrent = 1;
        } else if (diffDays >= 1) {
          streakCurrent += 1;
          if (streakCurrent > streakMax) {
            streakMax = streakCurrent;
          }
        }
        // if same day, don't change streak
      } else {
        streakCurrent = 1;
        streakMax = 1;
      }

      user.set("sightings_streak_current", streakCurrent);
      user.set("sightings_streak_max", streakMax);
      user.set("last_sighting_at", now.toISOString());

      dao.saveRecord(user);
    }
  } catch (err) {
    $app.logger().error("tracking_hook_error", "error", err);
  }

  return e.next();
}, "sightings");

// === Original hooks below ===

const GEMINI_API_KEY = $os.getenv("GEMINI_API_KEY") || "";
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const RATE_LIMIT_PER_HOUR = 20;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

const GEMINI_PROMPT = `Actúa como un experto micólogo de campo. Analiza esta imagen de un hongo y proporciona una identificación técnica precisa. 
Debes identificar el nombre científico, nombre común probable, nivel de toxicidad, descripción, hábitat natural y características distintivas para el cuaderno de campo.`;

const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    scientificName: { type: "string" },
    commonName: { type: "string" },
    toxicity: { 
      type: "string",
      enum: ["Comestible", "Tóxico", "Mortal", "Desconocido"]
    },
    description: { type: "string" },
    habitat: { type: "string" },
    features: { type: "string" }
  },
  required: ["scientificName", "commonName", "toxicity", "description", "habitat", "features"]
};

function checkRateLimit(userId, action) {
  try {
    const collection = $app.dao().findCollectionByNameOrId("rate_limits");
    if (!collection) { return true; }
    const now = Date.now();
    const oneHourAgo = now - RATE_LIMIT_WINDOW;
    const records = $app.dao().findRecordsByFilter("rate_limits", `user = "${userId}" && action = "${action}" && created > ${oneHourAgo}`);
    if (records.length >= RATE_LIMIT_PER_HOUR) { return false; }
    const record = new Record(collection);
    record.set("user", userId);
    record.set("action", action);
    $app.dao().saveRecord(record);
    return true;
  } catch (err) { return true; }
}

function fileToBase64(fileReader) {
  try {
    const reader = fileReader.open();
    const buffer = reader.readAll();
    reader.close();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
    return btoa(binary);
  } catch (err) { throw err; }
}

function identifyMushroom(base64Image, mimeType) {
  try {
    const requestBody = {
      contents: [{ parts: [{ inlineData: { data: base64Image, mimeType } }, { text: GEMINI_PROMPT }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA }
    };
    const response = $http.send({ url: GEMINI_API_URL, method: "POST", body: JSON.stringify(requestBody), headers: { "Content-Type": "application/json" }, timeout: 30 });
    if (response.statusCode !== 200) { throw new Error(`Gemini API returned status ${response.statusCode}`); }
    const data = JSON.parse(response.body);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response from Gemini API");
    return JSON.parse(text);
  } catch (err) { throw err; }
}

onRecordCreateRequest((e) => {
  if (e.collection.name !== "sightings") return e.next();
  const body = e.requestInfo().body;
  if (!body._ai_recognize || body._ai_recognize !== true) return e.next();
  if (!e.auth) throw e.unauthorizedError("Authentication required for AI recognition");
  if (!checkRateLimit(e.auth.id, "identify_mushroom")) { throw e.tooManyRequestsError(`Rate limit exceeded`); }
  const files = e.findUploadedFiles("images");
  if (!files || files.length === 0) { throw e.badRequestError("At least one image is required for AI recognition"); }
  try {
    const firstImage = files[0];
    const mimeType = firstImage.originalName.endsWith(".png") ? "image/png" : "image/jpeg";
    const base64Image = fileToBase64(firstImage.reader);
    const result = identifyMushroom(base64Image, mimeType);
    const recordData = e.requestInfo().body;
    recordData.mushroom_name = result.scientificName || result.commonName || "Unknown";
    recordData.description = result.description || "";
    recordData.toxicity = result.toxicity || "Desconocido";
    recordData.habitat = result.habitat || "";
    recordData.features = result.features || "";
    recordData.ai_analysis = result;
    delete recordData._ai_recognize;
  } catch (err) { $app.logger().error("AI recognition failed", "error", err); }
  return e.next();
}, "sightings");

routerAdd("POST", "/api/custom/identify", (e) => {
  if (!e.auth) throw e.unauthorizedError("Authentication required");
  if (!checkRateLimit(e.auth.id, "identify_mushroom")) { throw e.tooManyRequestsError("Rate limit exceeded"); }
  const files = e.findUploadedFiles("image");
  if (!files || files.length === 0) throw e.badRequestError("Image file is required");
  try {
    const image = files[0];
    const mimeType = image.originalName.endsWith(".png") ? "image/png" : "image/jpeg";
    const base64Image = fileToBase64(image.reader);
    const result = identifyMushroom(base64Image, mimeType);
    return e.json(200, { success: true, data: result });
  } catch (err) { throw e.internalServerErrorError("Failed to identify mushroom: " + err.message); }
}, $apis.requireAuth());

// ── Leaderboard endpoint ──
routerAdd("GET", "/api/custom/leaderboard", (e) => {
  const lat = parseFloat(e.request.url.query().get("lat") || "0");
  const lng = parseFloat(e.request.url.query().get("lng") || "0");
  const radius = parseFloat(e.request.url.query().get("radius") || "30");

  try {
    const dao = $app.dao();
    // Get top 10 users by sightings_first_local (or total if no geo)
    const users = dao.findRecordsByFilter("users",
      `sightings_first_local > 0`,
      "-sightings_first_local", 10, 0);

    const entries = users.map((u, idx) => ({
      rank: idx + 1,
      user: {
        id: u.id,
        name: u.getString("name") || u.getString("email") || "Anónimo",
        avatar: u.getString("avatar") || "",
      },
      score: u.get("sightings_first_local") || 0,
      badges_count: JSON.parse(u.get("badges") || "[]").length,
    }));

    return e.json(200, {
      region: { lat, lng, radius_km: radius },
      entries,
    });
  } catch (err) {
    return e.json(500, { error: err.message });
  }
}, $apis.requireAuth());

$app.logger().info("FungiMap hooks loaded OK");
