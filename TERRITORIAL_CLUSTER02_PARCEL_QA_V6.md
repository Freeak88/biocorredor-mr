# Cluster 2 — Parcel QA V6

Fecha: 2026-09-08

Scope duro: sólo `Productivo` dentro de cobertura real de Cluster 2.

## Resultado agregado

Entrada: 74 parcelas observadas.

Estratos V6:

- `strong_convergent_candidate`: 5
- `intermediate_convergent_candidate`: 2
- `edge_access_or_perimeter_review`: 6
- `productive_pattern_review`: 0
- `occupation_only_review`: 38
- `negative_control`: 4
- `other_observed`: 12
- `partial_coverage_review`: 7

Muestra QA generada: 39 filas.

## Cambio respecto del esquema anterior

El estrato `intermediate_convergent_candidate` bajó de 4 a 2 después de incorporar guards de:

- fracción de señal vial pegada al borde (`edge_road_fraction`);
- penetración vial profunda (`deep_road_fraction`);
- longitud de skeleton vial interior;
- conectividad/junction proxy;
- `interior_network_score_v6`;
- proxy auxiliar de patrón productivo.

Aparece además un nuevo estrato explícito `edge_access_or_perimeter_review` con 6 casos que antes podían contaminar categorías convergentes.

## Interpretación provisional

La V6 mejora la separación morfológica y reduce candidatos intermedios, pero el gate NO está cerrado hasta identificar cuáles son los dos intermedios sobrevivientes y verificar que:

1. `003143927` permanezca como positivo al menos intermedio;
2. `003143929`, `003076134` y `003143931` hayan sido degradados;
3. `003017527` y `003017519` se mantengan fuertes;
4. no aparezcan promociones espurias nuevas.

`productive_pattern_review=0` no implica que no existan patrones productivos: el proxy todavía puede ser demasiado conservador y debe contrastarse con los falsos positivos visuales ya etiquetados.

## Regla de evidencia

Los estratos son exclusivamente de QA físico/territorial. No equivalen a loteado/no loteado, venta, subdivisión aprobada, incumplimiento, irregularidad o ilegalidad.
