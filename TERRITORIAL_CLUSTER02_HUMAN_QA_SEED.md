# QA humano inicial — Cluster 2

Estado: **PASS parcial para extremos; estrato intermedio requiere refinamiento antes de calibrar score**.
Scope: **Productivo únicamente dentro de la cobertura real de Cluster 2**.

## Muestra revisada

Se revisaron visualmente 8 paneles temporales 2016/2020/2022/2023/2026, con límite GeoARBA actual y footprint vial V5 2026 como guía visual.

### Fuertes

- `003017527` — `strong_convergent_candidate`
  - `physical_loteo_signal=yes`
  - `internal_roads_visible=yes`
  - `occupation_change_visible=yes`
  - `subdivision_pattern_visible=yes`
  - confianza: `high`
  - lectura: transformación física muy clara entre 2020 y 2022 y consolidación posterior.

- `003017519` — `strong_convergent_candidate`
  - `physical_loteo_signal=yes`
  - `internal_roads_visible=yes`
  - `occupation_change_visible=yes`
  - `subdivision_pattern_visible=yes`
  - confianza: `high`
  - lectura: caso muy fuerte de transición acoplada vial + ocupación 2020→2022.

Resultado preliminar del estrato fuerte: **2/2 positivos visuales**.

### Intermedios

- `003143929` — `intermediate_convergent_candidate`
  - `physical_loteo_signal=no`
  - `internal_roads_visible=no`
  - `occupation_change_visible=yes`
  - `subdivision_pattern_visible=no`
  - confianza: `high`
  - lectura: predominan invernaderos/cubiertas productivas y un corredor en borde; no se observa patrón convincente de calle interna + subdivisión.

- `003143927` — `intermediate_convergent_candidate`
  - `physical_loteo_signal=yes`
  - `internal_roads_visible=yes`
  - `occupation_change_visible=yes`
  - `subdivision_pattern_visible=yes`
  - confianza: `high`
  - lectura: existen trazas internas y ocupación incipiente ya en 2016, con fuerte consolidación 2016→2020 y densificación posterior.

Resultado preliminar del estrato intermedio: **1/2 positivos visuales**. La muestra es demasiado pequeña para fijar precision, pero revela un falso positivo productivo claro.

### Occupation-only

- `003069314` — `occupation_only_review`
  - `physical_loteo_signal=no`
  - `internal_roads_visible=no`
  - `occupation_change_visible=no`
  - `subdivision_pattern_visible=no`
  - confianza: `high`
  - lectura: parcela angosta ya ocupada desde 2016; sin transición territorial material dentro del período.

- `003069247` — `occupation_only_review`
  - `physical_loteo_signal=no`
  - `internal_roads_visible=no`
  - `occupation_change_visible=no`
  - `subdivision_pattern_visible=no`
  - confianza: `high`
  - lectura: ocupación preexistente y estable; no hay patrón vial/subdivisorio interno.

Resultado preliminar: **0/2 señales de loteo físico**. Esto refuerza que `Building takeoff` aislado es un bucket de revisión y no una señal positiva.

### Controles negativos

- `003100421` — `negative_control`
  - `physical_loteo_signal=no`
  - `internal_roads_visible=no`
  - `occupation_change_visible=no`
  - `subdivision_pattern_visible=no`
  - confianza: `high`

- `003100423` — `negative_control`
  - `physical_loteo_signal=no`
  - `internal_roads_visible=no`
  - `occupation_change_visible=no`
  - `subdivision_pattern_visible=no`
  - confianza: `high`

Resultado preliminar: **2/2 controles visualmente negativos**.

## Hallazgo metodológico

Los extremos están funcionando bien en esta semilla: los dos fuertes son positivos y los dos controles son negativos. El problema aparece en `intermediate_convergent_candidate`, donde un caso productivo con invernaderos y un corredor principalmente de borde fue promovido indebidamente.

No conviene modificar thresholds globales con sólo dos intermedios revisados. Antes de recalibrar, revisar los dos intermedios restantes y una muestra de `other_observed` para decidir si el guard correcto debe ser:

- profundidad real del corredor dentro de la parcela;
- longitud de corredor interior;
- exclusión/penalización de coberturas productivas/invernaderos;
- o una combinación de estos factores.

## Gate

**PASS parcial**:

- `strong_convergent_candidate`: señal visual prometedora;
- `negative_control`: controles válidos en la semilla;
- `occupation_only_review`: confirma función de bucket de falsos positivos/ocupación no estructurada;
- `intermediate_convergent_candidate`: **NO calibrar todavía**; requiere más QA.

No usar estos resultados como conclusión de loteado/no loteado, aprobación, venta, irregularidad, incumplimiento o ilegalidad.
