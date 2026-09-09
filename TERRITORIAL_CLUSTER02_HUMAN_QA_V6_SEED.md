# Cluster 2 — QA humano semilla para V6

Fecha de consolidación: 2026-09-08

Scope duro: sólo parcelas `Productivo` realmente observadas dentro de Cluster 2.

## Objetivo

Usar revisión visual humana dirigida para detectar defectos de precisión/recall de la estratificación parcelaria antes de calibrar cualquier `physical_loteo_score`.

Los paneles muestran imágenes registradas 2016/2020/2022/2023/2026, límite GeoARBA actual y footprint vial V5 2026 como guía visual. El footprint magenta no implica que la calle existiera en fechas anteriores.

## Etiquetas visuales acumuladas

### Strong convergent candidate

- `003017527`: POSITIVO fuerte. Apertura/estructura vial interna + subdivisión física observable + crecimiento fuerte de ocupación desde 2020→2022.
- `003017519`: POSITIVO fuerte. Transición calle + ocupación muy marcada 2020→2022.

Resultado semilla observado: 2/2 positivos entre los strong revisados.

### Intermediate convergent candidate

- `003143929`: NEGATIVO para señal de loteo físico. Dominan invernaderos/cubiertas productivas; la señal vial se explica principalmente por borde/acceso.
- `003143927`: POSITIVO. Trama vial interna y ocupación/consolidación observables; parte de la ocupación es preexistente.
- `003076134`: NEGATIVO. Predomina acceso corto/perimetral; no hay red vial interna ni subdivisión física visible.
- `003143931`: NEGATIVO. Patrón productivo/invernaderos y señal vial lateral/perimetral, sin malla interna de loteo.

Resultado semilla observado: 1/4 positivos. Este estrato requiere recalibración.

### Occupation-only review

- `003069314`: NEGATIVO para loteo físico; parcela pequeña ya ocupada, sin transformación interna tipo loteo.
- `003069247`: NEGATIVO para loteo físico; ocupación estable/parcelaria pequeña, sin red interna.

Resultado semilla: 0/2 positivos para loteo físico. `Building takeoff` aislado no debe promover una parcela.

### Negative control

- `003000615`: NEGATIVO limpio.
- `003143937`: NEGATIVO limpio.
- `003100421`: NEGATIVO limpio.
- `003100423`: NEGATIVO limpio.

Resultado semilla: 4/4 controles negativos correctos.

### Other observed

- `003017518`: NEGATIVO; uso productivo/agrícola, sin trama interna.
- `003076133`: NEGATIVO; acceso puntual a vivienda/establecimiento.
- `003143928`: NEGATIVO; cobertura arbórea/productiva y señales perimetrales.
- `003143930`: NEGATIVO; establecimiento rural/productivo, sin malla interna.

Resultado semilla: 0/4 positivos; no se observaron falsos negativos evidentes en esta submuestra.

## Defectos identificados

1. El estrato intermedio sobrepromueve corredores que están pegados al borde parcelario.
2. Invernaderos/cubiertas productivas pueden aportar `Pavement`/`Building` semántico y contaminar la convergencia.
3. La señal positiva más discriminante visualmente es una red vial que penetra el interior parcelario y muestra longitud/conectividad coherente con subdivisión física.
4. `Building takeoff` aislado tiene baja especificidad.

## Decisión

Implementar V6 de estratificación QA incorporando:

- `edge_road_fraction` y penalización por perímetro;
- `deep_road_fraction`;
- longitud de skeleton vial interior;
- proxy de junctions/componentes internos;
- `interior_network_score_v6`;
- proxy productivo auxiliar basado en Cropland y componentes Building elongados.

No se modifican todavía las señales físicas V5 ni se crea un score final.

## Criterio de aceptación V6

Esperado sobre los casos semilla:

- preservar `003017527` y `003017519` como fuertes;
- preservar `003143927` como al menos candidato intermedio/positivo;
- degradar `003143929`, `003076134` y `003143931` fuera de intermedio convergente;
- mantener negativos/occupation-only sin promoción espuria.

Toda interpretación sigue siendo física/territorial. Ninguna etiqueta implica venta, aprobación, incumplimiento, irregularidad o ilegalidad.
