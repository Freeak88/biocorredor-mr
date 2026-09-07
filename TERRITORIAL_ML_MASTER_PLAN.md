# BioCorredor MR — Plan maestro de auditoría territorial con VHR + ML

Estado: activo
Branch de trabajo: `feature/validacion-territorial`
Unidad de referencia geométrica: mosaico `2023-04-19.jpg`
Objetivo: medir transformación física observable por parcela y clasificar objetos construidos sin confundir automáticamente transformación física con situación administrativa o legal.

## 1. Principios que no se negocian

1. La unidad final de análisis es la parcela GeoARBA; los footprints individuales son evidencia auxiliar.
2. La imagen histórica debe estar co-registrada antes de comparar fechas.
3. `ocupación física detectada`, `transformación aparente` y `urbanización observable` no equivalen a irregularidad, ilegalidad ni estado registral.
4. Overture no es ground truth; se usa como referencia actual y apoyo de validación.
5. Las detecciones productivas, galpones e invernaderos no se eliminan: se separan de vivienda probable.
6. Toda inferencia temporal debe guardar nivel de confianza geométrica y de clasificación.
7. La validación humana es parte del sistema, no un parche posterior.
8. No desplegar a producción artefactos analíticos hasta cerrar QA y criterios de aceptación.

## 2. Estado técnico actual

### 2.1 Datos históricos Cluster 2
Capturas:
- 2016-11-30
- 2020-03-03
- 2022-03-01
- 2023-04-19
- 2026-01-11

Mosaicos: 2917 x 3152 px, VHR, z18.

### 2.2 Registro local contra 2023
Resultado posterior a `apply-local-registration.py`:

| Año | tiles válidos | mediana dx | mediana dy | variación espacial | p95 residual |
|---|---:|---:|---:|---:|---:|
| 2016 | 9/16 | 0.0 px | 0.0 px | 0.57 px | 1.0 px |
| 2020 | 11/16 | 0.0 px | 0.0 px | 1.33 px | 2.7 px |
| 2022 | 16/16 | 0.0 px | 0.0 px | 0.24 px | 0.25 px |
| 2026 | 15/16 | 0.0 px | 0.0 px | 0.0 px | 0.0 px |

Lectura operativa:
- 2022 y 2026: aptos para comparación fina.
- 2016: usable con máscara de confianza.
- 2020: usar con menor confianza; no tomar cambios finos como evidencia fuerte sin revisión.

### 2.3 Segmentación 2023
Modelo piloto: `hotosm/dinov3s-buildings` ONNX.
Firma observada:
- input: `image`, `[1,3,256,256]`, float
- output: `logits`, `[1,3,256,256]`, float

Baseline piloto previo:
- canal de fondo inferido provisionalmente: 2
- fracción de píxeles sobre umbral 0.4371: ~9.4%
- se detectan muchos techos reales
- hay falsos positivos en suelo desnudo, vegetación/sombras y algunas texturas brillantes
- la probabilidad mostraba artefactos visibles de tiling; no cuantificar m² todavía

#### Corrida V2 2023 — workstation
Configuración:
- provider efectivo: `CPUExecutionProvider`
- CPU: Intel i7-12700
- threads: 20
- stride: 192
- tiles: 255
- blending: `hann_floor_0.05`
- tiempo total de inferencia: 42.20 s

QA:
- `background_channel`: 2, todavía provisional
- `channel_mean_probability`: [0.083798, 0.106257, 0.809945]
- `channel_argmax_share`: [0.064534, 0.009539, 0.925927]
- `probability_mean`: 0.190055
- `probability_p95`: 0.769534

Fracción de píxeles por umbral:
- 0.30: 16.3604%
- 0.4371: 9.7568%
- 0.60: 6.5442%

Artefactos QA generados localmente:
- `2023-04-19-building-prob.png`
- `2023-04-19-building-mask-t0300.png`
- `2023-04-19-building-mask-t0437.png`
- `2023-04-19-building-mask-t0600.png`
- `2023-04-19-overlay.jpg`
- `2023-04-19-overlay-center.jpg`
- `2023-04-19-threshold-comparison-center.jpg`
- `2023-04-19-diagnostic-center.jpg`

Decisión actual: Fase B queda bloqueada únicamente por inspección visual de estos artefactos. No vectorizar ni cuantificar m² hasta validar costuras, semántica de salida y umbral operativo.

### 2.4 Entorno de cómputo validado

#### VPS
- 8 vCPU AMD EPYC virtualizados, 23 GiB RAM.
- benchmark ONNX CPU 1 thread: 66.42 s/tile.
- proyección 255 tiles: ~282 min por mosaico.
- 2 threads no mostró mejora inicial relevante.
- decisión: no usar VPS para iteración ML pesada salvo necesidad operativa específica.

#### Workstation Windows
- Intel Core i7-12700, 12 cores / 20 hilos.
- 32 GiB RAM.
- AMD Radeon RX 6700 XT disponible, pero DirectML falló al inicializar y ONNX Runtime hizo fallback a CPU; no atribuir a GPU resultados del benchmark.

| Threads | s/tile medio | proyección 255 tiles |
|---:|---:|---:|
| 4 | 0.249 | 1.06 min |
| 8 | 0.168 | 0.71 min |
| 12 | 0.147 | 0.62 min |
| 16 | 0.139 | 0.59 min |
| 20 | 0.136 | 0.58 min |

Decisión operativa:
- usar workstation para inferencia, vectorización, entrenamiento y procesamiento ML pesado;
- usar `--provider cpu --cpu-threads 20` como baseline local actual;
- DirectML queda como optimización opcional, no bloqueante;
- VPS queda para integración, almacenamiento operativo, publicación y servicios.

## 3. Arquitectura objetivo

```text
VHR histórica
  -> control de fechas y metadata
  -> co-registro local a 2023
  -> máscara de confianza geométrica
  -> segmentación de superficie construida
  -> blending de tiles / eliminación de costuras
  -> máscara probabilística
  -> vectorización
  -> atributos geométricos + espectrales + contextuales
  -> clasificación de objeto
  -> agregación por parcela GeoARBA
  -> métricas temporales por parcela
  -> alertas / ranking
  -> validación humana
  -> capa operativa en mapa
```

Arquitectura de ejecución:

```text
GitHub = fuente de verdad de código/documentación
Workstation = cómputo ML pesado y generación de artefactos analíticos
VPS = integración, publicación, servicios y almacenamiento operativo
```

## 4. Fases y criterios de salida

### Fase A — Estabilizar base cartográfica
Estado: EN CURSO

Objetivos:
- 2023 como referencia geométrica.
- registro local para cada fecha.
- mapa de confianza por píxel/tesela.
- excluir archivos auxiliares de cualquier batch histórico.

Criterios de aceptación:
- mediana residual dx/dy próxima a 0.
- p95 residual <= 1 px para alta confianza.
- p95 residual >1 y <=3 px: confianza media / revisión.
- p95 residual >3 px: no usar para detección temporal fina.
- overlay visual de al menos 5 estructuras persistentes por fecha.

### Fase B — Corregir inferencia y mosaico de probabilidad
Estado: EN CURSO — gate visual pendiente

Tareas:
1. progreso visible por ventana. HECHO.
2. blending ponderado en zonas solapadas. HECHO.
3. minimizar artefactos de borde de tile. IMPLEMENTADO, PENDIENTE QA VISUAL.
4. preservar `stride=192` como baseline. HECHO.
5. ejecutar QA sobre recortes. HECHO.
6. no asumir semántica de los 3 logits sin validación adicional. VIGENTE.
7. producir comparativa 0.30 / 0.4371 / 0.60. HECHO.
8. ejecutar baseline pesado en workstation. HECHO.

Criterios de aceptación:
- ausencia de cuadrícula dominante en probability map.
- techos persistentes conservan forma continua en bordes de tile.
- falsos positivos de suelo/sombra aceptables y caracterizados.
- selección de umbral operativo documentada.
- pipeline reproducible y con log de progreso.

Gate actual: inspección visual de V2. Si pasa, avanzar directamente a Fase C.

### Fase C — Vectorización de objetos
Estado: PENDIENTE

Salida requerida por objeto:
- `object_id`
- geometría
- fecha
- área en píxeles y m²
- perímetro
- bbox
- centroid
- score probabilístico
- calidad geométrica local

Postproceso inicial:
- closing suave para huecos/fragmentos de un mismo techo.
- opening suave para ruido aislado.
- componentes conectados.
- filtro de área mínima configurable; no fijar aún como verdad un mínimo de 10 m².
- conservar objetos grandes y elongados para clasificación productiva.

### Fase D — Clasificador de objeto
Estado: PENDIENTE

Clases operativas iniciales:
- `residential_probable`
- `productive_shed`
- `greenhouse`
- `auxiliary_structure`
- `mixed_or_complex`
- `noise_or_nonbuilding`
- `uncertain`

No usar `ilegal`, `usurpado`, `en negro` ni equivalentes como clases automáticas.

### Fase E — Agregación por parcela GeoARBA
Estado: PENDIENTE

Por cada parcela y fecha calcular:
- superficie construida detectada total
- superficie residencial probable
- superficie productiva probable
- cantidad de objetos
- área del mayor objeto
- densidad construida
- porcentaje ocupado
- confianza media geométrica
- confianza media de clasificación

Salida temporal objetivo:

```text
partida | 2016_m2 | 2020_m2 | 2022_m2 | 2023_m2 | 2026_m2 | delta_m2 | patrón | confianza
```

Patrones operativos:
- estable
- expansión
- reducción
- reemplazo
- mixto
- incierto

### Fase F — Validación humana
Estado: MVP EXISTENTE, A AMPLIAR

Separar:
- juicio humano
- score automático
- datos crudos de imagen
- interpretación parcelaria

No sobreescribir datos automáticos con la validación; guardar ambos.

### Fase G — Capa operativa de mapa
Estado: PENDIENTE

Capas previstas:
- VHR original
- VHR registrada
- Overture actual
- superficie construida detectada
- objetos clasificados
- cambio temporal
- confianza geométrica
- GeoARBA
- validaciones humanas

## 5. Variables para clasificar cada objeto

### 5.1 Geometría
- `area_m2`
- `perimeter_m`
- `bbox_width_m`
- `bbox_height_m`
- `aspect_ratio`
- `compactness = 4*pi*area/perimeter^2`
- `rectangularity = area/minimum_rotated_rectangle_area`
- `solidity = area/convex_hull_area`
- `elongation`
- orientación del eje mayor
- número de huecos
- número de componentes fusionados en postproceso

Uso esperado:
- vivienda: área media/chica, mayor compactación, menor elongación extrema.
- galpón: área grande, alta rectangularidad, elongación posible.
- invernadero: elongación alta, repetición espacial, agrupamientos paralelos.
- ruido: baja solidez, contorno irregular, área mínima, mala confianza.

### 5.2 Probabilidad ML
- `prob_mean`
- `prob_median`
- `prob_p10`
- `prob_p90`
- `prob_max`
- fracción del objeto por encima de 0.30 / 0.4371 / 0.60
- varianza interna de probabilidad
- distancia al borde de tile más cercano

### 5.3 Apariencia / textura
Calcular sobre RGB original:
- media y desvío RGB
- brillo medio
- saturación
- entropía local
- contraste
- gradiente medio
- porcentaje de sombra dentro y alrededor del objeto
- uniformidad de textura

No usar estas variables solas para determinar uso del inmueble.

### 5.4 Contexto parcelario
- `partida`
- área de parcela
- porcentaje de parcela ocupado
- cantidad de objetos en parcela
- área del objeto mayor / área construida total
- distancia al límite de parcela
- distancia a camino/calle
- cantidad de objetos vecinos a 10/25/50 m
- densidad de construcciones vecinas
- cluster morfológico
- zonificación/categoría parcelaria disponible

### 5.5 Contexto temporal
- primera fecha de presencia con confianza suficiente
- persistencia entre fechas
- cambio de área absoluta y porcentual
- expansión de polígono respecto de fecha previa
- IoU temporal
- aparición/desaparición
- continuidad de centroides

### 5.6 Evidencia auxiliar
- intersección con Overture
- IoU con footprint Overture
- diferencia de área vs Overture
- si Overture representa fragmento, edificio completo o complejo
- validación humana previa si existe

## 6. Dataset maestro

### 6.1 Unidad de fila
Una fila = un objeto detectado en una fecha dentro de una parcela.

No usar como única unidad el footprint Overture actual.

### 6.2 Identificadores mínimos
- `sample_id`
- `object_id`
- `partida`
- `capture_date`
- `cluster_id`
- `source_image`
- `geometry_version`

### 6.3 Features
Todas las variables de la sección 5, con nombres versionados.

### 6.4 Labels humanos
- `label_object_type`
- `label_building_yes_no_uncertain`
- `label_residential_yes_no_uncertain`
- `label_footprint_quality`: correct / partial / incorrect
- `label_larger_structure_associated`: yes / no / uncertain
- `label_growth_pattern`
- `label_confidence`: low / medium / high
- `label_notes`
- `validator_id` o identificador anónimo estable
- `validated_at`

### 6.5 Dataset inicial
Los 40 casos existentes son semilla de QA, no dataset definitivo de entrenamiento.

Objetivo inicial: 200-300 ejemplos humanos balanceados por clase y contexto.

Cuotas orientativas:
- 70 vivienda probable
- 40 galpón/productivo
- 30 invernadero/estructura agrícola si existen suficientes ejemplos
- 30 auxiliar/mixto
- 50 ruido/no edificio
- 30 ambiguos

No duplicar artificialmente objetos para llenar clases.

### 6.6 Selección de ejemplos
Combinar:
- alta y baja confianza
- falsos positivos visuales
- objetos grandes y pequeños
- zonas densas y rurales/periurbanas
- casos con y sin Overture
- años con distinta calidad geométrica

### 6.7 Split train/validation/test
Nunca separar aleatoriamente píxeles del mismo lugar entre conjuntos.

Separar espacialmente por parcela o grupos de parcelas/cluster:
- train ~70%
- validation ~15%
- test ~15%

Evitar que la misma construcción en años distintos caiga en train y test.

## 7. Métricas de evaluación

### Segmentación
- precision
- recall
- F1 / Dice
- IoU
- false positive area ratio
- métricas separadas por vivienda / galpón / zonas rurales

### Clasificación de objeto
- macro F1
- precision/recall por clase
- matriz de confusión
- recall de `residential_probable`
- falsos residenciales sobre galpones/productivos

### Parcela
- error absoluto de m² construidos
- error porcentual de superficie ocupada
- acuerdo en patrón temporal
- ranking precision@k para parcelas a revisar

## 8. Diseño de confianza

Guardar por separado:
- `registration_confidence`
- `segmentation_confidence`
- `classification_confidence`

Ejemplo:
```text
registration=medium
segmentation=high
classification=low
final=review
```

## 9. Flujo de trabajo y responsabilidad

### Código / documentación
Los realiza el asistente directamente en GitHub sobre `feature/validacion-territorial` cuando sea posible.

### Workstation
El usuario ejecuta comandos entregados para:
- inferencia ONNX pesada
- vectorización masiva
- extracción de features
- entrenamiento y benchmarks
- artefactos locales bajo `tmp/`

Baseline:
```text
--provider cpu --cpu-threads 20
```

### VPS
Reservada para:
- `git pull` e integración
- publicación y servicios
- almacenamiento operativo
- validaciones contra producción
- archivos que sólo existan allí

No usar VPS para iteración ML pesada si existe equivalente local.

### Sincronización de artefactos
- no versionar mosaicos VHR, máscaras pesadas o modelos grandes en Git;
- subir a VPS sólo resultados necesarios: GeoJSON, CSV, QA JSON, máscaras seleccionadas y modelos versionados cuando corresponda;
- mantener nombres y metadata reproducibles.

### Despliegue
Sólo con versión explícitamente validada. No mezclar `tmp/` experimental con producción.

## 10. Orden inmediato de implementación

### Sprint técnico 1 — inferencia limpia 2023
1. blending ponderado. HECHO.
2. progreso y timing. HECHO.
3. benchmark de hardware. HECHO.
4. tres umbrales sin repetir inferencia. HECHO.
5. overlays/paneles QA. HECHO.
6. validación visual. PENDIENTE.

Gate: no seguir si persisten costuras fuertes o semántica de canales dudosa.

### Sprint técnico 2 — vectorización y features
1. vectorizar máscara 2023.
2. postproceso configurable.
3. extraer features geométricas/probabilísticas/contextuales.
4. exportar GeoJSON + CSV.
5. comparar con Overture.

Gate: revisar al menos 40 casos y falsos positivos grandes.

### Sprint técnico 3 — dataset humano
1. generar candidatos balanceados.
2. extender UI de validación a objeto detectado.
3. alcanzar 200-300 casos.
4. congelar split espacial train/val/test.

### Sprint técnico 4 — clasificador de objeto
Baseline recomendado antes de deep learning adicional:
- reglas interpretables + Gradient Boosting / Random Forest sobre features de objeto.

Razón: dataset inicial chico, variables tabulares fuertes y necesidad de explicabilidad.

Sólo después evaluar fine-tuning de segmentación o clasificador visual dedicado.

### Sprint técnico 5 — serie histórica
1. correr segmentación sobre años registrados.
2. propagar confianza geométrica.
3. matching temporal de objetos.
4. agregación por parcela.
5. tabla 2016/2020/2022/2023/2026.

### Sprint técnico 6 — mapa operativo
1. capas automáticas.
2. filtros por confianza/tipo/año.
3. comparación temporal.
4. validación humana.
5. exportación de casos para revisión municipal.

## 11. Riesgos conocidos

- 2020 conserva mayor error local.
- 2016 tiene menos tiles confiables.
- salida ONNX de 3 canales requiere validación de semántica.
- escenas VHR cambian iluminación, estación y sensor.
- sombras, suelo desnudo y vegetación generan falsos positivos.
- galpones/productivo pueden parecer más construidos que vivienda; no mezclar usos.
- Overture puede fragmentar o representar sólo parte de un complejo.
- un único umbral global puede no ser óptimo para todas las fechas.
- DirectML actualmente falla al inicializar y cae a CPU; no usar métricas de fallback como si fueran GPU.

## 12. Fuentes metodológicas de referencia

- Quilmes, solución geoespacial VHR: clasificación/extracción de superficies construidas -> análisis zonal por parcela -> comparación con base catastral -> alertas -> supervisión humana.
  - https://fh.mdp.edu.ar/revistas/index.php/pleamar/article/view/8433/9222
- HOTOSM `dinov3s-buildings`: segmentación de edificios VHR; ventana 256 px, stride 192, threshold documentado 0.4371.
  - https://huggingface.co/hotosm/dinov3s-buildings

## 13. Regla para actualizar este documento

Cada cambio importante debe actualizar:
- estado de la fase
- commit relevante
- métricas QA
- decisión tomada
- siguiente gate

Este archivo es la fuente de verdad del plan técnico para evitar desvíos y trabajo duplicado.
