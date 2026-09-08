# BioCorredor MR — QA temporal OpenEarthMap / Road

Estado: corrida temporal completa; QA visual multifecha pendiente
Scope: **Productivo only**
Branch: `feature/validacion-territorial`

## 1. Objetivo

Evaluar si `mfaytin/mask2former-satellite` entrenado sobre OpenEarthMap puede actuar como **prior semántico de caminos/calles** dentro del suelo Productivo, evitando por ahora fine-tuning local.

El modelo se usa como señal auxiliar. No convertir sus fracciones directamente en superficie urbanizada, loteada, vendida ni en conclusión jurídica.

## 2. Fechas procesadas

- 2016-11-30
- 2020-03-03
- 2022-03-01
- 2023-04-19
- 2026-01-11

Todas las inferencias usan mosaicos co-registrados en `tmp/territorial-analysis/cluster-02-history/registered-local` y recorte Productivo duro.

## 3. Métricas Road por fecha

| Fecha | Road argmax Productivo | prob. mean | p95 | p99 |
|---|---:|---:|---:|---:|
| 2016-11-30 | 0.005691 | 0.006710 | 0.000482 | 0.153129 |
| 2020-03-03 | 0.012365 | 0.015334 | 0.005634 | 0.737921 |
| 2022-03-01 | 0.025782 | 0.028604 | 0.056927 | 0.949284 |
| 2023-04-19 | 0.037848 | 0.040445 | 0.271200 | 0.979874 |
| 2026-01-11 | 0.041182 | 0.042433 | 0.317524 | 0.986998 |

La fracción `Road` por argmax aumenta de ~0.57% en 2016 a ~4.12% en 2026 dentro del Productivo del Cluster 2. Esa trayectoria es compatible con expansión/consolidación vial observable, pero **todavía no debe interpretarse causalmente** hasta cerrar QA visual multifecha y controlar sensibilidad radiométrica/domain shift entre escenas.

## 4. Contexto multiclase por fecha

| Fecha | Pavement | Road | Cropland | Building |
|---|---:|---:|---:|---:|
| 2016 | 0.023629 | 0.005691 | 0.249699 | 0.014948 |
| 2020 | 0.033137 | 0.012365 | 0.289104 | 0.014018 |
| 2022 | 0.058704 | 0.025782 | 0.146485 | 0.030851 |
| 2023 | 0.044955 | 0.037848 | 0.106251 | 0.058379 |
| 2026 | 0.097298 | 0.041182 | 0.089617 | 0.050000 |

La evolución conjunta de `Road`, `Pavement`, `Cropland` y `Building` es territorialmente plausible, pero las clases no son mediciones administrativas ni legales y pueden variar por condiciones de captura.

## 5. Gate 2023

QA visual 2023: **PASS como prior semántico de caminos, no como máscara final cruda**.

Fortalezas observadas:
- recupera gran parte de la cuadrícula vial real;
- detecta calles de tierra y corredores internos de baja consolidación;
- separa contexto `Cropland`, `Building`, `Pavement` y otras clases mejor que V4 heurístico.

Errores aún visibles:
- algunos límites parcelarios/alambrados;
- bordes lineales de cultivo;
- ciertos elementos vegetales lineales;
- trazos internos productivos que pueden confundirse con road.

## 6. GPU / runtime

Workstation Windows con AMD RX 6700 XT:
- `torch-directml` detecta `privateuseone:0`;
- Mask2Former/Swin no es estable en DirectML actual;
- `aten::roll` cae a CPU y luego el backend DML aborta con error nativo de broadcast;
- para este checkpoint, `--device auto` queda deliberadamente forzado a CPU para evitar crashes.

Esto no invalida el modelo. Sólo impide acelerarlo con este backend/arquitectura.

## 7. Decisión actual

- **Fine-tuning: POSTERGADO.** No es necesario todavía.
- **OpenEarthMap Road: PASS como prior semántico.**
- **V4 corridor: mantener como feature geométrica auxiliar.**
- **Earthwork: mantener como feature temporal auxiliar.**
- Próximo objetivo: construir una capa temporal híbrida que mida **aparición, persistencia y consolidación** de trazas viales, no sólo una máscara independiente por fecha.

## 8. Próximo gate

Antes de derivar `internal_road_score` por parcela:
1. revisar visualmente `road-overlay.jpg` de 2016, 2020, 2022 y 2026;
2. comprobar que el aumento agregado corresponde a calles/corredores reales y no a cambio de radiometría o estilo de escena;
3. construir persistencia multifecha a partir de `Road probability`/argmax, con tolerancia espacial por registro;
4. distinguir `persistent_road`, `new_road_candidate`, `intermittent_linear_signal` y `uncertain`;
5. combinar luego con V4, earthwork y superficie cubierta;
6. sólo después agregar por parcela Productivo.

No desplegar esta capa todavía.
