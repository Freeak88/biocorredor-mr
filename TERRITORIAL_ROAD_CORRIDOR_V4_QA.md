# BioCorredor MR — QA Road Corridor V4

Estado: revisión visual completada
Scope: **Productivo only**
Branch: `feature/validacion-territorial`

## 1. Objetivo de V4

La V4 reemplaza el enfoque de línea Hough puntual por una señal de **corredor vial de ancho finito**, buscando continuidad espacial y penalizando textura/estructura local para reducir bordes de techos e invernaderos.

Outputs evaluados para cuatro intervalos históricos:
- 2016-11-30 -> 2020-03-03
- 2020-03-03 -> 2022-03-01
- 2022-03-01 -> 2023-04-19
- 2023-04-19 -> 2026-01-11

## 2. Métricas V4

| Intervalo | earthwork fraction | corridor support | corridor final | componentes corridor |
|---|---:|---:|---:|---:|
| 2016 -> 2020 | 0.0254 | 0.2690 | 0.0114 | 66 |
| 2020 -> 2022 | 0.0265 | 0.2570 | 0.0107 | 66 |
| 2022 -> 2023 | 0.0267 | 0.2566 | 0.0099 | 194 |
| 2023 -> 2026 | 0.0255 | 0.2470 | 0.0100 | 145 |

## 3. Revisión visual

### Lo que mejora

- Recupera mejor que V3 algunos **trazados ortogonales y corredores internos visibles**.
- El detector ya no queda reducido a segmentos Hough aislados.
- La señal final se mantiene alrededor de ~1% del Productivo, sin el artefacto del ~4% forzado de V2.
- En sectores de subdivisión aparente aparecen segmentos cian coincidentes con parte de la trama vial observable.

### Problemas que siguen abiertos

- Persisten muchos falsos positivos en zonas residenciales densas: bordes de techos, construcciones, patios y elementos lineales internos.
- Vegetación lineal, bordes de arbolado y estructuras productivas todavía producen respuesta de corredor.
- En varios sectores agrícolas se detectan hileras o límites de cultivo como corredores.
- La cuadrícula vial visible no se reconstruye de forma suficientemente continua ni completa.
- La señal es útil como **feature auxiliar**, pero no como máscara final de calles ni para medir superficie vial.

## 4. Gate

- `earthwork`: **PARCIAL / feature auxiliar**.
- `road corridor V4`: **FAIL como detector final; PASS como feature candidata**.
- No convertir `corridor_fraction_productivo` en porcentaje de loteo o urbanización.
- No sumar todavía V4 directamente al `physical_loteo_score` sin validación humana / modelo semántico.

## 5. Decisión metodológica

No seguir iterando sólo con reglas morfológicas/thresholds.

El siguiente salto debe ser un **detector semántico de caminos/calles en VHR**, idealmente por fecha, y luego comparación temporal de esa capa. La lógica correcta pasa a ser:

```text
VHR por fecha
  -> segmentación semántica de road/highway
  -> confianza por píxel
  -> limpieza morfológica / conectividad
  -> red/corredores por fecha
  -> persistencia temporal
  -> aparición / expansión / consolidación
  -> agregación por parcela Productivo
```

Esto permite distinguir una calle persistente de un cambio agrícola transitorio.

## 6. Fuente de entrenamiento identificada

HOTOSM publicó `hotosm/vhr-highway-segmentation`, dataset VHR de carreteras/caminos con:
- 61,719 tiles;
- RGB 256x256;
- geometrías `highway` de OpenStreetMap;
- predominio de `residential`, `track`, `service`, `unclassified` y `path`;
- orientación explícita a extracción de caminos informales/no pavimentados en VHR.

Es especialmente relevante para BioCorredor MR porque el objetivo incluye trazados internos y calles de tierra, no sólo vías pavimentadas.

A la fecha de esta revisión, HOTOSM publica el dataset pero no un modelo oficial `dinov3s-highways` equivalente al de edificios. Por eso el siguiente experimento debe evaluar entrenamiento/fine-tuning de una cabeza de segmentación usando el mismo paradigma DINOv3/UperNet o el runtime de `hotosm/fAIr-models`.

## 7. Siguiente gate

Antes de entrenar a escala completa:
1. preparar un baseline reproducible de segmentación semántica de caminos;
2. validar con un subconjunto pequeño de `vhr-highway-segmentation`;
3. inferir sobre una sola fecha de Cluster 2;
4. comprobar visualmente si recupera la cuadrícula vial y reduce falsos positivos sobre techos/invernaderos;
5. sólo si pasa, correr las cinco fechas y construir persistencia temporal.

No desplegar esta capa todavía.
