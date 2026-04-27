// WeatherBadge.tsx — 3-window biological weather context for sighting popups
import { WeatherContext, weatherCodeText, moonPhaseText } from "../lib/weather";

interface Props {
  weather: WeatherContext | null | Record<string, any>;
}

function WindowRow({ label, emoji, w }: { label: string; emoji: string; w: any }) {
  if (!w) return null;
  return (
    <div className="flex items-start gap-1.5 text-[9px] font-sans text-atlas-ink/60">
      <span className="shrink-0">{emoji}</span>
      <div className="flex-1">
        <span className="font-bold text-atlas-ink/80">{label}</span>
        <span className="ml-1">{w.temp_avg}°C</span>
        <span className="ml-1">🌧 {w.total_precip_mm}mm</span>
        <span className="ml-1">💧 {w.avg_humidity}%</span>
        {w.rain_events > 0 && <span className="ml-1 text-emerald-700">({w.rain_events} lluvias)</span>}
        {w.dry_spell && <span className="ml-1 text-amber-600 font-bold">⚠ sequía</span>}
      </div>
    </div>
  );
}

export default function WeatherBadge({ weather }: Props) {
  if (!weather) return null;
  const w = weather as WeatherContext;
  if (!w.summary && !w.windows) return null;

  const { summary, location, days_before, windows, moon_window } = w;

  // Precipitation mini chart — full 14 days, color-coded by window
  const precipBars = days_before?.map((d, i) => {
    const h = Math.min(d.precipitation_mm * 4, 28);
    let color = "#d4d0c8"; // default gray
    if (d.precipitation_mm > 5) color = "#4a7c59";
    else if (d.precipitation_mm > 0) color = "#7ab386";

    // Window background tint
    let bgTint = "transparent";
    if (i < 7) bgTint = "rgba(74,124,89,0.06)";       // trigger
    else if (i < 11) bgTint = "rgba(42,142,42,0.08)";  // development
    else bgTint = "rgba(232,166,42,0.08)";             // maturation

    return (
      <div key={i} className="flex flex-col items-center" style={{ background: bgTint }}
        title={`${d.date}: ${d.precipitation_mm}mm, ${d.temp_min}-${d.temp_max}°C, ${weatherCodeText(d.weather_code)}`}>
        <div className="w-3 flex flex-col justify-end" style={{ height: 28 }}>
          <div className="w-full rounded-t-sm" style={{ height: h, background: color }} />
        </div>
        <span className="text-[5px] text-atlas-ink/30 mt-0.5">{d.date?.slice(8)}</span>
      </div>
    );
  });

  return (
    <div className="mt-2 pt-2 border-t border-atlas-ink/10">
      <p className="text-[8px] font-sans font-black text-atlas-earth uppercase tracking-widest mb-1.5">
        Contexto bioclimático ({days_before?.length || 14} días)
      </p>

      {/* 3-window methodology */}
      {windows && (
        <div className="space-y-1 mb-2">
          <WindowRow label="Disparo" emoji="💧" w={windows.trigger} />
          <WindowRow label="Desarrollo" emoji="🌱" w={windows.development} />
          <WindowRow label="Maduración" emoji="🍄" w={windows.maturation} />
        </div>
      )}

      {/* Precipitation mini chart — 14 days, window-tinted */}
      {days_before?.length > 0 && (
        <div className="flex items-end justify-between gap-0.5 px-0.5 rounded overflow-hidden border border-atlas-ink/5">
          {precipBars}
        </div>
      )}

      {/* Footer: elevation + moon */}
      <div className="flex items-center justify-between mt-1.5">
        {location?.elevation > 0 && (
          <span className="text-[9px] font-sans text-atlas-ink/40">⛰ {Math.round(location.elevation)}m snm</span>
        )}
        {moon_window?.sighting_night && (
          <span className="text-[9px] font-sans text-atlas-ink/40">
            🌙 {moonPhaseText(moon_window.sighting_night.moon_phase)} ({Math.round(moon_window.sighting_night.moon_illumination * 100)}%)
          </span>
        )}
      </div>
    </div>
  );
}
