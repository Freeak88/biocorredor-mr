// PocketBase JS Hooks - Biocorredor MR Gemini Proxy
// This file hooks into PocketBase to handle AI mushroom identification
// through Gemini Vision API, keeping the API key secure on the server.

// Constants
const GEMINI_API_KEY = $os.getenv("GEMINI_API_KEY") || "";
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const RATE_LIMIT_PER_HOUR = 20;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

// Prompt identical to client-side version
const GEMINI_PROMPT = `Actúa como un experto micólogo de campo. Analiza esta imagen de un hongo y proporciona una identificación técnica precisa. 
Debes identificar el nombre científico, nombre común probable, nivel de toxicidad, descripción, hábitat natural y características distintivas para el cuaderno de campo.`;

// Schema for Gemini response (mapped to JSON format)
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

/**
 * Check rate limit for a user
 * Returns true if allowed, false if rate limit exceeded
 */
function checkRateLimit(userId, action) {
  try {
    const collection = $app.dao().findCollectionByNameOrId("rate_limits");
    if (!collection) {
      $app.logger().warn("rate_limits collection not found, rate limiting disabled");
      return true;
    }

    const now = Date.now();
    const oneHourAgo = now - RATE_LIMIT_WINDOW;

    // Count requests in the last hour
    const records = $app.dao()
      .findRecordsByFilter(
        "rate_limits",
        `user = "${userId}" && action = "${action}" && created > ${oneHourAgo}`
      );

    if (records.length >= RATE_LIMIT_PER_HOUR) {
      return false;
    }

    // Record this request
    const record = new Record(collection);
    record.set("user", userId);
    record.set("action", action);
    $app.dao().saveRecord(record);

    return true;
  } catch (err) {
    $app.logger().error("Rate limit check failed", "error", err);
    // Fail open - allow request if rate limit check fails
    return true;
  }
}

/**
 * Convert file reader to base64 string
 */
function fileToBase64(fileReader) {
  try {
    const reader = fileReader.open();
    const buffer = reader.readAll();
    reader.close();
    
    // Convert bytes to base64
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    return btoa(binary);
  } catch (err) {
    $app.logger().error("Failed to convert file to base64", "error", err);
    throw err;
  }
}

/**
 * Call Gemini Vision API to identify mushroom from image
 */
function identifyMushroom(base64Image, mimeType) {
  try {
    const requestBody = {
      contents: [{
        parts: [
          { inlineData: { data: base64Image, mimeType: mimeType } },
          { text: GEMINI_PROMPT }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA
      }
    };

    const response = $http.send({
      url: GEMINI_API_URL,
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 30
    });

    if (response.statusCode !== 200) {
      $app.logger().error("Gemini API error", "status", response.statusCode, "body", response.body);
      throw new Error(`Gemini API returned status ${response.statusCode}`);
    }

    const data = JSON.parse(response.body);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error("No response from Gemini API");
    }

    return JSON.parse(text);
  } catch (err) {
    $app.logger().error("Gemini Vision API call failed", "error", err);
    throw err;
  }
}

/**
 * Hook: Intercept record creation for sightings collection
 * If _ai_recognize is true and images are uploaded, call Gemini Vision API
 */
onRecordCreateRequest((e) => {
  // Only process sightings collection
  if (e.collection.name !== "sightings") {
    return e.next();
  }

  // Check if AI recognition is requested
  const body = e.requestInfo().body;
  if (!body._ai_recognize || body._ai_recognize !== true) {
    return e.next();
  }

  // Check if user is authenticated
  if (!e.auth) {
    throw e.unauthorizedError("Authentication required for AI recognition");
  }

  // Check rate limit
  if (!checkRateLimit(e.auth.id, "identify_mushroom")) {
    throw e.tooManyRequestsError(`Rate limit exceeded: ${RATE_LIMIT_PER_HOUR} requests per hour`);
  }

  // Check for uploaded images
  const files = e.findUploadedFiles("images");
  if (!files || files.length === 0) {
    throw e.badRequestError("At least one image is required for AI recognition");
  }

  try {
    // Process first image
    const firstImage = files[0];
    const mimeType = firstImage.originalName.endsWith(".png") ? "image/png" : "image/jpeg";
    
    $app.logger().info("Starting mushroom AI recognition", "user", e.auth.id, "file", firstImage.originalName);

    // Convert image to base64
    const base64Image = fileToBase64(firstImage.reader);

    // Call Gemini Vision API
    const result = identifyMushroom(base64Image, mimeType);

    $app.logger().info("Mushroom AI recognition successful", "user", e.auth.id, "result", result);

    // Populate record fields with AI results
    // Note: These will be in e.requestInfo().body for the actual record creation
    const recordData = e.requestInfo().body;
    recordData.mushroom_name = result.scientificName || result.commonName || "Unknown";
    recordData.description = result.description || "";
    recordData.toxicity = result.toxicity || "Desconocido";
    recordData.habitat = result.habitat || "";
    recordData.features = result.features || "";

    // Store full AI analysis in ai_analysis field
    recordData.ai_analysis = result;

    // Clean up the internal flag
    delete recordData._ai_recognize;

  } catch (err) {
    $app.logger().error("AI recognition failed", "error", err);
    // Don't block record creation, just log the error
    // The user can still create the record manually
  }

  return e.next();
}, "sightings");

/**
 * Custom route: POST /api/custom/identify
 * Standalone endpoint for mushroom identification without creating a sighting
 */
routerAdd("POST", "/api/custom/identify", (e) => {
  // Check if user is authenticated
  if (!e.auth) {
    throw e.unauthorizedError("Authentication required");
  }

  // Check rate limit
  if (!checkRateLimit(e.auth.id, "identify_mushroom")) {
    throw e.tooManyRequestsError(`Rate limit exceeded: ${RATE_LIMIT_PER_HOUR} requests per hour`);
  }

  // Get uploaded file from request
  const files = e.findUploadedFiles("image");
  if (!files || files.length === 0) {
    throw e.badRequestError("Image file is required (form field: 'image')");
  }

  try {
    const image = files[0];
    const mimeType = image.originalName.endsWith(".png") ? "image/png" : "image/jpeg";

    $app.logger().info("Custom identify request", "user", e.auth.id, "file", image.originalName);

    // Convert image to base64
    const base64Image = fileToBase64(image.reader);

    // Call Gemini Vision API
    const result = identifyMushroom(base64Image, mimeType);

    // Return the identification result
    return e.json(200, {
      success: true,
      data: result
    });

  } catch (err) {
    $app.logger().error("Custom identify endpoint failed", "error", err);
    throw e.internalServerErrorError("Failed to identify mushroom: " + err.message);
  }
}, $apis.requireAuth());

// Remote sync marker: every later edit of a P0 synchronized record is observable
// without relying on the client's local clock or PocketBase system fields.
const SYNCABLE_COLLECTIONS = ["survey_events", "occurrences", "territorial_changes", "media_evidence"];
onRecordCreateRequest((e) => {
  if (SYNCABLE_COLLECTIONS.includes(e.collection.name) && e.requestInfo().body.sync_key) {
    e.requestInfo().body.remote_updated_at = new Date().toISOString();
  }
  return e.next();
});
onRecordUpdateRequest((e) => {
  if (SYNCABLE_COLLECTIONS.includes(e.collection.name) && e.record.get("sync_key")) {
    e.record.set("remote_updated_at", new Date().toISOString());
  }
  return e.next();
});

$app.logger().info("Biocorredor MR Gemini Proxy hooks loaded successfully");
