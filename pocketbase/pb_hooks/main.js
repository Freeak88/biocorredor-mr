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

$app.logger().info("FungiMap hooks loaded OK");
