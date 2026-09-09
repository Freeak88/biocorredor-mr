# QA — contraste vial V5 vs morfología parcelaria GeoARBA

Estado: **NO APROBADO como clasificador de correspondencia catastral; útil como diagnóstico intermedio**.

Scope: Productivo únicamente dentro de la cobertura real de Cluster 2.
Fecha de referencia: 2026-01-11.

## Resultado

La primera versión de `scripts/analyze-road-cadastral-morphology.py` analizó 65 componentes HIGH+MEDIUM del `internal_road_score_v5` y obtuvo:

- fracción HIGH+MEDIUM dentro de Productivo Cluster 2: `0.03343684`;
- soporte morfológico catastral fuerte: `16.78%` de la señal detectada;
- transición: `4.87%`;
- baja correspondencia morfológica: `75.98%`;
- pequeño/incierto: `2.20%`;
- componentes clasificados como baja correspondencia: `24`.

## QA visual

El overlay muestra que una proporción importante de calles claramente consolidadas también queda clasificada en rojo (`low_cadastral_morphology_support`). Por lo tanto, la regla basada en diversidad parcelaria local + proximidad a límites no discrimina suficientemente entre:

1. calles consolidadas dentro de una trama parcelaria existente;
2. corredores físicos internos que atraviesan una parcela madre grande.

## Causa metodológica

El problema principal es clasificar componentes viales conectados completos. Una red puede atravesar muchas situaciones catastrales distintas y el contexto circular alrededor de todo el componente mezcla señales. Además, las capas GeoARBA disponibles son polígonos parcelarios actuales, no una capa autónoma de calles aprobadas.

## Decisión

No usar `low_cadastral_morphology_support_fraction_of_detected` como indicador administrativo ni como feature directa de loteo.

El siguiente método debe operar **por parcela**, no por red vial completa:

- cortar la señal HIGH+MEDIUM por cada polígono GeoARBA;
- detectar segmentos que penetran profundamente en el interior de una parcela;
- incorporar superficie de la parcela dominante;
- medir longitud interna, distancia a borde, señal temporal reciente y score V5;
- priorizar sólo corredores largos dentro de parcelas grandes y con soporte temporal.

La salida correcta se denomina `internal_road_within_mother_parcel_candidate` y significa únicamente: **corredor físico observable que atraviesa el interior de una parcela GeoARBA actual de tamaño suficiente**. No implica falta de aprobación, venta, irregularidad ni ilegalidad.
