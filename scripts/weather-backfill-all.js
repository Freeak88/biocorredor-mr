#!/usr/bin/env node
// weather-backfill-all.js — Fetch weather for ALL recent records
// Focus on success, skip problematic ones gracefully

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "";
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "";
const DELAY_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pbAuth() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  });
  return (await res.json()).token;
}
async function pbReq(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json", Authorization: await pbAuth() } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${PB_URL}${path}`, opts);
}

async function main() {
  console.log("=== Weather Backfill (All Recent) ===\n");
  await pbAuth();
  console.log("  ✓ Auth\n");

  console.log("[2/4] Fetching all recent records without weather...");
  const allSightings = [];
  let page = 1;

  while (true) {
    const res = await pbReq("GET", `/api/collections/sightings/records?perPage=500&page=${page}&sort=-id`);
    const data = await res.json();
    if (!data.items?.length) break;

    // Filter: no weather_context, has lat/lng, recent-ish
    const candidates = data.items.filter(s => {
      if (!s.event_date || !s.lat || !s.lng) return false;
      if (s.weather_context) return false;

      const datePart = s.event_date.split(' ')[0];
      const sightingDate = new Date(datePart);
      const twoMonthsAgo = new Date(Date.now() - 60 * 86400000);
      return sightingDate >= twoMonthsAgo;
    });

    allSightings.push(...candidates);
    console.log(`  Page ${page}: ${data.items.length} total, ${candidates.length} candidates`);
    if (data.items.length < 500) break;
    page++;
  }
  console.log(`\nTotal to process: ${allSightings.length}\n`);

  console.log("[3/4] Fetching weather...");
  let done = 0, skipped = 0, errors = 0;

  for (let i = 0; i < allSightings.length; i++) {
    const s = allSightings[i];
    const datePart = s.event_date.split(' ')[0];
    const sightingDate = new Date(datePart);
    const startDate = new Date(sightingDate.getTime() - 10 * 86400000).toISOString().split('T')[0];
    const endDate = datePart;

    try {
      const [weatherRes, elevRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lng}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,relative_humidity_2m_max,wind_speed_10m_max&timezone=auto`),
        fetch(`https://api.open-meteo.com/v1/elevation?latitude=${s.lat}&longitude=${s.lng}`)
      ]);

      const weatherData = await weatherRes.json();
      const elevation = (elevRes.ok ? await elevRes.json() : null)?.elevation?.[0] ?? 0;
      const daily = weatherData?.daily;

      if (!daily?.time || daily.time.length === 0) {
        if (errors < 3) console.log(`  ${s.network_id}: no weather data (date: ${s.event_date})`);
        errors++;
        continue;
      }

      const weatherCtx = {
        location: { lat: s.lat, lng: s.lng, elevation },
        days_before: daily.time.map((date, j) => ({
          date,
          temp_min: daily.temperature_2m_min?.[j] ?? 0,
          temp_max: daily.temperature_2m_max?.[j] ?? 0,
          precipitation_mm: daily.precipitation_sum?.[j] ?? 0,
          humidity_max: daily.relative_humidity_2m_max?.[j] ?? 0,
          wind_max: daily.wind_speed_10m_max?.[j] ?? 0,
        })),
        summary: {
          avg_temp: Math.round(daily.time.reduce((sum, d) => sum + (daily.temperature_2m_min?.[daily.time.indexOf(d)] + daily.temperature_2m_max?.[daily.time.indexOf(d)]) / 2, 0) / daily.time.length * 10) / 10,
        },
        fetched_at: new Date().toISOString(),
      };

      const updateRes = await pbReq("PATCH", `/api/collections/sightings/records/${s.id}`, {
        weather_context: weatherCtx,
        elevation,
      });

      if (!updateRes.ok) {
        if (errors < 3) console.error(`  ${s.network_id}: update failed ${updateRes.status}`);
        errors++;
      } else {
        done++;
      }
    } catch (e) {
      if (errors < 3) console.error(`  ${s.network_id}: ${e.message}`);
      errors++;
    }

    if ((done + skipped + errors) % 50 === 0 || done + skipped + errors === allSightings.length) {
      process.stdout.write(`  ${done}/${allSightings.length} (skip: ${skipped} err: ${errors})\n`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n✓ Done: ${done} updated`);
  console.log(`⊗ Skipped: ${skipped}`);
  if (errors > 0) console.log(`✗ Errors: ${errors}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
