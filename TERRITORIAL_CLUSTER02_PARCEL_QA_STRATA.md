# QA estratificado de parcelas — Cluster 2

Estado: **PASS como diseño de muestra para QA humano; no es un clasificador territorial final**.
Scope: **Productivo únicamente dentro de la cobertura real de Cluster 2**.

## Resultado

Sobre 74 parcelas Productivo observadas:

- `strong_convergent_candidate`: 5
- `intermediate_convergent_candidate`: 4
- `occupation_only_review`: 38
- `negative_control`: 4
- `other_observed`: 16
- `partial_coverage_review`: 7

La muestra humana resultante contiene 35 parcelas, con hasta 10 casos por estrato.

## Lectura metodológica

El resultado confirma que `Building takeoff` aislado es demasiado frecuente para operar como señal fuerte por sí sola: 38 parcelas caen en `occupation_only_review`. La calibración futura debe exigir convergencia entre varias señales, especialmente corredor vial persistente, morfología interna, cambio de ocupación/cubiertas y soporte de `Pavement`.

Los 5 casos fuertes son exactamente las parcelas madre que pasaron el QA temporal dirigido previo, lo que aporta consistencia interna al pipeline. Los 4 controles negativos son indispensables para estimar falsos positivos antes de construir `physical_loteo_score`.

Las 7 parcelas con cobertura parcial quedan fuera de la calibración primaria; cualquier métrica describe sólo la porción observada.

## Gate

**PASS** para generar paneles visuales temporales de la muestra y etiquetado humano.

No usar estos estratos como:
- loteado / no loteado;
- aprobado / no aprobado;
- superficie vendida;
- cumplimiento o incumplimiento del cupo;
- irregularidad o ilegalidad.

## Siguiente paso

Generar paneles temporales 2016/2020/2022/2023/2026 para las 35 parcelas de la muestra, conservar el límite GeoARBA actual y el footprint vial V5 2026 sólo como guía, y producir una plantilla de labels humanos separada de las features automáticas.

Labels mínimos propuestos:
- `physical_loteo_signal`: `yes|no|uncertain`
- `internal_roads_visible`: `yes|no|uncertain`
- `occupation_change_visible`: `yes|no|uncertain`
- `subdivision_pattern_visible`: `yes|no|uncertain`
- `confidence`: `low|medium|high`
- `notes`

La evaluación humana debe prevalecer sobre la estratificación automática para el QA de calibración.
