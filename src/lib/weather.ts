// weather.ts — Open-Meteo + Sunrise-Sunset + WeatherAPI (moon phase) for FungiMap
// All APIs are free, no auth required

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const OPEN_METEO_ELEVATION = "https://api.open-meteo.com/v1/elevation";
const SUNRISE_SUNSET = "https://api.sunrise-sunset.org/json";
const WEATHERAPI_ASTRONOMY = "https://api.weatherapi.com/v1/astronomy.json";
const WEATHERAPI_KEY = "13e1173313aa42ab9d265233262704";

export interface DailyWeather {
  date: string;
  temp_min: number;
  temp_max: number;
  temp_avg: number;
  precipitation_mm: number;
  precipitation_hours: number;
  humidity_max: number;
  wind_max: number;
  weather_code: number;
}

export interface WeatherContext {
  location: { lat: number; lng: number; elevation: number };
  days_before: DailyWeather[];
  moon_phase?: MoonPhaseData;
  summary: {
    avg_temp: number;
    total_precip_mm: number;
    rainy_days: number;
    avg_humidity: number;
    avg_wind: number;
  };
  fetched_at: string;
}

export interface PhotoperiodData {
  date: string;
  sunrise: string;
  sunset: string;
  day_length_hours: number;
  solar_noon: string;
}

export interface MoonPhaseData {
  date: string;
  moon_phase: string;
  moon_illumination: number;
  moonrise: string;
  moonset: string;
  moonrise_local: string;
  moonset_local: string;
}

export async function fetchWeatherContext(
  lat: number,
  lng: number,
  sightingDate: string, // ISO date: "2026-04-27"
  daysBack: number = 10
): Promise<WeatherContext | null> {
  try {
    const sighting = new Date(sightingDate);
    const endDate = sighting.toISOString().split("T")[0];
    const startDate = new Date(sighting.getTime() - daysBack * 86400000)
      .toISOString()
      .split("T")[0];

    const isRecent =
      Date.now() - sighting.getTime() < 16 * 86400000;

    // Choose endpoint: forecast for recent, archive for historical
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
        "weather_code",
      ].join(","),
      timezone: "auto",
    });

    const [weatherRes, elevRes, moonRes] = await Promise.all([
      fetch(`${base}?${params}`),
      fetch(
        `${OPEN_METEO_ELEVATION}?latitude=${lat}&longitude=${lng}`
      ),
      fetchMoonPhase(lat, lng, endDate),
    ]);

    if (!weatherRes.ok) {
      console.error("Weather fetch failed:", weatherRes.status);
      return null;
    }

    const weatherData = await weatherRes.json();
    const elevData = elevRes.ok ? await elevRes.json() : null;
    const elevation = elevData?.elevation?.[0] ?? 0;

    const daily = weatherData.daily;
    if (!daily?.time) return null;

    const days: DailyWeather[] = daily.time.map(
      (date: string, i: number) => ({
        date,
        temp_min: daily.temperature_2m_min?.[i] ?? 0,
        temp_max: daily.temperature_2m_max?.[i] ?? 0,
        temp_avg:
          ((daily.temperature_2m_min?.[i] ?? 0) +
            (daily.temperature_2m_max?.[i] ?? 0)) /
          2,
        precipitation_mm: daily.precipitation_sum?.[i] ?? 0,
        precipitation_hours: daily.precipitation_hours?.[i] ?? 0,
        humidity_max: daily.relative_humidity_2m_max?.[i] ?? 0,
        wind_max: daily.wind_speed_10m_max?.[i] ?? 0,
        weather_code: daily.weather_code?.[i] ?? 0,
      })
    );

    const totalPrecip = days.reduce((s, d) => s + d.precipitation_mm, 0);
    const rainyDays = days.filter((d) => d.precipitation_mm > 0.5).length;

    return {
      location: { lat, lng, elevation },
      days_before: days,
      moon_phase: moonRes,
      summary: {
        avg_temp: days.reduce((s, d) => s + d.temp_avg, 0) / days.length,
        total_precip_mm: Math.round(totalPrecip * 10) / 10,
        rainy_days: rainyDays,
        avg_humidity:
          Math.round(
            days.reduce((s, d) => s + d.humidity_max, 0) / days.length
          ),
        avg_wind:
          Math.round(
            (days.reduce((s, d) => s + d.wind_max, 0) / days.length) * 10
          ) / 10,
      },
      fetched_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Weather context error:", err);
    return null;
  }
}

export async function fetchPhotoperiod(
  lat: number,
  lng: number,
  date: string
): Promise<PhotoperiodData | null> {
  try {
    const res = await fetch(
      `${SUNRISE_SUNSET}?lat=${lat}&lng=${lng}&date=${date}&formatted=0`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK") return null;
    const r = data.results;
    return {
      date,
      sunrise: r.sunrise,
      sunset: r.sunset,
      day_length_hours: Math.round((r.day_length / 3600) * 100) / 100,
      solar_noon: r.solar_noon,
    };
  } catch {
    return null;
  }
}

export async function fetchMoonPhase(
  lat: number,
  lng: number,
  date: string // ISO date: "2026-04-27"
): Promise<MoonPhaseData | null> {
  try {
    const params = new URLSearchParams({
      key: WEATHERAPI_KEY,
      q: `${lat},${lng}`,
      dt: date,
    });
    const res = await fetch(`${WEATHERAPI_ASTRONOMY}?${params}`);
    if (!res.ok) {
      console.error("WeatherAPI moon phase failed:", res.status);
      return null;
    }
    const data = await res.json();
    const astro = data.astronomy?.astro;
    if (!astro) return null;
    return {
      date,
      moon_phase: astro.moon_phase,
      moon_illumination: astro.moon_illumination,
      moonrise: astro.moonrise,
      moonset: astro.moonset,
      moonrise_local: astro.moonrise,
      moonset_local: astro.moonset,
    };
  } catch (err) {
    console.error("Moon phase error:", err);
    return null;
  }
}
export function weatherCodeText(code: number): string {
  const codes: Record<number, string> = {
    0: "Despejado",
    1: "Principalmente despejado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla con escarcha",
    51: "Llovizna ligera",
    53: "Llovizna moderada",
    55: "Llovizna intensa",
    61: "Lluvia ligera",
    63: "Lluvia moderada",
    65: "Lluvia fuerte",
    71: "Nevada ligera",
    73: "Nevada moderada",
    75: "Nevada fuerte",
    80: "Chubascos ligeros",
    81: "Chubascos moderados",
    82: "Chubascos fuertes",
    95: "Tormenta",
    96: "Tormenta con granizo",
    99: "Tormenta con granizo fuerte",
  };
  return codes[code] || `Código ${code}`;
}

// Moon phase to Spanish
export function moonPhaseText(phase: string): string {
  const phases: Record<string, string> = {
    "New Moon": "Luna nueva",
    "Waxing Crescent": "Creciente",
    "First Quarter": "Cuarto creciente",
    "Waxing Gibbous": "Gibosa creciente",
    "Full Moon": "Luna llena",
    "Waning Gibbous": "Gibosa menguante",
    "Last Quarter": "Cuarto menguante",
    "Waning Crescent": "Menguante",
  };
  return phases[phase] || phase;
}
