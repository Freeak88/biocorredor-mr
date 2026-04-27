#!/usr/bin/env node
// weather-backfill.js — Fetch weather for recent sightings (last 2 months)
// Fixed: properly check success before error

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "";
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "";
const DELAY_MS = 800;
const BATCH_SIZE = 10;

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const OPEN_METEO_ELEVATION = "https://api.open-meteo.com/v1/elevation";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pbToken = "";
async function pbAuth() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`PB auth ${res.status}`);
  pbToken = (await res.json()).token;
}
async function pbReq(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json", Authorization: pbToken } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${PB_URL}${path}`, opts);
}

async function fetchWeatherForSighting(lat, lng, dateStr) {
  if (!dateStr || !lat || !lng) return null;

  let sightingDate;
  if (dateStr.includes("T")) {
    sightingDate = new Date(dateStr);
  } else {
    sightingDate = new Date(dateStr + "T12:00:00");
  }
  if (isNaN(sightingDate.getTime())) return null;

  const twoMonthsAgo = new Date(Date.now() - 60 * 86400000);
  if (sightingDate < twoMonthsAgo) {
    return { skipped: true, reason: "date_too_old" };
  }

  const endDate = sightingDate.toISOString().split("T")[0];
  const startDate = new Date(sightingDate.getTime() - 10 * 86400000)
    .toISOString()
    .split("T")[0];

  const isRecent = Date.now() - sightingDate.getTime() < 16 * 86400000;
  const base = isRecent ? OPEN_METEO_FORECAST : OPEN_METEO_ARCHIVE;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: startDate,
    end_date: endDate,
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_hours",
      "relative_humidity_2m_max",
      "wind_speed_10m_max",
    ].join(","),
    timezone: "auto",
  });

  try {
    const [weatherRes, elevRes] = await Promise.all([
      fetch(`${base}?${params}`),
      fetch(`${OPEN_METEO_ELEVATION}?latitude=${lat}&longitude=${lng}`),
    ]);

    if (!weatherRes.ok) return { skipped: false, error: `http_${weatherRes.status}` };
    const weatherData = await weatherRes.json();
    const elevation = (elevRes.ok ? await elevRes.json() : null)?.elevation?.[0] ?? 0;
    const daily = weatherData?.daily;

    if (!daily?.time || daily.time.length === 0) {
      return { skipped: false, error: "no_daily_data" };
    }

    const days = daily.time.map((date, i) => ({
      date,
      temp_min: daily.temperature_2m_min?.[i] ?? 0,
      temp_max: daily.temperature_2m_max?.[i] ?? 0,
      precipitation_mm: daily.precipitation_sum?.[i] ?? 0,
      humidity_max: daily.relative_humidity_2m_max?.[i] ?? 0,
      wind_max: daily.wind_speed_10m_max?.[i] ?? 0,
    }));

    const totalPrecip = days.reduce((s, d) => s + d.precipitation_mm, 0);
    const rainyDays = days.filter((d) => d.precipitation_mm > 0.5).length;

    return {
      location: { lat, lng, elevation },
      days_before: days,
      summary: {
        avg_temp: Math.round(days.reduce((s, d) => s + (d.temp_min + d.temp_max) / 2, 0) / days.length * 10) / 10,
        total_precip_mm: Math.round(totalPrecip * 10) / 10,
        rainy_days: rainyDays,
        avg_humidity: Math.round(days.reduce((s, d) => s + d.humidity_max, 0) / days.length),
        avg_wind: Math.round(days.reduce((s, d) => s + d.wind_max, 0) / days.length * 10) / 10,
      },
      fetched_at: new Date().toISOString(),
    };
  } catch (e) {
    return { skipped: false, error: e.message || String(e) };
  }
}

async function main() {
  console.log("=== Weather Backfill (last 2 months) ===\n");

  console.log("[1/3] Auth...");
  await pbAuth();
  console.log("  ✓\n");

  console.log("[2/3] Fetching recent sightings...");
  const allSightings = [];
  let page = 1;
  while (true) {
    const res = await pbReq("GET", `/api/collections/sightings/records?perPage=500&page=${page}&sort=-id`);
    const data = await res.json();
    if (!data.items?.length) break;

    const twoMonthsAgo = new Date(Date.now() - 60 * 86400000);
    const candidates = data.items.filter(s => {
      if (!s.event_date) return false;
      const date = new Date(s.event_date);
      return !isNaN(date.getTime()) && date >= twoMonthsAgo;
    });

    allSightings.push(...candidates);
    console.log(`  Page ${page}: ${data.items.length} total, ${candidates.length} recent`);
    if (data.items.length < 500) break;
    page++;
  }
  console.log(`\nTotal to process: ${allSightings.length}\n`);

  console.log("[3/3] Fetching weather...");
  let done = 0, skipped = 0, errors = 0;
  const skipReasons = {};

  for (const s of allSightings) {
    const result = await fetchWeatherForSighting(s.lat, s.lng, s.event_date);

    if (result?.skipped) {
      skipped++;
      skipReasons[result.reason || "unknown"] = (skipReasons[result.reason] || 0) + 1;
    } else if (result?.summary) {
      // Success!
      const updateRes = await pbReq("PATCH", `/api/collections/sightings/records/${s.id}`, {
        weather_context: result,
        elevation: result.location.elevation,
      });
      if (!updateRes.ok) {
        errors++;
        if (errors <= 5) console.error(`    Update error ${s.id}: ${updateRes.status} ${await updateRes.text()}`);
      }
      done++;
    } else if (result?.error) {
      errors++;
      if (errors <= 5) console.error(`    Weather error ${s.id}: ${result.error}`);
    } else {
      errors++;
      if (errors <= 5) console.error(`    Unknown error ${s.id}: no data`);
    }

    if ((done + skipped + errors) % 20 === 0 || done + skipped + errors === allSightings.length) {
      process.stdout.write(`  ${done}/${allSightings.length} (skip: ${skipped} err: ${errors})\n`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n✓ Done: ${done} updated`);
  console.log(`⊗ Skipped: ${skipped}`);
  console.log("  Skip reasons:");
  for (const [reason, count] of Object.entries(skipReasons)) {
    console.log(`    ${reason}: ${count}`);
  }
  if (errors > 0) console.log(`✗ Errors: ${errors}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
