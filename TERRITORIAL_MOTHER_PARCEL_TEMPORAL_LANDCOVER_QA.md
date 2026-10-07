# QA temporal multi-clase — parcelas madre candidatas (Cluster 2)

Estado: **PASS como evidencia temporal auxiliar y prior de cronología física**.
Scope: **Productivo únicamente, dentro de la cobertura real de Cluster 2**.

## Objetivo

Cuantificar la trayectoria 2016→2026 de cinco parcelas madre priorizadas por corredor vial interno V5, usando OpenEarthMap como evidencia semántica auxiliar para `Road`, `Building`, `Pavement`, `Cropland` y soporte de la red vial 2026 sobre cada fecha histórica.

Este QA no fecha aprobación, subdivisión, venta ni irregularidad. Sólo ayuda a ordenar **cuándo se vuelve observable una transformación física**.

## Resultado principal

La serie confirma cinco perfiles temporales coherentes con los paneles visuales dirigidos:

| Partida | Área actual GeoARBA | Primer soporte vial >=0.35 | Lectura temporal principal |
|---|---:|---|---|
| `003076135` | 30,999.44 m² | 2020 | traza vial temprana 2016→2020; ocupación/cubiertas despegan 2020→2022 |
| `003017519` | 101,078.31 m² | 2022 | transición física muy fuerte 2020→2022: calles + cubiertas + pavement |
| `003017527` | 100,595.49 m² | 2022 | transición fuerte 2020→2022; consolidación edilicia continúa 2022→2026 |
| `003017516` | 101,042.40 m² | 2023 | soporte vial débil hasta 2022; consolidación clara 2022→2023 y posterior |
| `003139476` | 90,332.93 m² | 2023 | trazas emergentes en 2022 y soporte vial claro en 2023; ocupación más tardía |

Superficie conjunta de estas cinco parcelas actuales: **424,048.57 m² (42.404857 ha)**. Esto no es superficie loteada ni superficie imputable a cupo; es sólo el conjunto piloto priorizado.

## Evidencia por parcela

### Partida 003076135
- soporte vial sobre footprint 2026: `0.2534` (2016) → `0.5736` (2020) → `0.7172` (2022) → `0.8419` (2023) → `1.0` (2026);
- `Building`: `0` → `0.0181` → `0.0842` → `0.1473` → `0.1689`;
- `Pavement`: `0` → `0.0491` → `0.1306` → `0.1345` → `0.1912`.

Lectura: corredor/acceso ya parcialmente reconocible en 2016 y claramente establecido para 2020. La ocupación física observable crece con fuerza entre 2020 y 2022 y continúa consolidándose.

### Partida 003017519
- soporte vial: `0` → `0.2108` → `0.7722` → `0.8723` → `1.0`;
- `Building`: `0.0004` en 2020 → `0.0464` en 2022 → `0.0822` en 2023 → `0.1019` en 2026;
- `Pavement`: `0.0025` en 2020 → `0.0766` en 2022.

Lectura: es uno de los casos más fuertes de **transformación física observable 2020→2022**, con aparición conjunta de red vial y ocupación/cubiertas.

### Partida 003017527
- soporte vial: `0.0035` (2020) → `0.6600` (2022) → `0.8252` (2023) → `1.0`;
- `Building`: `0.0026` → `0.0303` → `0.0710` → `0.0987`;
- `Pavement`: `0.0154` → `0.1143` entre 2020 y 2022.

Lectura: transformación fuerte 2020→2022, seguida por consolidación edilicia sostenida 2022→2026.

### Partida 003017516
- soporte vial: `0.0058` (2020) → `0.1951` (2022) → `0.8882` (2023) → `1.0`;
- `Building`: `0` (2020) → `0.0042` (2022) → `0.0104` (2023) → `0.0190` (2026);
- `Pavement`: `0.0085` (2022) → `0.0318` (2023) → `0.0537` (2026).

Lectura: el salto vial principal se vuelve claro entre 2022 y 2023. La ocupación observable es menor que en 003017519/003017527, pero crece de forma consistente.

### Partida 003139476
- soporte vial: `0` (2020) → `0.3009` (2022) → `0.8852` (2023) → `1.0`;
- `Building`: muy bajo hasta 2023 (`~0.0032`), luego `0.0128` en 2026;
- `Pavement`: `0.0091` (2022) → `0.0397` (2026).

Lectura: apertura/trama vial emergente hacia 2022 y claramente reconocible en 2023; ocupación/cubiertas posteriores y todavía relativamente bajas en 2026.

## Advertencias metodológicas

1. Las fracciones de `Cropland` son muy sensibles a radiometría, estación, manejo productivo y dominio del modelo; no deben usarse como evidencia directa de desaparición de actividad agrícola.
2. OpenEarthMap no es ground truth. Sus clases son un prior semántico que debe leerse junto a los paneles históricos, GeoARBA, registro espacial y otras señales.
3. El `first_date_road_support_ge_threshold` es la primera fecha en que el modelo supera un umbral operativo sobre el footprint vial 2026. No es fecha jurídica ni necesariamente fecha exacta de apertura.
4. La imagen 2020 tiene menor confianza de registro que 2022/2026; cambios finos requieren prudencia.

## Gate

**PASS** para usar estas métricas en una cronología física de candidatos y para priorizar revisión por parcela.

No usar todavía para:
- porcentaje loteado;
- superficie vendida;
- cumplimiento/incumplimiento de cupo;
- estado administrativo o legal.

## Próximo paso

Derivar, de forma reproducible, dos hitos distintos por parcela:

- `road_emergence_interval`: primer intervalo en que el soporte vial cruza el umbral operativo;
- `occupation_takeoff_interval`: intervalo con mayor incremento positivo de `Building`.

Conservar ambos por separado para evitar confundir **apertura vial** con **ocupación/consolidación posterior**.
