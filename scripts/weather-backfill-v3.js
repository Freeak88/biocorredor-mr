#!/usr/bin/env node
// weather-backfill-v3.js — 3-window bioclimatic backfill for all records
// Uses PocketBase REST API with admin auth
// Methodology: Trigger (D-14→D-8), Development (D-7→D-4), Maturation (D-3→D-0)

const PB_URL = "http://10.0.3.9:8090";
const WEATHERAPI_KEY = "13e1173313aa42ab9d265233262704";
const PER_PAGE = 50;
const DELAY_MS = 350; // Rate limit safety

// ── PocketBase helpers ──
let authToken = null;
async function pbAuth() {
  if (authToken) return authToken;
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: "backfill@fungimap.ar", password: "fungimap2025" }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  authToken = (await res.json()).token;
  return authToken;
}

async function pbGet(path) {
  const token = await pbAuth();
  const res = await fetch(`${PB_URL}${path}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return res.json();
}

async function pbPatch(collection, id, body) {
  const token = await pbAuth();
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`  PATCH failed (${res.status}): ${err.substring(0, 200)}`);
    return null;
  }
  return res.json();
}

// ── Weather fetching ──
async function fetchWeather(lat, lng, dateStr) {
  const sighting = new Date(dateStr);
  const endDate = sighting.toISOString().split("T")[0];
  const startDate = new Date(sighting.getTime() - 14 * 86400000).toISOString().split("T")[0];

  const isRecent = Date.now() - sighting.getTime() < 16 * 86400000;
  const base = isRecent
    ? "https://api.open-meteo.com/v1/forecast"
    : "https://archive-api.open-meteo.com/v1/archive";

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: startDate,
    end_date: endDate,
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,relative_humidity_2m_max,wind_speed_10m_max,weather_code",
    timezone: "auto",
  });

  const [weatherRes, elevRes] = await Promise.all([
    fetch(`${base}?${params}`),
    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`),
  ]);

  if (!weatherRes.ok) throw new Error(`Weather ${weatherRes.status}`);
  const weatherData = await weatherRes.json();
  const elevData = elevRes.ok ? await elevRes.json() : null;
  const elevation = elevData?.elevation?.[0] ?? 0;
  const daily = weatherData.daily;
  if (!daily?.time?.length) return null;

  const days = daily.time.map((date, i) => ({
    date,
    temp_min: daily.temperature_2m_min?.[i] ?? 0,
    temp_max: daily.temperature_2m_max?.[i] ?? 0,
    temp_avg: ((daily.temperature_2m_min?.[i] ?? 0) + (daily.temperature_2m_max?.[i] ?? 0)) / 2,
    precipitation_mm: daily.precipitation_sum?.[i] ?? 0,
    precipitation_hours: daily.precipitation_hours?.[i] ?? 0,
    humidity_max: daily.relative_humidity_2m_max?.[i] ?? 0,
    wind_max: daily.wind_speed_10m_max?.[i] ?? 0,
    weather_code: daily.weather_code?.[i] ?? 0,
  }));

  return { days, elevation };
}

async function fetchMoon(lat, lng, dateStr) {
  const date = dateStr.split("T")[0].split(" ")[0];
  try {
    const params = new URLSearchParams({
      key: WEATHERAPI_KEY,
      q: `${lat},${lng}`,
      dt: date,
    });
    const res = await fetch(`https://api.weatherapi.com/v1/astronomy.json?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const astro = data.astronomy?.astro;
    if (!astro) return null;
    return {
      date,
      moon_phase: astro.moon_phase,
      moon_illumination: parseFloat(astro.moon_illumination) / 100,
      moonrise: astro.moonrise,
      moonset: astro.moonset,
    };
  } catch {
    return null;
  }
}

// ── Window calculation ──
function calcWindow(slice) {
  if (!slice.length) return null;
  const totalP = slice.reduce((s, d) => s + d.precipitation_mm, 0);
  const rainEvents = slice.filter(d => d.precipitation_mm > 2).length;
  let maxDry = 0, curDry = 0;
  slice.forEach(d => {
    if (d.precipitation_mm < 0.5) { curDry++; maxDry = Math.max(maxDry, curDry); } else { curDry = 0; }
  });
  return {
    temp_avg: Math.round(slice.reduce((s, d) => s + d.temp_avg, 0) / slice.length * 10) / 10,
    temp_min: Math.round(Math.min(...slice.map(d => d.temp_min)) * 10) / 10,
    temp_max: Math.round(Math.max(...slice.map(d => d.temp_max)) * 10) / 10,
    total_precip_mm: Math.round(totalP * 10) / 10,
    rainy_days: slice.filter(d => d.precipitation_mm > 0.5).length,
    rain_events: rainEvents,
    avg_humidity: Math.round(slice.reduce((s, d) => s + d.humidity_max, 0) / slice.length),
    avg_wind: Math.round(slice.reduce((s, d) => s + d.wind_max, 0) / slice.length * 10) / 10,
    dry_spell: maxDry >= 7,
  };
}

// ── Main ──
async function main() {
  console.log("=== Weather Backfill v3 — 3-Window Methodology ===\n");

  // Get total count of records without weather
  const countRes = await pbGet("/api/collections/sightings/records?perPage=1&fields=id&filter=(weather_context=null)");
  const total = countRes.totalItems || 0;
  console.log(`Records without weather: ${total}`);

  if (total === 0) {
    console.log("All records have weather context. Nothing to do.");
    return;
  }

  const totalPages = Math.ceil(total / PER_PAGE);
  let processed = 0, success = 0, skipped = 0, errors = 0;

  for (let page = 1; page <= totalPages; page++) {
    console.log(`\n--- Page ${page}/${totalPages} ---`);
    const data = await pbGet(`/api/collections/sightings/records?perPage=${PER_PAGE}&page=${page}&filter=(weather_context=null)&sort=id&fields=id,lat,lng,event_date,status,network_id`);

    if (!data.items?.length) {
      console.log("  No more items.");
      break;
    }

    for (const s of data.items) {
      processed++;

      // Skip if no date or no coords
      if (!s.event_date || !s.lat || !s.lng) {
        console.log(`  [${processed}/${total}] SKIP ${s.network_id || s.id}: no date/coords`);
        skipped++;
        continue;
      }

      const dateStr = s.event_date;
      const shortId = (s.network_id || s.id).substring(0, 25);

      try {
        // Fetch weather (14 days)
        const weather = await fetchWeather(s.lat, s.lng, dateStr);
        if (!weather) {
          console.log(`  [${processed}/${total}] ✗ ${shortId}: no weather data`);
          errors++;
          await sleep(DELAY_MS);
          continue;
        }

        const { days, elevation } = weather;

        // Calculate 3 windows
        const trigger = calcWindow(days.slice(0, 7));
        const development = calcWindow(days.slice(7, 11));
        const maturation = calcWindow(days.slice(11));

        // Summary
        const totalPrecip = days.reduce((s, d) => s + d.precipitation_mm, 0);
        const summary = {
          avg_temp: Math.round(days.reduce((s, d) => s + d.temp_avg, 0) / days.length * 10) / 10,
          total_precip_mm: Math.round(totalPrecip * 10) / 10,
          rainy_days: days.filter(d => d.precipitation_mm > 0.5).length,
          avg_humidity: Math.round(days.reduce((s, d) => s + d.humidity_max, 0) / days.length),
          avg_wind: Math.round(days.reduce((s, d) => s + d.wind_max, 0) / days.length * 10) / 10,
        };

        // Build weather context
        const weatherContext = {
          location: { lat: s.lat, lng: s.lng, elevation },
          days_before: days,
          windows: { trigger, development, maturation },
          summary,
          fetched_at: new Date().toISOString(),
        };

        // Fetch moon phase (only for records from 2020+, saves API calls)
        const recordYear = new Date(dateStr).getFullYear();
        if (recordYear >= 2020) {
          const moon = await fetchMoon(s.lat, s.lng, dateStr);
          if (moon) {
            weatherContext.moon_phase = moon;
            weatherContext.moon_window = {
              sighting_night: moon,
              full_moon_days: moon.moon_illumination > 0.9 ? 1 : 0,
              waxing_days: moon.moon_phase?.includes("Waxing") ? 1 : 0,
              waning_days: moon.moon_phase?.includes("Waning") ? 1 : 0,
              avg_illumination: moon.moon_illumination,
            };
          }
        }

        // Update PocketBase
        const result = await pbPatch("sightings", s.id, {
          weather_context: weatherContext,
          elevation,
        });

        if (result) {
          success++;
          const t = trigger, d = development, m = maturation;
          console.log(`  [${processed}/${total}] ✓ ${shortId}: 🌧${t?.total_precip_mm || 0}+${d?.total_precip_mm || 0}+${m?.total_precip_mm || 0}mm | ${t?.temp_avg || 0}→${d?.temp_avg || 0}→${m?.temp_avg || 0}°C | ${Math.round(elevation)}m`);
        } else {
          errors++;
        }

      } catch (err) {
        console.error(`  [${processed}/${total}] ✗ ${shortId}: ${err.message}`);
        errors++;
      }

      await sleep(DELAY_MS);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Success:   ${success}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Errors:    ${errors}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
