#!/usr/bin/env node
// gbif-seed.js — Import GBIF FUNGAL occurrences with photos into PocketBase
// kingdomKey=5 (Fungi) — WITH IMAGE URLS (iNaturalist/GBIF media)
// Usage: PB_URL=http://host:8090 PB_ADMIN_EMAIL=x PB_ADMIN_PASSWORD=x MAX_RECORDS=500 node scripts/gbif-seed.js

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "";
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "";
const GBIF_URL = "https://api.gbif.org/v1/occurrence/search";
const GBIF_LIMIT = 300;
const GBIF_DELAY_MS = 200;
const PB_BATCH_SIZE = 50;
const PB_BATCH_DELAY_MS = 300;
const BOT_EMAIL = "gbif@biocorredor-mr.local";
const MAX_RECORDS = parseInt(process.env.MAX_RECORDS || "500", 10);

const AR_LAT_MIN = -56, AR_LAT_MAX = -21, AR_LNG_MIN = -74, AR_LNG_MAX = -52;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pbToken = "";
async function pbAuth() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`PB auth ${res.status}: ${await res.text()}`);
  pbToken = (await res.json()).token;
}
async function pbReq(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json", Authorization: pbToken } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${PB_URL}${path}`, opts);
}

async function getBotId() {
  let res = await pbReq("GET", `/api/collections/users/records?filter=(email='${BOT_EMAIL}')&fields=id`);
  if (res.ok) { const d = await res.json(); if (d.items?.length) return d.items[0].id; }
  res = await pbReq("POST", "/api/collections/users/records", {
    email: BOT_EMAIL, password: "Gb1f_B0t_2024!xK9$mZ", passwordConfirm: "Gb1f_B0t_2024!xK9$mZ",
    name: "GBIF Import Bot", verified: true,
  });
  if (!res.ok) throw new Error(`Bot create failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

async function deleteExisting() {
  let deleted = 0, page = 1;
  while (true) {
    const res = await pbReq("GET", `/api/collections/sightings/records?filter=(status='gbif_import')&perPage=500&fields=id&page=${page}`);
    if (!res.ok) break;
    const data = await res.json();
    if (!data.items?.length) break;
    await Promise.all(data.items.map(item => pbReq("DELETE", `/api/collections/sightings/records/${item.id}`).then(r => { if (r.ok) deleted++; })));
    console.log(`  Deleted ${deleted}...`);
    if (data.items.length < 500) break;
    page++;
    await sleep(200);
  }
  return deleted;
}

function isValidCoord(lat, lng) {
  return lat != null && lng != null && typeof lat === "number" && typeof lng === "number" &&
    !isNaN(lat) && !isNaN(lng) && lat >= AR_LAT_MIN && lat <= AR_LAT_MAX && lng >= AR_LNG_MIN && lng <= AR_LNG_MAX;
}

function extractImage(record) {
  const media = record.media || [];
  for (const m of media) {
    if (m.identifier && (m.type === "StillImage" || (m.format || "").startsWith("image"))) {
      return m.identifier;
    }
  }
  return "";
}

async function fetchGBIF() {
  const all = [];
  let offset = 0, total = Infinity, page = 0, skipped = 0, withImg = 0;

  while (offset < total && all.length < MAX_RECORDS) {
    page++;
    const data = await (await fetch(`${GBIF_URL}?${new URLSearchParams({
      country: "AR", kingdomKey: "5", hasCoordinate: "true",
      mediaType: "STILL_IMAGE",
      limit: String(Math.min(GBIF_LIMIT, 300)),
      offset: String(offset),
    })}`).then(r => { if (!r.ok) throw new Error(`GBIF ${r.status}`); return r.json(); }));
    total = data.count || 0;
    const results = data.results || [];

    for (const r of results) {
      if (!isValidCoord(r.decimalLatitude, r.decimalLongitude)) { skipped++; continue; }
      if ((r.kingdom || "").toLowerCase() !== "fungi") { skipped++; continue; }
      const img = extractImage(r);
      if (img) withImg++;
      all.push(r);
      if (all.length >= MAX_RECORDS) break;
    }
    offset += results.length;
    console.log(`  Page ${page}: ${all.length}/${MAX_RECORDS} (${withImg} w/img, ${skipped} skipped) — total: ${total}`);
    if (results.length === 0) break;
    await sleep(GBIF_DELAY_MS);
  }
  console.log(`  Final: ${all.length} Fungi (${withImg} with images)`);
  return all;
}

function mapRecord(r, botId) {
  const imgUrl = extractImage(r);
  return {
    user: botId,
    mushroom_name: r.species || r.scientificName || "Desconocido",
    description: [
      r.species && `Especie: ${r.species}`,
      r.genus && `Género: ${r.genus}`,
      r.family && `Familia: ${r.family}`,
      r.recordedBy && `Observador: ${r.recordedBy}`,
      r.eventDate && `Fecha: ${r.eventDate}`,
    ].filter(Boolean).join("\n") || "Sin descripción",
    toxicity: "Desconocido",
    lat: r.decimalLatitude,
    lng: r.decimalLongitude,
    status: "gbif_import",
    network_id: `gbif_${r.key || r.gbifID}`,
    habitat: r.habitat || "",
    features: r.lifeStage || "",
    images: [],
    gbif_image_url: imgUrl,
    kingdom: r.kingdom || "Fungi",
    phylum: r.phylum || "",
    taxon_class: r.class_ || "",
    taxon_order: r.order || "",
    family: r.family || "",
    genus: r.genus || "",
    species: r.species || "",
    taxon_rank: r.taxonRank || "",
    country: "Argentina",
    state_province: r.stateProvince || "",
    locality: r.locality || "",
    event_date: r.eventDate || "",
    basis_of_record: r.basisOfRecord || "",
    occurrence_status: r.occurrenceStatus || "",
    dataset_name: r.datasetName || "",
    recorded_by: r.recordedBy || "",
    identified_by: r.identifiedBy || "",
    catalog_number: r.catalogNumber || "",
    collection_code: r.collectionCode || "",
    institution_code: r.institutionCode || "",
    individual_count: r.individualCount || 0,
    gbif_id: String(r.key || r.gbifID || ""),
    publisher: r.publishingOrg || r.datasetName || "",
  };
}

async function importBatch(records, botId) {
  const sightings = records.map(r => mapRecord(r, botId));
  let created = 0, errors = 0;
  for (let i = 0; i < sightings.length; i += PB_BATCH_SIZE) {
    const batch = sightings.slice(i, i + PB_BATCH_SIZE);
    process.stdout.write(`  Batch ${Math.floor(i/PB_BATCH_SIZE)+1}/${Math.ceil(sightings.length/PB_BATCH_SIZE)} (${batch.length})...`);
    const results = await Promise.allSettled(batch.map(s =>
      pbReq("POST", "/api/collections/sightings/records", s)
        .then(async res => { if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`); return res.json(); })
    ));
    for (const r of results) { if (r.status === "fulfilled") created++; else { errors++; if (errors <= 3) console.error(`    Error: ${r.reason?.message}`); } }
    console.log(` ✓${created} ✗${errors}`);
    if (i + PB_BATCH_SIZE < sightings.length) await sleep(PB_BATCH_DELAY_MS);
  }
  return { created, errors };
}

async function main() {
  console.log("=== GBIF Fungi Seed (kingdomKey=5, mediaType=STILL_IMAGE) ===\n");
  console.log("[1/6] Auth..."); await pbAuth(); console.log("  ✓\n");
  console.log("[2/6] Bot..."); const botId = await getBotId(); console.log(`  ✓ ${botId}\n`);
  console.log("[3/6] Delete existing..."); const del = await deleteExisting(); console.log(`  ✓ ${del} deleted\n`);
  console.log(`[4/6] Fetch ${MAX_RECORDS} Fungi with images...`);
  const records = await fetchGBIF();
  if (!records.length) { console.log("No records. Aborting."); return; }
  console.log();
  const phyla = {}; records.forEach(r => { const p = r.phylum||"?"; phyla[p] = (phyla[p]||0)+1; });
  console.log("[5/6] Validation:");
  Object.entries(phyla).sort((a,b) => b[1]-a[1]).forEach(([p,c]) => console.log(`  ${p}: ${c}`));
  console.log(`  Coords valid: ${records.every(r => isValidCoord(r.decimalLatitude, r.decimalLongitude)) ? "✓" : "✗"}\n`);
  console.log("[6/6] Import...");
  const { created, errors } = await importBatch(records, botId);
  console.log(`\n✓ Done: ${created} created, ${errors} errors`);
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
