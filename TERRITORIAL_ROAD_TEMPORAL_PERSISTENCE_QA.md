# BioCorredor MR — QA de persistencia temporal vial

Estado: **PASS COMO CAPA TEMPORAL AUXILIAR; NO ES MÁSCARA FINAL**
Scope: **Productivo only**
Referencia actual: `2026-01-11`

## Resultado numérico

Sobre la red `Road` observada en 2026:
- soporte pre-2020: **28.59%**;
- primer soporte en 2022/2023: **51.37%**;
- sólo 2026: **18.32%**.

Fracciones sobre Productivo del Cluster 2:
- `persistent_pre2020`: **0.011775**;
- `new_2022_2023_candidate`: **0.021155**;
- `new_2026_candidate`: **0.007543**;
- `intermittent_or_disappeared`: **0.013740**;
- `uncertain`: **0.001491**.

## QA visual del overlay 2026

Lectura:
- los trazados con soporte pre-2020 se concentran mayormente sobre corredores antiguos y accesos consolidados;
- la clase 2022/2023 recupera de forma convincente buena parte de las grillas internas que aparecen y luego persisten;
- la clase sólo-2026 contiene expansión plausible, pero también varios trazos largos sobre campos/límites que deben tratarse con menor confianza;
- `intermittent_or_disappeared` concentra múltiples señales inestables y es útil como clase de descarte/alerta, no como evidencia vial positiva;
- la capa temporal mejora claramente la interpretabilidad respecto de máscaras independientes por fecha.

Gate: **PASS como prior temporal**, con especial cautela sobre `new_2026_candidate` sin soporte geométrico/earthwork adicional.

## Decisión metodológica

No seguir iterando un detector vial aislado. La próxima versión debe combinar:
1. persistencia temporal OpenEarthMap;
2. probabilidad Road 2026;
3. soporte geométrico de corredores V4;
4. earthwork 2023→2026 como evidencia secundaria.

Los candidatos sólo-2026 sin soporte V4/earthwork deben penalizarse, no eliminarse automáticamente.

Script siguiente: `scripts/generate-internal-road-score-v5.py`.

## Restricciones

Esta capa y el V5 resultante no equivalen a porcentaje loteado, superficie vendida, aprobación, irregularidad ni ilegalidad. Antes de agregar por parcela Productivo, el V5 debe pasar QA visual.
