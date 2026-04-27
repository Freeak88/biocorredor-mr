#!/usr/bin/env node
// weather-backfill-simple.js — Test script for first 20 records
const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "";
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "";

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
  console.log("=== Simple Weather Backfill Test ===\n");

  console.log("[1/3] Getting first 20 GBIF records...");
  const res = await pbReq("GET", "/api/collections/sightings/records?filter=(status='gbif_import')&perPage=20&sort=-id&fields=id,lat,lng,event_date,network_id");
  const data = await res.json();
  const items = data.items || [];
  console.log(`  Got ${items.length} items\n`);

  console.log("[2/3] Processing...");
  let done = 0, errors = 0;

  for (const s of items) {
    if (!s.event_date) {
      console.log(`  Skipping ${s.network_id}: no event_date`);
      continue;
    }
    try {
      // GBIF dates: "2026-01-17 20:09:22.000Z" (space instead of T)
      // Split on first space to get just the date part
      const datePart = s.event_date.split(' ')[0];
      const sightingDate = new Date(datePart);
      const startDate = new Date(sightingDate.getTime() - 10 * 86400000).toISOString().split('T')[0];
      const endDate = datePart;

      const [weatherRes, elevRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lng}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,relative_humidity_2m_max,wind_speed_10m_max&timezone=auto`),
        fetch(`https://api.open-meteo.com/v1/elevation?latitude=${s.lat}&longitude=${s.lng}`)
      ]);

      const weatherData = await weatherRes.json();
      const elevation = (elevRes.ok ? await elevRes.json() : null)?.elevation?.[0] ?? 0;
      const daily = weatherData?.daily;

      if (!daily?.time || daily.time.length === 0) {
        console.log(`  ${s.network_id}: no weather data`);
        errors++;
        continue;
      }

      const weatherCtx = {
        location: { lat: s.lat, lng: s.lng, elevation },
        days_before: daily.time.map((date, i) => ({
          date,
          temp_min: daily.temperature_2m_min?.[i] ?? 0,
          temp_max: daily.temperature_2m_max?.[i] ?? 0,
          precipitation_mm: daily.precipitation_sum?.[i] ?? 0,
          humidity_max: daily.relative_humidity_2m_max?.[i] ?? 0,
          wind_max: daily.wind_speed_10m_max?.[i] ?? 0,
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
        console.log(`  ${s.network_id}: update failed ${updateRes.status}`);
        errors++;
      } else {
        console.log(`  ${s.network_id}: ✓`);
        done++;
      }
    } catch (e) {
      console.error(`  ${s.network_id}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n✓ Done: ${done}, ✗ Errors: ${errors}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
