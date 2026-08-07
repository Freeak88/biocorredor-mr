# Modelo mínimo de muestreo

## Propósito

El Bloque B agrega la mínima estructura metodológica necesaria para que una jornada de campo pueda declarar qué ambiente se recorrió, con qué unidad y con qué esfuerzo. El modelo no calcula índices ni reemplaza la curaduría posterior.

## Entidades

- **Stratum**: ambiente o sector metodológico estable, por ejemplo `MR-PAS` (Pastizal) o `MR-HUM` (Humedal). Puede tener geometría GeoJSON, pero la captura offline no depende de ella.
- **Sampling unit**: unidad concreta dentro de un estrato, por ejemplo `MR-PAS-T01`. Declara tipo, selección, réplica y dimensiones cuando corresponda.
- **Survey event**: jornada activa del equipo. Vincula protocolo, modo de inventario, estrato, unidad, diseño, método, esfuerzo, observadores, inicio y cierre.
- **Occurrence**: observación perteneciente a una jornada. Conserva nombre de campo, nombre científico y, cuando sea útil, `morphospecies_code` sin sobrescribir ninguna identificación.

## Catálogos offline

El fallback precarga en IndexedDB cuatro estratos (`MR-PAS`, `MR-HUM`, `MR-MON`, `MR-ECO`) y unidades de ejemplo (`MR-PAS-T01`, `MR-PAS-T02`, `MR-HUM-P01`, `MR-MON-R01`). Son registros de catálogo editables/preloadables, no valores hardcodeados dentro de la jornada.

## Metodología

`inventory_mode` distingue `opportunistic` de `standardized`. El diseño admite `opportunistic`, `random`, `stratified`, `systematic` y `fixed`. Los métodos normalizados son `free_search`, `transect`, `plot`, `fixed_point`, `acoustic_point` y `other`. El esfuerzo usa valor más unidad: minutos, minutos-observador, metros, kilómetros, metros cuadrados, puntos u otro.

Una jornada estandarizada solicita estrato, unidad, método y esfuerzo en la interfaz. El esquema permite borradores incompletos offline para no perder una captura ante una falla, pero conserva siempre inicio y, al cerrar, fin y estado local. Una jornada oportunista puede no tener unidad.

## Evidencia e identificación

La evidencia reutiliza `evidence_type`: `visual`, `photo`, `auditory`, `visual_auditory`, `audio`, `trace`, `nest` u `other`. No se agrega `detection_method`. `morphospecies_code` es opcional y sirve para agrupar material todavía no identificado, sin convertirlo en nombre científico.

## Alcance deliberadamente excluido

Este bloque no implementa índices, análisis estadístico, integraciones GBIF/iNaturalist/Merlin, escaneo QR por cámara, `paper_record`, sincronización remota ni exportación ZIP completa del backend. El `paper_id` directo y el fallback offline de A.1 permanecen compatibles.


## Contrato canónico de esfuerzo

La lista única es `minutes`, `observer_minutes`, `meters`, `kilometers`, `square_meters`, `points`, `point_minutes`, `other`.

| Unidad | Significado |
|---|---|
| `minutes` | Duración cronológica del evento. |
| `observer_minutes` | Suma del tiempo de observación de todos los observadores. |
| `meters` | Distancia lineal relevada en metros. |
| `kilometers` | Distancia lineal relevada en kilómetros. |
| `square_meters` | Superficie relevada en metros cuadrados. |
| `points` | Cantidad de puntos o unidades puntuales relevados. |
| `point_minutes` | Puntos multiplicados por su duración. |
| `other` | Unidad extraordinaria documentada en `sampling_effort_notes`. |

Los aliases históricos inequívocos `kilometres` y `square_metres` se normalizan a sus formas canónicas. `observer_minutes` y `point_minutes` se conservan sin conversión. `sampling_effort_value/unit` describe el esfuerzo normalizado y no reemplaza `duration_minutes`, `distance_m`, `area_m2` u `observers_count`.
