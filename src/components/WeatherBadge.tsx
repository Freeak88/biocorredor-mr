// WeatherBadge.tsx — Compact weather summary for sighting popups
import { WeatherContext, weatherCodeText, moonPhaseText } from "../lib/weather";

interface Props {
  weather: WeatherContext | null | Record<string, any>;
}

export default function WeatherBadge({ weather }: Props) {
  if (!weather) return null;
  const w = weather as WeatherContext;
  if (!w.summary) return null;

  const { summary, location, days_before } = w;
  const precipBars = days_before?.slice(-7).map((d, i) => {
    const h = Math.min(d.precipitation_mm * 4, 28);
    return (
      <div key={i} className="flex flex-col items-center" title={`${d.date}: ${d.precipitation_mm}mm, ${d.temp_min}-${d.temp_max}°C`}>
        <div className="w-3 flex flex-col justify-end" style={{ height: 28 }}>
          <div
            className="w-full rounded-t-sm"
            style={{
              height: h,
              background: d.precipitation_mm > 5 ? "#4a7c59" : d.precipitation_mm > 0 ? "#7ab386" : "#d4d0c8",
            }}
          />
        </div>
        <span className="text-[6px] text-atlas-ink/40 mt-0.5">{d.date?.slice(8)}</span>
      </div>
    );
  });

  return (
    <div className="mt-2 pt-2 border-t border-atlas-ink/10">
      <p className="text-[8px] font-sans font-black text-atlas-earth uppercase tracking-widest mb-1">
        Clima previo ({days_before?.length || 0} días)
      </p>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
          <span className="font-bold">Temp media:</span> {summary.avg_temp?.toFixed(1)}°C
        </p>
        <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
          <span className="font-bold">Lluvia total:</span> {summary.total_precip_mm}mm
        </p>
        <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
          <span className="font-bold">Días lluviosos:</span> {summary.rainy_days}/{days_before?.length}
        </p>
        <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
          <span className="font-bold">Humedad:</span> {summary.avg_humidity}%
        </p>
      </div>

      {/* Precipitation mini chart */}
      {days_before?.length > 0 && (
        <div className="flex items-end justify-between mt-1.5 gap-0.5 px-1">
          {precipBars}
        </div>
      )}

      {/* Elevation */}
      {location?.elevation > 0 && (
        <p className="text-[9px] font-sans text-atlas-ink/40 m-0 mt-1">
          ⛰ {Math.round(location.elevation)}m snm
        </p>
      )}

      {/* Moon Phase */}
      {w.moon_phase && (
        <p className="text-[9px] font-sans text-atlas-ink/40 m-0 mt-1">
          🌙 {moonPhaseText(w.moon_phase.moon_phase)} ({Math.round(w.moon_phase.moon_illumination * 100)}%)
        </p>
      )}
    </div>
  );
}
