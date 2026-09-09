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

## Identificación de casos después del gate

### Strong preservados

- `003139476` — edge=0.066070, deep=0.926382, network=0.966872
- `003017516` — edge=0.011163, deep=0.986036, network=0.993716
- `003017527` — edge=0.058451, deep=0.903509, network=0.956579
- `003017519` — edge=0.010914, deep=0.982156, network=0.991970
- `003076135` — edge=0.454645, deep=0.534290, network=0.790431

Los dos positivos humanos fuertes `003017527` y `003017519` permanecen correctamente en `strong_convergent_candidate`.

### Intermedios sobrevivientes

- `003143927` — POSITIVO humano; edge=0.450260, deep=0.528843, network=0.787979.
- `003143929` — FALSO POSITIVO humano; edge=0.362391, deep=0.375162, network=0.697857. El panel temporal muestra uso productivo/invernaderos y una señal vial no compatible con una malla interna de loteo.

La precisión humana semilla del estrato intermedio mejora de 1/4 en V1 a 1/2 en V6. Como `intermediate` es deliberadamente un bucket de revisión y no una etiqueta positiva final, no se fuerza otro threshold sólo para eliminar este caso: hacerlo con una muestra tan pequeña implicaría sobreajuste.

### Casos derivados a borde/perímetro

- `003143928` — edge=0.970688, deep=0.001697, network=0.214236
- `003143930` — edge=1.000000, deep=0.000000, network=0.200000
- `003100426` — edge=1.000000, deep=0.000000, network=0.200000
- `003100428` — edge=1.000000, deep=0.000000, network=0.200000
- `003100424` — edge=1.000000, deep=0.000000, network=0.200000
- `003100422` — edge=1.000000, deep=0.000000, network=0.200000

El nuevo estrato `edge_access_or_perimeter_review` funciona como guard útil para accesos y corredores perimetrales que antes podían contaminar categorías convergentes.

## Evaluación del proxy productivo

`productive_cover_proxy_v6` no aporta todavía separación suficiente:

- `003143929` devuelve `0.0` pese a que el QA visual identifica invernaderos/cubiertas productivas;
- varios casos de borde sí muestran valores >0, pero no de manera robusta.

Decisión: mantenerlo como feature experimental, no usarlo como gate fuerte hasta contar con un detector de cubierta productiva mejor validado. No ajustar thresholds de forma ad hoc sobre un único falso positivo.

## Decisión metodológica

V6 queda ACEPTADA como **estratificación de QA**, no como clasificador final.

- `strong_convergent_candidate`: bucket prioritario con buena precisión semilla.
- `intermediate_convergent_candidate`: bucket de revisión humana; admite falsos positivos.
- `edge_access_or_perimeter_review`: guard específico útil.
- `occupation_only_review`: no promover por `Building takeoff` aislado.
- `negative_control`: controles negativos limpios en la semilla revisada.

El siguiente gate no será seguir afinando morfología para eliminar todos los falsos positivos intermedios. Se incorpora una dimensión independiente: evidencia comercial pública + geocodificación + cruce GeoARBA/Productivo.

## Regla de evidencia

Los estratos son exclusivamente de QA físico/territorial. No equivalen a loteado/no loteado, venta, subdivisión aprobada, incumplimiento, irregularidad o ilegalidad.
