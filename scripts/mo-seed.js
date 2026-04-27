#!/usr/bin/env node
// mo-seed.js — Import Mushroom Observer data for Argentina into PocketBase
// Uses official CSV dumps per MO policy (no API scraping)
// Source: https://mushroomobserver.org/
// Input: /tmp/mo_argentina_obs.json (pre-processed from CSV dumps)

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "";
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "";
const MO_DATA = process.env.MO_DATA || "/tmp/mo_argentina_obs.json";
const PB_BATCH_SIZE = 50;
const PB_BATCH_DELAY_MS = 300;
const BOT_EMAIL = "mo-bot@fungimap.bot";

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
    email: BOT_EMAIL, password: "M0_B0t_2024!xK9$mZ", passwordConfirm: "M0_B0t_2024!xK9$mZ",
    name: "Mushroom Observer Bot", verified: true,
  });
  if (!res.ok) throw new Error(`Bot create failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

async function main() {
  console.log("=== Mushroom Observer Argentina Import ===\n");

  // Load pre-processed data
  const fs = await import("fs");
  const records = JSON.parse(fs.readFileSync(MO_DATA, "utf-8"));
  console.log(`[1/5] Loaded ${records.length} observations from ${MO_DATA}`);
  console.log(`  With images: ${records.filter(r => r.image_id).length}\n`);

  console.log("[2/5] Auth...");
  await pbAuth();
  console.log("  ✓\n");

  console.log("[3/5] Bot user...");
  const botId = await getBotId();
  console.log(`  ✓ ${botId}\n`);

  // Map MO records to PocketBase sighting format (same as GBIF)
  const sightings = records.map(r => {
    const imgUrl = r.image_id
      ? `https://images.mushroomobserver.org/640/${r.image_id}.jpg`
      : "";

    return {
      user: botId,
      mushroom_name: r.species || "Desconocido",
      description: [
        r.species && `Especie: ${r.species}`,
        r.genus && `Género: ${r.genus}`,
        r.family && `Familia: ${r.family}`,
        r.date && `Fecha: ${r.date}`,
        r.loc_name && `Ubicación: ${r.loc_name}`,
        `Fuente: Mushroom Observer #${r.id}`,
      ].filter(Boolean).join("\n"),
      toxicity: "Desconocido",
      lat: r.lat,
      lng: r.lng,
      status: "gbif_import",
      network_id: `mo_${r.id}`,
      habitat: "",
      features: "",
      images: [],
      gbif_image_url: imgUrl,
      kingdom: r.kingdom || "Fungi",
      phylum: r.phylum || "",
      taxon_class: r["class"] || "",
      taxon_order: r["order"] || "",
      family: r.family || "",
      genus: r.genus || "",
      species: r.species || "",
      taxon_rank: "",
      country: "Argentina",
      state_province: extractProvince(r.loc_name),
      locality: r.loc_name || "",
      event_date: r.date || "",
      basis_of_record: "HumanObservation",
      occurrence_status: "",
      dataset_name: "Mushroom Observer",
      recorded_by: "",
      identified_by: "",
      catalog_number: String(r.id),
      collection_code: "",
      institution_code: "",
      individual_count: 0,
      gbif_id: "",
      publisher: "Mushroom Observer",
    };
  });

  console.log("[4/5] Import to PocketBase...");
  let created = 0, errors = 0;
  for (let i = 0; i < sightings.length; i += PB_BATCH_SIZE) {
    const batch = sightings.slice(i, i + PB_BATCH_SIZE);
    const bn = Math.floor(i / PB_BATCH_SIZE) + 1;
    const tb = Math.ceil(sightings.length / PB_BATCH_SIZE);
    process.stdout.write(`  Batch ${bn}/${tb} (${batch.length})...`);
    const results = await Promise.allSettled(batch.map(s =>
      pbReq("POST", "/api/collections/sightings/records", s)
        .then(async res => { if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`); return res.json(); })
    ));
    for (const r of results) {
      if (r.status === "fulfilled") created++;
      else { errors++; if (errors <= 5) console.error(`\n    Error: ${r.reason?.message}`); }
    }
    console.log(` ✓${created} ✗${errors}`);
    if (i + PB_BATCH_SIZE < sightings.length) await sleep(PB_BATCH_DELAY_MS);
  }

  console.log(`\n✓ Done: ${created} created, ${errors} errors`);
}

function extractProvince(locName) {
  if (!locName) return "";
  const n = locName.toLowerCase();
  const provinces = [
    "tierra del fuego", "santa cruz", "chubut", "río negro", "rio negro",
    "neuquén", "neuquen", "la pampa", "buenos aires", "ciudad autónoma de buenos aires",
    "caba", "entre ríos", "entre rios", "santa fe", "córdoba", "cordoba",
    "san luis", "san luis", "mendoza", "misiones", "corrientes", "chaco",
    "formosa", "salta", "jujuy", "tucumán", "tucuman", "catamarca",
    "la rioja", "san juan", "santiago del estero",
  ];
  for (const p of provinces) {
    if (n.includes(p)) {
      // Title case
      return p.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  // Check for city names
  if (n.includes("bariloche")) return "Río Negro";
  if (n.includes("ushuaia")) return "Tierra del Fuego";
  if (n.includes("iguazu") || n.includes("obera")) return "Misiones";
  if (n.includes("mar del plata")) return "Buenos Aires";
  if (n.includes("el chaltén") || n.includes("el calafate")) return "Santa Cruz";
  return "";
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
