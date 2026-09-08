# BioCorredor MR — QA temporal OpenEarthMap / Road

Estado: corrida temporal completa; QA visual multifecha **APROBADO COMO PRIOR TEMPORAL**
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

La fracción `Road` por argmax aumenta de ~0.57% en 2016 a ~4.12% en 2026 dentro del Productivo del Cluster 2. Esa trayectoria es compatible con expansión/consolidación vial observable, pero **no debe interpretarse causalmente ni como porcentaje loteado**.

## 4. Contexto multiclase por fecha

| Fecha | Pavement | Road | Cropland | Building |
|---|---:|---:|---:|---:|
| 2016 | 0.023629 | 0.005691 | 0.249699 | 0.014948 |
| 2020 | 0.033137 | 0.012365 | 0.289104 | 0.014018 |
| 2022 | 0.058704 | 0.025782 | 0.146485 | 0.030851 |
| 2023 | 0.044955 | 0.037848 | 0.106251 | 0.058379 |
| 2026 | 0.097298 | 0.041182 | 0.089617 | 0.050000 |

La evolución conjunta de `Road`, `Pavement`, `Cropland` y `Building` es territorialmente plausible, pero las clases no son mediciones administrativas ni legales y pueden variar por condiciones de captura.

## 5. QA visual 2023

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

## 6. QA visual multifecha 2016–2026

Gate visual multifecha: **PASS COMO PRIOR TEMPORAL**.

Lectura de los overlays:
- 2016 muestra una red interna muy limitada, con detecciones concentradas en corredores ya consolidados o accesos puntuales;
- 2020 incorpora algunos ejes nuevos y una primera expansión localizada hacia sectores con ocupación incipiente;
- 2022 muestra una ampliación clara de trazados internos ortogonales y redes de acceso en sectores que luego continúan ocupándose;
- 2023 consolida esa red y recupera buena parte de las grillas viales visibles;
- 2026 mantiene gran parte de los corredores detectados previamente y agrega/fortalece otros, especialmente en sectores de expansión reciente.

La comparación visual favorece la hipótesis de **aparición y persistencia real de infraestructura vial observable**, no sólo un cambio radiométrico global entre escenas. Aun así, algunos falsos positivos agrícolas/parcelarios siguen presentes y deben tratarse como señal incierta.

Decisión:
- la tendencia temporal agregada se acepta como evidencia física auxiliar;
- `Road argmax` por fecha no se convierte directamente en superficie vial final;
- la siguiente capa debe medir persistencia/aparición con tolerancia espacial por registro y separar señales intermitentes;
- fine-tuning local continúa postergado.

## 7. GPU / runtime

Workstation Windows con AMD RX 6700 XT:
- `torch-directml` detecta `privateuseone:0`;
- Mask2Former/Swin no es estable en DirectML actual;
- `aten::roll` cae a CPU y luego el backend DML aborta con error nativo de broadcast;
- para este checkpoint, `--device auto` queda deliberadamente forzado a CPU para evitar crashes.

Esto no invalida el modelo. Sólo impide acelerarlo con este backend/arquitectura.

## 8. Decisión actual

- **Fine-tuning: POSTERGADO.** No es necesario todavía.
- **OpenEarthMap Road: PASS como prior semántico y temporal.**
- **V4 corridor: mantener como feature geométrica auxiliar.**
- **Earthwork: mantener como feature temporal auxiliar.**
- Próximo objetivo: construir una capa temporal híbrida que mida **aparición, persistencia y consolidación** de trazas viales.

## 9. Próximo gate

Script preparado: `scripts/analyze-road-temporal-persistence.py`.

Debe:
1. usar `road-argmax.png` de las cinco fechas ya inferidas;
2. aplicar tolerancia espacial diferenciada por calidad de co-registro;
3. usar 2026 como referencia de estado actual;
4. distinguir, como mínimo:
   - `persistent_pre2020`
   - `new_2022_2023_candidate`
   - `new_2026_candidate`
   - `intermittent_or_disappeared`
   - `uncertain`
5. generar overlay y QA numérico;
6. pasar QA visual antes de combinar con V4, earthwork o agregar por parcela.

No desplegar esta capa todavía.
