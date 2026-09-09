# QA de features parcelarias piloto — Cluster 2

Estado: **PASS COMO SCHEMA PILOTO; SCORE NO CALIBRADO**.
Scope: **Productivo únicamente, dentro de la cobertura VHR real de Cluster 2**.

## Objetivo

Integrar en una sola fila por parcela la evidencia ya validada del piloto: corredores internos V5, cronología de emergencia vial, crecimiento de ocupación/cubiertas, `Pavement` y series OpenEarthMap 2016→2026.

La tabla es un primer schema de agregación física. No es todavía `physical_loteo_score`, no mide porcentaje loteado y no tiene interpretación administrativa, comercial o legal.

## Resultado

Cinco parcelas madre priorizadas quedaron integradas sin pérdida de la semántica temporal y con `coverage_status=observed_cluster02`.

| Partida | Área GeoARBA actual | Emergencia vial | Despegue ocupación | Perfil | score piloto |
|---|---:|---|---|---|---:|
| `003017527` | 100,595.49 m² | 2020→2022 | 2022→2023 | road first then occupation | 0.7616 |
| `003076135` | 30,999.44 m² | 2016→2020 | 2020→2022 | road first then occupation | 0.7410 |
| `003017519` | 101,078.31 m² | 2020→2022 | 2020→2022 | coupled road and occupation | 0.7313 |
| `003017516` | 101,042.40 m² | 2022→2023 | 2023→2026 | road first then occupation | 0.5778 |
| `003139476` | 90,332.93 m² | 2022→2023 | 2023→2026 | road first then occupation | 0.5297 |

## Lectura del ranking

El orden es coherente como **ranking de intensidad/convergencia de evidencia física**, pero no debe interpretarse como orden jurídico ni necesariamente como orden cronológico.

- `003017527` combina gran longitud de red interna, profundidad dentro de parcela, fuerte salto vial 2020→2022 y consolidación edilicia posterior.
- `003076135` tiene una cronología más temprana y mayor ocupación 2026, aunque menor escala parcelaria y menor soporte reciente de los segmentos priorizados.
- `003017519` es el caso más claro de transición acoplada calle + ocupación en un mismo intervalo, aunque el score piloto la ubica debajo de los dos anteriores por la fórmula actual.
- `003017516` y `003139476` presentan transformación más tardía y menor ocupación 2026, por lo que quedan lógicamente por debajo.

Esto confirma que el score piloto mezcla **magnitud, persistencia y convergencia**, no sólo fecha de aparición.

## Gate

**PASS** para:
- usar el schema como contrato de features parcelarias;
- expandir la agregación a todas las parcelas Productivo efectivamente observadas por Cluster 2;
- mantener cronología y magnitud como variables separadas.

**NO PASS** para:
- adoptar `physical_transformation_evidence_score_pilot` como score final;
- extrapolar estos cinco casos a las 520 parcelas;
- imputar cero a parcelas sin cobertura equivalente;
- convertir el ranking en porcentaje loteado, venta, aprobación, incumplimiento o ilegalidad.

## Siguiente gate

Construir una tabla para **todas las parcelas Productivo con píxeles realmente observados dentro del raster Cluster 2**, calculando por parcela:

- superficie Productivo observada proxy;
- fracción `Road`, `Building`, `Pavement` por fecha;
- soporte histórico sobre el footprint vial V5 2026 cuando exista;
- longitud/profundidad de corredores internos cuando exista;
- `coverage_status` explícito;
- sin score final.

Las parcelas del universo Productivo fuera de cobertura quedan conceptualmente `not_observed`, nunca `0`.
