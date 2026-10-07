# Denominador operativo del cupo ordinario de Clubes de Campo (10%)

Estado: **CERRADO para el modelo GIS de BioCorredor; pendiente contraste con la memoria administrativa histórica municipal**.

Fecha de revisión: 2026-10-07.

## Regla normativa

La Ordenanza 11.366/18 incorporó al régimen rural la posibilidad de Clubes de Campo hasta cubrir, en conjunto, el **10% de la superficie bruta total del área rural**, excluyendo del cómputo:

- superficies decapitadas, degradadas o canteras;
- superficies afectadas a equipamiento;
- fraccionamientos residenciales con parcelas menores a 10.000 m².

Una vez cubierto ese cupo, el Departamento Ejecutivo podía promover un nuevo cupo de hasta 5%; no era automático.

La Ordenanza 11.819/20, luego convalidada por Resolución provincial 560/2021, mantiene el esquema y permite localizar Clubes de Campo por fuera del porcentaje ordinario en Zona de Recuperación y superficies afectadas a Equipamiento/Uso Específico, sujeto a la evaluación administrativa correspondiente.

## Reconstrucción parcelaria del Anexo I 11.819/20

| Categoría | Parcelas | Superficie GeoARBA |
| --- | ---: | ---: |
| Productiva confirmada | 520 | **1303.584699 ha** |
| Recuperación | 205 | 1201.264 ha |
| Equipamiento | 8 | 45.870 ha |
| Uso Específico | 10 | 83.229 ha |
| Total clasificado | 743 | 2633.947 ha |
| Fragmentos de borde no asignados | 16 | **4.856971 ha** |

## Cierre operativo del denominador

BioCorredor fija como denominador GIS del cupo ordinario exclusivamente la superficie **Productiva confirmada**:

**DENOMINADOR_GIS_10 = 1303.584699 ha**

Los 16 fragmentos limítrofes no se agregan al denominador porque no integran la membresía canónica de las 520 parcelas Productivo. Además, todos figuran actualmente en GeoARBA como `Urbano` y cada uno mide menos de 10.000 m². Esa condición actual es coherente con una categoría de exclusión de la norma, aunque no demuestra por sí sola cuál era su estado jurídico en 2018–2020.

Por lo tanto:

**UMBRAL_GIS_10 = 130.3584699 ha**

Redondeo para comunicación pública: **130.36 ha**.

Este número es exacto dentro de la reconstrucción geoespacial versionada del proyecto. Una conclusión jurídica final deberá contrastarlo con la memoria de cálculo/ledger administrativo histórico del Municipio y resolver temporalmente los 16 fragmentos.

## Tratamiento de los fragmentos ambiguos

Los 16 fragmentos suman 4.856971 ha y se mantienen como capa QA, no como una banda de incertidumbre que modifique el denominador operativo.

- candidatos visuales a Productivo: 12;
- candidatos a Recuperación: 2;
- candidato a Equipamiento: 1;
- restante de borde: 1 según clasificación cromática/QA;
- estado GeoARBA actual: 16/16 `Urbano`;
- superficie individual: 0.0388–0.5561 ha.

Regla: `unresolved_boundary_fragment != Productivo_confirmado`.

## Regla para el numerador

Sólo se suma al cupo ordinario la superficie de un emprendimiento que:

1. encuadre administrativamente como Club de Campo;
2. esté dentro del suelo computable del cupo ordinario;
3. no corresponda a Recuperación, Equipamiento o Uso Específico habilitado por fuera del porcentaje;
4. tenga evidencia suficiente para vincular su polígono al acto/expediente correspondiente.

La detección ML de calles, cubiertas o transformación física sirve para descubrir y delimitar candidatos. No sustituye la clasificación administrativa.

## Fuentes primarias

- Ordenanza 11.366/18 — HCD Almirante Brown.
- Ordenanza 11.819/20 y Anexos I/II.
- Resolución 560/2021 del Ministerio de Gobierno de la Provincia de Buenos Aires.
- GeoARBA, geometría parcelaria actual.
- `public/data/auditoria/zonificacion-11819-asignaciones.json.gz`.
- `public/data/auditoria/zonificacion-11819-ambiguas.geojson`.
