# BioCorredor MR — QA temporal OpenEarthMap / Road

Estado: corrida temporal completa; QA visual multifecha **APROBADO COMO PRIOR TEMPORAL**; persistencia numérica calculada y QA visual de esa capa pendiente
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

## 7. Persistencia/aparición temporal contra 2026

Script: `scripts/analyze-road-temporal-persistence.py`.

Método:
- referencia espacial/estado actual: `2026-01-11`;
- input: `Road argmax` de las cinco fechas;
- matching hacia atrás con tolerancia espacial diferenciada por fecha según QA de registro;
- radios usados: 2016=`2 px`, 2020=`4 px`, 2022=`1 px`, 2023=`1 px`, 2026=`1 px`.

Métricas de clase sobre Productivo:

| Clase temporal | fracción Productivo |
|---|---:|
| `persistent_pre2020` | 0.011775 |
| `new_2022_2023_candidate` | 0.021155 |
| `new_2026_candidate` | 0.007543 |
| `intermittent_or_disappeared` | 0.013740 |
| `uncertain` | 0.001491 |

Lectura sobre la red detectada en 2026:
- con soporte pre-2020: **28.59%**;
- primer soporte en 2022/2023: **51.37%**;
- sólo soportada en 2026: **18.32%**.

Esto es compatible con una expansión importante de la red vial observable posterior a 2020, pero **todavía no se acepta como `internal_road_score` final**. Falta revisar `road-temporal-overlay-2026.jpg` para comprobar que las clases temporales se alineen con calles/corredores reales y que `intermittent_or_disappeared` concentre señales agrícolas o inestables en vez de red válida omitida por el modelo en alguna fecha.

Gate actual de esta subcapa: **MÉTRICAS PASS / QA VISUAL PENDIENTE**.

## 8. GPU / runtime

Workstation Windows con AMD RX 6700 XT:
- `torch-directml` detecta `privateuseone:0`;
- Mask2Former/Swin no es estable en DirectML actual;
- `aten::roll` cae a CPU y luego el backend DML aborta con error nativo de broadcast;
- para este checkpoint, `--device auto` queda deliberadamente forzado a CPU para evitar crashes.

Esto no invalida el modelo. Sólo impide acelerarlo con este backend/arquitectura.

## 9. Decisión actual

- **Fine-tuning: POSTERGADO.** No es necesario todavía.
- **OpenEarthMap Road: PASS como prior semántico y temporal.**
- **Persistencia temporal: métricas generadas; QA visual final pendiente.**
- **V4 corridor: mantener como feature geométrica auxiliar.**
- **Earthwork: mantener como feature temporal auxiliar.**
- Próximo objetivo: cerrar QA visual de la persistencia y, si pasa, construir `internal_road_score` híbrido antes de agregar por parcela.

## 10. Próximo gate

Revisar `tmp/territorial-analysis/cluster-02-history/road-temporal-persistence/road-temporal-overlay-2026.jpg`.

El gate debe verificar:
1. que `persistent_pre2020` corresponda mayormente a corredores efectivamente antiguos;
2. que `new_2022_2023_candidate` represente expansión visible en ese período;
3. que `new_2026_candidate` no sea dominado por ruido radiométrico o bordes agrícolas;
4. que `intermittent_or_disappeared` concentre señales no persistentes/agrícolas y no calles válidas perdidas por una fecha;
5. que `uncertain` quede acotado.

Si pasa, la siguiente versión debe combinar semántica temporal + continuidad/corredor V4 + earthwork y recién después derivar `internal_road_score` por parcela Productivo.

No desplegar esta capa todavía.
