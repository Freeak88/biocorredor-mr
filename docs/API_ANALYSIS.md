# FungiMap — Análisis de APIs Públicas

**Fecha:** 2026-04-27
**Fuente:** [public-apis/public-apis](https://github.com/public-apis/public-apis)

---

## 🔴 PRIORIDAD 1 — Core (implementar primero)

### 1. Open-Meteo — Clima pasado + pronóstico + suelo
- **URL:** https://open-meteo.com/
- **Auth:** ❌ Ninguna (gratis, sin API key)
- **Endpoints probados:**
  - `/v1/forecast` — 16 días pasados + pronóstico actual
  - `/v1/archive` (ERA5) — histórico hasta 1950
  - `/v1/elevation` — altitud por coordenadas
- **Variables relevantes:**
  - `temperature_2m_max/min` — temperatura aire
  - `precipitation_sum` / `precipitation_hours` — lluvia
  - `relative_humidity_2m_max` — humedad relativa
  - `soil_moisture_0_to_7cm` — humedad suelo (m³/m³)
  - `soil_temperature_0_to_7cm` — temperatura suelo
  - `wind_speed_10m_max` — viento
- **Uso FungiMap:** Al registrar un avistamiento, consultar automáticamente los 10 días previos de clima en esa coordenada. Guardar como `weather_context` en el registro.
- **Modelo:** Con ~500+ avistamientos cruzados con clima, se puede entrenar un modelo simple que prediga probabilidad de fructificación por especie.

### 2. Sunrise-Sunset — Fotoperiodo
- **URL:** https://sunrise-sunset.org/api
- **Auth:** ❌ Ninguna
- **Datos:** horas de luz solar, amanecer, atardecer, noon solar
- **Uso FungiMap:** Los hongos responden a cambios en fotoperiodo. Cruce con datos de fructificación.
- **Resultado test:** ✅ Funciona para Argentina

### 3. Open-Meteo Elevation — Altitud
- **URL:** https://api.open-meteo.com/v1/elevation
- **Auth:** ❌ Ninguna
- **Uso FungiMap:** Enriquecer cada avistamiento con altitud automática. Muchas especies tienen rango altitudinal definido.
- **Resultado test:** ✅ Funciona (-34.6,-58.4 → 23m, -27.4,-55.9 → 110m, -54.8,-68.6 → 220m)

---

## 🟡 PRIORIDAD 2 — Alto valor (requiere API key gratuita)

### 4. IUCN Red List — Estado de conservación
- **URL:** https://apiviv3.iucnredlist.org/
- **Auth:** `apiKey` (gratuita para investigación)
- **Uso FungiMap:** Flag de especies amenazadas en el mapa. Marcar avistamientos de especies raras/protegidas.
- **Dato clave:** Categoría de amenaza (CR, EN, VU, NT, LC) por especie fúngica.

### 5. WeatherAPI — Fase lunar + astronomía
- **URL:** https://www.weatherapi.com/
- **Auth:** `apiKey` (free tier generoso)
- **Uso FungiMap:** Fase lunar. La sabiduría popular dice que los hongos fructifican en luna llena. Con datos reales se puede validar o refutar esta creencia.
- **Extra:** Geolocalización IP, forecast, historial.

### 6. ITIS — Taxonomía estandarizada
- **URL:** https://www.itis.gov/ws_description.html
- **Auth:** ❌ Ninguna
- **Uso FungiMap:** Validar nombres científicos ingresados por usuarios. Resolver sinónimos. Normalizar la taxonomía contra un estándar global.

---

## 🟢 PRIORIDAD 3 — Complementario (valor agregado)

### 7. iDigBio — Specimenes de museo
- **URL:** https://github.com/idigbio/idigbio-search-api/wiki
- **Auth:** ❌ Ninguna
- **Uso FungiMap:** Registros de museos/herbarios. Complementa GBIF con especímenes físicos preservados. Datos de tipo (type specimens).

### 8. BreezoMeter Pollen — Condiciones de esporas
- **URL:** https://docs.breezometer.com/api-documentation/pollen-api/v2/
- **Auth:** `apiKey` (commercial, trial disponible)
- **Uso FungiMap:** Datos de polen/esporas en el aire. Correlación con temporada de fructificación. Podría predecir "época de hongos".

### 9. OpenAQ — Calidad del aire
- **URL:** https://docs.openaq.org/
- **Auth:** `apiKey` (gratuita)
- **Uso FungiMap:** Contaminación afecta micorrizas y hongos del suelo. Cruce con biodiversidad fúngica urbana vs rural.

### 10. datos.gob.ar — Datos abiertos Argentina
- **URL:** https://datos.gob.ar/
- **Auth:** ❌ Ninguna
- **Uso FungiMap:** Datos de INTA, parcelas agrícolas, uso de suelo. Cruce con tipo de cultivo = tipo de hongo micorrícico esperado.

---

## 💡 Oportunidades que detectaste vs las que no

### Tu idea: Clima 10 días previos → fructificación
**Validada ✅** — Open-Meteo da exactamente eso gratis:
- 10-16 días de forecast inverso
- Histórico completo hasta 1950
- Humedad de suelo (ERA5) + temperatura suelo
- Todo sin API key

### Oportunidades nuevas que no detectaste:

**A) 🌙 Fase Lunar y Fructificación**
La creencia popular dice "hongos en luna llena". Nadie lo validó con datos masivos. FungiMap puede ser el primero. WeatherAPI da fase lunar por coordenada/fecha.

**B) ⛰️ Altitud Automática por Coordenada**
Cada especie tiene rango altitudinal. Con Open-Meteo Elevation, enriquecemos cada avistamiento sin que el usuario ingrese nada. Permite mapas de distribución altitudinal por especie.

**C) 🕐 Fotoperiodo y Estacionalidad**
Sunrise-Sunset API permite calcular horas exactas de luz para cualquier coordenada+fecha. Cruce con fructificación por especie → modelo fenológico.

**D) 🔬 Validación Taxonómica Automática**
ITIS permite verificar que el nombre científico que ingresa el usuario (o que detecta Gemini) sea válido y actualizado. Evita sinónimos y errores de clasificación.

**E) 🛡️ Especies Amenazadas (IUCN)**
Marcar en el mapa si un avistamiento corresponde a una especie en peligro. Alerta de conservación. Diferenciador frente a cualquier app competidora.

**F) 🌱 Humedad de Suelo (ERA5)**
Open-Meteo tiene datos de humedad y temperatura del suelo a 7cm de profundidad. Esto es más relevante que la lluvia superficial para hongos hipogeos y micelio.

**G) 🏙️ Calidad del Aire → Biodiversidad Urbana**
Áreas con más contaminación tienen menos diversidad fúngica. Con OpenAQ se puede generar un "índice de salud micológica" por zona.

---

## 📊 Plan de implementación sugerido

| Fase | API | Esfuerzo | Impacto |
|------|-----|----------|---------|
| **1** | Open-Meteo (clima + suelo + elevación) | 2h | 🔴 Crítico |
| **1** | Sunrise-Sunset (fotoperiodo) | 30min | 🟡 Alto |
| **2** | WeatherAPI (fase lunar) | 1h | 🟡 Alto |
| **2** | ITIS (validación taxonómica) | 2h | 🟡 Alto |
| **3** | IUCN (conservación) | 1h | 🟢 Medio |
| **3** | iDigBio (museos) | 2h | 🟢 Medio |
| **4** | BreezoMeter (esporas) | 2h | 🟢 Medio |
| **4** | OpenAQ (aire) | 1h | 🟢 Bajo |

---

## 🔑 Keys necesarias

| API | Key necesaria? | Cómo obtener |
|-----|---------------|--------------|
| Open-Meteo | ❌ No | — |
| Sunrise-Sunset | ❌ No | — |
| Open-Meteo Elevation | ❌ No | — |
| ITIS | ❌ No | — |
| iDigBio | ❌ No | — |
| GBIF | ❌ No | Ya en uso |
| IUCN | ✅ Sí | https://apiv3.iucnredlist.org/ (gratuita investigación) |
| WeatherAPI | ✅ Sí | https://www.weatherapi.com/signup.aspx (free tier) |
| BreezoMeter | ✅ Sí | Trial comercial |
| OpenAQ | ✅ Sí | https://explore.openaq.org/ (gratuita) |
