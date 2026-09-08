# BioCorredor MR — Plan maestro de auditoría territorial con VHR + ML

Estado: activo
Branch de trabajo: `feature/validacion-territorial`
Unidad geométrica de referencia: mosaico `2023-04-19.jpg`
Scope espacial obligatorio: **Zona Productiva únicamente**.

Objetivo: detectar y medir transformación física observable dentro del suelo Productivo de la Ordenanza 11.819/20, integrando señales de obra/urbanización visibles sin confundirlas con situación administrativa, comercial o legal.

## 1. Principios que no se negocian

1. El universo espacial del indicador es exclusivamente `Productivo`.
2. La membresía canónica Productivo es `zones["productiva"]` del archivo final de asignaciones: **520 nomenclaturas únicas**.
3. Para geometría parcelaria se usan las parcelas GeoARBA actuales correspondientes a esas 520 nomenclaturas.
4. Para recorte de píxeles/objetos se usa la intersección entre la unión de esas 520 parcelas y la máscara Productivo disuelta reconstruida del Anexo I.
5. Otras categorías de la ordenanza (`recuperacion`, `equipamiento`, `uso_especifico`) son contexto; no entran ni en numerador ni en denominador del indicador Productivo.
6. `ocupación física detectada`, `transformación aparente`, `urbanización observable` o `señal de loteo físico` no equivalen a aprobación, venta, irregularidad o ilegalidad.
7. Un loteo físico puede existir sin viviendas: nivelación/desmonte, trazado de calles internas, postes/infraestructura, cercos/muros y morfología de subdivisión son señales válidas.
8. Los edificios son sólo una subcapa de transformación física, no la definición de loteo.
9. Toda comparación histórica debe usar imágenes co-registradas y guardar confianza geométrica.
10. Overture es evidencia auxiliar y control de calidad, no ground truth ni filtro duro.
11. La validación humana forma parte del sistema.
12. No desplegar artefactos analíticos experimentales hasta cerrar QA y criterios de aceptación.

## 2. Baseline Productivo

Fuentes versionadas:
- membresía: `public/data/auditoria/zonificacion-11819-asignaciones.json.gz`
- máscara disuelta: `public/data/auditoria/zonificacion-11819-productiva.geojson.gz`
- geometría parcelaria: cuatro capas GeoARBA de Ministro Rivadavia.

Reconstrucción administrativa/cartográfica previa:
- parcelas Productivo: **520**
- superficie resumida por atributos parcelarios: **1303.584699 ha**

Medición geométrica UTM 21S del pipeline V3 actual:
- unión de las 520 parcelas GeoARBA: **1302.009911 ha**
- máscara Productivo reparada: **1302.017563 ha**
- intersección efectiva para el recorte analítico: **1301.886167 ha**
- cobertura intersección / parcelas: **0.999905**
- cobertura intersección / máscara: **0.999899**

La diferencia entre `1303.584699 ha` y la medición geométrica no debe ocultarse: la primera proviene del resumen de superficies parcelarias; la segunda de geometrías proyectadas. Para métricas raster/vector se usa la geometría efectiva; para cualquier denominador jurídico/administrativo debe verificarse la regla legal y la fuente de superficie correspondiente.

El porcentaje legal exacto aplicable (`10%` vs `15%`, definición de superficie bruta y exclusiones) continúa **pendiente de verificación documental/administrativa**. No convertir el screening espacial en conclusión jurídica.

## 3. Datos históricos Cluster 2

Capturas disponibles:
- 2016-11-30
- 2020-03-03
- 2022-03-01
- 2023-04-19
- 2026-01-11

Mosaicos: `2917 x 3152 px`, VHR, zoom Web Mercator `z18`.

Georreferencia recuperada del pipeline histórico:
- bbox WGS84: `[-58.34573983010086, -34.882246399467945, -58.33009294873659, -34.86837586219111]`
- raster: `2917 x 3152 px`
- span esperado por bbox/z18: `2916.790 x 3151.707 px`
- delta georreferencia: `0.210 x 0.293 px`

Conclusión: la relación píxel ↔ coordenada queda validada para el mosaico de referencia 2023.

## 4. Registro temporal contra 2023

Resultado posterior a registro local:

| Año | tiles válidos | mediana dx | mediana dy | variación espacial | p95 residual |
|---|---:|---:|---:|---:|---:|
| 2016 | 9/16 | 0.0 px | 0.0 px | 0.57 px | 1.0 px |
| 2020 | 11/16 | 0.0 px | 0.0 px | 1.33 px | 2.7 px |
| 2022 | 16/16 | 0.0 px | 0.0 px | 0.24 px | 0.25 px |
| 2026 | 15/16 | 0.0 px | 0.0 px | 0.0 px | 0.0 px |

Lectura operativa:
- 2022 y 2026: alta confianza para comparación fina.
- 2016: usable con confianza moderada.
- 2020: menor confianza; cambios finos requieren revisión.

## 5. Segmentación de edificios — HOTOSM V3 oficial

Modelo: `hotosm/dinov3s-buildings` ONNX.

Semántica oficial confirmada:
- canal 0: logit de máscara de edificio → sigmoid
- canal 1: boundary → sigmoid
- canal 2: signed distance → tanh

Preprocesamiento oficial:
- RGB `/255`
- mean `[0.4296737853453577,0.4001659668453235,0.34333372802741474]`
- std `[0.2056069389373208,0.16738555558380538,0.1598986422586595]`
- Gaussian blending `sigma_frac=0.125`
- stride operativo: `128`
- threshold operativo: `0.4371`

Postproceso de referencia HOTOSM:
- watershed
- seed minimum distance: `6`
- large blob area: `1500 px`
- h-maxima depth: `0.2`
- simplify: `0.9626 m`
- overlap tolerance: `3.9251`
- min area: `2.6465 m²`

### V1/V2

Las corridas V1/V2 quedan como diagnóstico histórico y **no son válidas para cuantificación**, porque usaban semántica/preprocesamiento incorrectos y una estrategia de mosaico distinta de la oficial.

### V3 oficial 2023

Workstation CPU 20 threads:
- tiles: `528`
- tiempo total: `198.212 s`
- threshold fractions:
  - `0.30`: `0.07765338`
  - `0.4371`: `0.07123598`
  - `0.60`: `0.06470047`
- probability mean: `0.07568246`
- probability p95: `0.8767659`
- boundary mean: `0.0406216`
- distance mean: `-0.5772383`

Gate visual V3: **APROBADO**.
- elimina la mayor parte de falsos positivos masivos observados en V2;
- conserva techos, galpones e invernaderos de forma consistente;
- no muestra una cuadrícula dominante en la máscara principal;
- `0.4371` queda aceptado como threshold operativo inicial.

## 6. Vectorización 2023 dentro de Productivo

Script actual: `scripts/vectorize-building-v3-productivo.py`.

Pipeline:

```text
V3 probability + signed distance
  -> watershed de instancias
  -> contornos
  -> píxel z18 -> WGS84
  -> EPSG:32721
  -> recorte contra scope Productivo efectivo
  -> filtro de área mínima
  -> asignación por máxima intersección a parcela Productivo
  -> GeoJSON + CSV + resumen por parcela + QA JSON
```

Resultado 2023:
- `productiva_parcels_resolved`: **520**
- parcelas Productivo inválidas reparadas: **0**
- geometrías inválidas de máscara reparadas: **1**
- raw instance labels: **790**
- objetos V3 dentro de Productivo: **290**
- superficie detectada dentro de Productivo: **60,381.44 m²**
- parcelas Productivo con al menos un objeto detectado: **49**

QA visual y Overture:
- georreferencia: PASS;
- máscara/segmentación como superficie cubierta: PASS CON QA;
- vectorización geográfica: PASS;
- Overture: `279/290 = 96.2%` con algún solapamiento;
- `229/290 = 79.0%` con solapamiento >=50%;
- mediana de solapamiento V3 cubierta por Overture: `0.7436`;
- 11 objetos sin overlap;
- 61 objetos con overlap <50%;
- revisión dirigida de 40 desacuerdos: COMPLETA.

Conclusión de la revisión dirigida:
- el bajo overlap con Overture no implica por sí solo falso positivo V3;
- muchos desacuerdos corresponden a cubiertas reales omitidas, parciales, desplazadas o segmentadas distinto por Overture;
- existen falsos positivos reales sobre suelo desnudo/preparado, agua/piletas y algunas superficies no edilicias;
- los complejos productivos e invernaderos muestran diferencias frecuentes de partición entre V3 y Overture;
- Overture queda como feature/QA auxiliar, nunca como filtro duro.

Decisión operativa:
- `290` y `790` NO son conteos reales de edificios;
- la separación fina de instancias no bloquea el uso de la subcapa como **superficie cubierta observable**;
- la cifra `60,381.44 m²` continúa provisional hasta clasificar superficie edilicia/productiva/no edilicia/ambigua;
- no se prioriza por ahora perfeccionar el conteo individual porque el objetivo territorial principal es señal de transformación física/loteo.

Clases mínimas para esta subcapa:
- `building_or_roof_surface`
- `greenhouse_or_productive_cover`
- `probable_nonbuilding_surface`
- `uncertain_surface`

## 7. Arquitectura objetivo de detección territorial

```text
MÁSCARA PRODUCTIVO (scope duro)
  |
  +-> VHR histórica / fechas / registro / confianza geométrica
  |
  +-> señal: edificios / cubiertas
  |     -> segmentación V3
  |     -> superficie cubierta + clase + confianza
  |
  +-> señal: movimiento de suelo / nivelación / desmonte
  |
  +-> señal: calles o trazados internos
  |
  +-> señal: infraestructura visible (postes, tendidos, accesos)
  |
  +-> señal: muros / cercos
  |
  +-> señal: patrón morfológico de subdivisión
        |
        v
features por objeto / píxel / parcela
  -> score de transformación física
  -> score de señal de loteo físico
  -> serie temporal
  -> ranking de casos
  -> validación humana
  -> cruce administrativo/catastral
  -> mapa operativo
```

Separar siempre tres dimensiones:
1. **física**: qué transformación se observa;
2. **administrativa/catastral**: qué antecedentes o cambios registrales existen;
3. **legal/comercial**: aprobación, venta, imputación al cupo, etc.

## 8. Fases y gates

### Fase A — Base cartográfica y registro
Estado: OPERATIVA PARA CLUSTER 2.

Pendiente antes de escalar:
- formalizar máscara de confianza espacial por fecha;
- repetir control de registro al incorporar nuevos clusters.

### Fase B — Inferencia de edificios
Estado: COMPLETA PARA 2023.

Gate V3 aprobado visualmente. V1/V2 descartadas para cuantificación.

### Fase C — Vectorización / superficie cubierta
Estado: **CERRADA COMO SUBCAPA DE EVIDENCIA 2023, CON CONTEO DE INSTANCIAS NO VALIDADO**.

Hecho:
- georreferencia recuperada y validada;
- watershed V3;
- scope Productivo duro;
- 520 parcelas resueltas;
- GeoJSON/CSV/QA 2023;
- QA visual general;
- comparación auxiliar Overture;
- panel dirigido de desacuerdos.

Gate:
- PASS para superficie cubierta observable;
- FAIL/no usar para conteo individual de edificios;
- área total todavía provisional por clasificación pendiente de falsos positivos y tipo de cubierta.

No seguir invirtiendo tiempo en conteo fino salvo que una salida específica lo requiera.

### Fase D — Señales no edilicias de loteo físico
Estado: **SIGUIENTE BLOQUE ACTIVO**.

Orden:
1. movimiento de suelo / nivelación / desmonte;
2. calles o trazados internos;
3. infraestructura visible;
4. cercos / muros;
5. patrón de subdivisión;
6. accesos;
7. combinación con presencia de cubiertas.

Variables objetivo:
- `earthwork_or_leveling_score`
- `internal_road_score`
- `utility_infrastructure_score`
- `walls_fences_score`
- `subdivision_pattern_score`
- `access_pattern_score`
- `building_presence_score`
- `mixed_preparation_score`

Un área sin viviendas puede tener señal alta si combina suelo nivelado, calles internas, postes, cercos y subdivisión aparente.

### Fase E — Agregación Productivo por parcela
Estado: PENDIENTE.

Variables mínimas:
- `partida`
- `nomenclatura`
- `productive_area_m2`
- `building_or_roof_surface_m2`
- `greenhouse_or_productive_cover_m2`
- `probable_nonbuilding_surface_m2`
- `uncertain_surface_m2`
- `earthwork_score`
- `internal_road_score`
- `utility_infrastructure_score`
- `walls_fences_score`
- `subdivision_pattern_score`
- `physical_transformation_productive_pct`
- `physical_loteo_score`
- `physical_loteo_confidence`
- `first_observed_date`
- `latest_observed_date`

Para parcelas parcialmente intersectadas por Productivo, cualquier métrica de superficie debe usar sólo la porción Productivo.

### Fase F — Serie histórica
Estado: PENDIENTE.

Salida objetivo:

```text
partida | 2016 | 2020 | 2022 | 2023 | 2026 | first_change | latest_change | physical_loteo_score | confidence
```

No forzar una fecha de aparición cuando el registro o la escena no tengan confianza suficiente.

### Fase G — Dataset y validación humana
Estado: MVP EXISTENTE, A AMPLIAR.

Los 40 casos actuales son semilla de QA, no dataset definitivo.
Objetivo inicial: 200–300 etiquetas humanas, con split espacial por parcela/cluster.

Labels sugeridos:
- `building_yes_no_uncertain`
- `footprint_quality`
- `object_type`
- `earthwork_yes_no_uncertain`
- `internal_roads_yes_no_uncertain`
- `utility_infrastructure_yes_no_uncertain`
- `walls_fences_yes_no_uncertain`
- `subdivision_pattern_yes_no_uncertain`
- `physical_loteo_signal`
- `confidence`
- `notes`

### Fase H — Capa operativa
Estado: PENDIENTE.

Capas previstas:
- VHR original/registrada
- Productivo
- GeoARBA
- superficie cubierta detectada
- movimiento de suelo
- calles internas
- infraestructura
- cercos/muros
- subdivisión
- score físico combinado
- confianza
- validación humana
- antecedentes administrativos vinculados

## 9. Variables de cubiertas / edificios

Por objeto o complejo conservar:
- `object_id`
- `date`
- `partida`
- `nomenclatura`
- `area_m2`
- perímetro
- centroid
- bbox
- `prob_mean`, `prob_p10`, `prob_p90`
- compactness
- rectangularity
- solidity
- elongation
- orientación
- relación con límite de parcela
- relación con caminos
- IoU/intersección con Overture
- confianza geométrica local
- `surface_class`

Clases operativas:
- `building_or_roof_surface`
- `greenhouse_or_productive_cover`
- `probable_nonbuilding_surface`
- `uncertain_surface`

Nunca usar `ilegal`, `usurpado`, `en negro` ni equivalentes como clases automáticas.

## 10. QA y métricas

### Segmentación / vectorización
- precision / recall / F1 / IoU sobre muestra humana
- false positive area ratio
- error de área
- tasa de fragmentación
- tasa de fusión de edificios contiguos
- IoU con Overture sólo como comparación auxiliar

### Parcela / transformación física
- área transformada dentro de Productivo
- porcentaje Productivo transformado
- acuerdo humano en `physical_loteo_signal`
- precision@k del ranking de parcelas a revisar

### Confianza
Guardar por separado:
- `registration_confidence`
- `segmentation_confidence`
- `surface_classification_confidence`
- `physical_loteo_confidence`

## 11. Cómputo y responsabilidad

### GitHub
Fuente de verdad para código, documentación, criterios y scripts reproducibles.

### Workstation Windows
Usar para:
- ONNX pesado
- vectorización
- extracción de features
- QA visual local
- entrenamiento/benchmarks

Hardware validado:
- Intel i7-12700, 20 hilos lógicos
- 32 GiB RAM
- RX 6700 XT; DirectML falla actualmente y cae a CPU

Baseline: `--provider cpu --cpu-threads 20`.

### VPS
Usar para:
- integración
- publicación
- servicios
- almacenamiento operativo
- artefactos que sólo existan allí

No usarla para inferencia ML pesada si la workstation está disponible.

No borrar archivos locales desconocidos ni usar `git clean -fd`.

## 12. Orden inmediato

### Sprint cerrado — QA de cubiertas 2023
1. inferencia V3 oficial: HECHO;
2. georreferencia: HECHO;
3. vectorización Productivo: HECHO;
4. QA visual general: HECHO;
5. comparación Overture: HECHO;
6. panel de desacuerdos: HECHO;
7. decisión: subcapa aceptada como superficie cubierta observable; conteo individual no validado.

### Sprint activo — señales físicas no edilicias
1. movimiento de suelo/nivelación;
2. calles internas;
3. infraestructura visible;
4. cercos/muros;
5. patrón de subdivisión;
6. score combinado de `physical_loteo_signal`.

La prioridad es detectar **preparación física para loteo incluso sin viviendas**.

## 13. Riesgos conocidos

- 2020 tiene mayor error de registro local.
- escenas VHR cambian iluminación, estación y sensor.
- sombras/suelo desnudo pueden afectar señales no edilicias.
- edificios agrícolas pueden dominar área sin implicar loteo residencial.
- Overture puede fragmentar, desplazar, simplificar u omitir una cubierta; no usarlo como filtro duro.
- un único threshold puede no generalizar a todas las fechas/sensores.
- la máscara Productivo necesitó reparación topológica de una geometría; mantener QA de validez.
- superficies por atributos parcelarios y superficies geométricas no son idénticas; no mezclar denominadores.
- el porcentaje jurídico exacto y su método de cómputo siguen pendientes.
- el conteo de instancias de edificios no está validado y no debe entrar como métrica jurídica o territorial sin revisión.

## 14. Fuentes metodológicas

- Quilmes, solución geoespacial VHR: clasificación/extracción de superficies construidas -> análisis zonal por parcela -> comparación catastral -> alertas -> supervisión humana.
  - https://fh.mdp.edu.ar/revistas/index.php/pleamar/article/view/8433/9222
- HOTOSM `dinov3s-buildings`:
  - https://huggingface.co/hotosm/dinov3s-buildings

## 15. Regla de actualización

Cada cambio importante debe actualizar:
- estado de fase;
- commit relevante;
- métricas QA;
- decisión tomada;
- siguiente gate.

Ante ambigüedad espacial, prevalecen `TERRITORIAL_SCOPE_PRODUCTIVO.md` y `TERRITORIAL_LOTEO_CRITERIA.md`.

Este archivo es la fuente de verdad del plan técnico para evitar desvíos y trabajo duplicado.
