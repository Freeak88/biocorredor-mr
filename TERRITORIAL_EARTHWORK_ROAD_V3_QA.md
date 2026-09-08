# QA — Earthwork / Road candidatos V3

Fecha de revisión: 2026-09-08
Scope: **Productivo únicamente**
Cluster: 2
Entradas temporales co-registradas: 2016-11-30, 2020-03-03, 2022-03-01, 2023-04-19, 2026-01-11
Script evaluado: `scripts/generate-earthwork-road-candidates-v3.py`

## Resultado cuantitativo

| Intervalo | earthwork frac. Productivo | earthwork comp. | road eligible | road frac. Productivo | road comp. |
|---|---:|---:|---:|---:|---:|
| 2016→2020 | 0.0254 | 414 | 0.0088 | 0.0007 | 45 |
| 2020→2022 | 0.0265 | 444 | 0.0142 | 0.0012 | 68 |
| 2022→2023 | 0.0267 | 481 | 0.0099 | 0.0009 | 46 |
| 2023→2026 | 0.0255 | 629 | 0.0160 | 0.0013 | 95 |

La V3 corrigió el defecto principal de V2 en `road`: dejó de forzar ~4% del Productivo por percentil global y redujo la salida a 0.07–0.13% del scope.

## QA visual — earthwork

Estado: **PARCIAL / NO APROBADO COMO MÉTRICA FINAL**.

Hallazgos:
- reduce de forma importante el ruido respecto del cambio absoluto V1;
- concentra candidatos en zonas de suelo desnudo, pérdida de cobertura vegetal y cambios estructurales;
- conserva áreas plausibles de movimiento de suelo o preparación física;
- todavía responde fuertemente a manejo agrícola, cultivos en hileras, lotes roturados, cambios estacionales y algunas cubiertas/estructuras;
- por lo tanto, `earthwork_fraction_productivo` no puede interpretarse todavía como porcentaje de superficie efectivamente transformada por urbanización.

Decisión:
- usar V3 earthwork sólo como generador de candidatos y feature auxiliar;
- no agregar todavía sus píxeles al score jurídico ni a una superficie urbanizada;
- próxima iteración debe incorporar exclusión/penalización de patrones agrícolas y persistencia temporal.

## QA visual — road

Estado: **FAIL PARA DETECCIÓN DE CALLES / PASS SÓLO COMO GENERADOR MUY CONSERVADOR DE SEGMENTOS LINEALES**.

Hallazgos:
- la compuerta V3 eliminó el 4% artificial de V2;
- la máscara resultante es muy escasa;
- varios segmentos detectados corresponden a bordes de cubiertas, invernaderos, lotes cultivados o estructuras lineales no viales;
- al mismo tiempo se pierden tramos visualmente evidentes de la red de calles internas, especialmente en áreas con trazado ortogonal visible;
- Hough sobre bordes de la imagen nueva no es suficiente para modelar una calle como corredor de ancho finito y continuidad de red.

Decisión:
- `road_fraction_productivo` V3 no se usa como superficie ni como score final de calles;
- la siguiente iteración debe abandonar Hough como criterio principal y pasar a detección de **corredores**, con ancho, continuidad, baja vegetación y morfología de red;
- bordes de techos/invernaderos deben penalizarse o excluirse.

## Próximo gate

La próxima versión deberá cumplir simultáneamente:
1. detectar corredores de calle completos, no sólo bordes aislados;
2. recuperar visualmente los trazados ortogonales evidentes del Cluster 2;
3. reducir detecciones sobre invernaderos/cubiertas y hileras agrícolas;
4. conservar el scope Productivo duro;
5. usar persistencia temporal cuando exista fecha posterior para separar obra persistente de rotación agrícola;
6. mantener por separado `earthwork` y `internal_road`.

## Interpretación permitida

Estos resultados representan **candidatos de transformación física observable**. No demuestran loteo, aprobación, venta, irregularidad ni ilegalidad.
