# BioCorredor MR — Blueprint operativo para otro agente

## 0. Propósito

Este documento permite que otro agente retome el proyecto de **auditoría territorial de Ministro Rivadavia** sin reconstruir el contexto desde cero.

Objetivo principal:
- detectar **transformación física observable** y **señales de preparación para loteo**;
- limitar el indicador principal a la **Zona Productiva** de la Ordenanza 11.819/20;
- reconstruir cambios físicos por fecha y por parcela;
- separar siempre evidencia física, estado administrativo/catastral y conclusión legal/comercial.

No convertir automáticamente una señal física en afirmaciones de aprobación, venta, irregularidad o ilegalidad.

---

## 1. Repositorio y branch

Repositorio:

```text
Freeak88/biocorredor-mr
```

Branch activa del trabajo territorial:

```text
feature/validacion-territorial
```

Pull request histórico del bloque de validación:

```text
PR #2 · feat: validación humana territorial sobre mapa
```

GitHub es la fuente de verdad para:
- código;
- documentación;
- criterios metodológicos;
- scripts reproducibles;
- capas públicas livianas.

No versionar mosaicos VHR pesados, outputs temporales de ML ni modelos grandes salvo decisión explícita.

---

## 2. Regla espacial central: Productivo únicamente

El universo del indicador territorial es **sólo Productivo**.

Fuente canónica de membresía:

```text
public/data/auditoria/zonificacion-11819-asignaciones.json.gz
```

Estructura relevante:

```text
zones["productiva"]
```

Contiene exactamente:

```text
520 nomenclaturas únicas
```

Máscara Productivo reconstruida:

```text
public/data/auditoria/zonificacion-11819-productiva.geojson.gz
```

Importante:
- ese archivo contiene una **geometría disuelta**, no 520 features;
- la membresía parcelaria y la máscara espacial son dos conceptos distintos.

Geometría parcelaria:

```text
public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson
public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson
public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson
public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson
```

Regla de recorte analítico:

```text
unión de las 520 parcelas GeoARBA Productivo
INTERSECT
máscara Productivo disuelta
```

Mediciones actuales:
- unión de 520 parcelas GeoARBA: `1302.009911 ha`;
- máscara Productivo reparada: `1302.017563 ha`;
- intersección efectiva: `1301.886167 ha`;
- cobertura intersección / parcelas: `0.999905`;
- cobertura intersección / máscara: `0.999899`.

Referencia administrativa previa de superficie Productivo:

```text
1303.584699 ha
```

No mezclar automáticamente esa cifra administrativa con la superficie geométrica efectiva del pipeline.

Las zonas `recuperacion`, `equipamiento` y `uso_especifico` se usan como contexto, no en numerador ni denominador Productivo.

---

## 3. Regla semántica

Terminología permitida:
- `ocupación física detectada`;
- `transformación aparente`;
- `urbanización observable`;
- `transformación física observable`;
- `señales de preparación para subdivisión`;
- `señal de loteo físico`.

No usar como salida automática:
- `ilegal`;
- `usurpado`;
- `en negro`;
- `venta irregular`;
- equivalentes.

Separar siempre:

```text
1. dimensión física
2. dimensión administrativa/catastral
3. dimensión legal/comercial
```

---

## 4. Estado actual de la zonificación

Reconstrucción del Anexo I de la Ordenanza 11.819/20:
- estado: `final-reconstruction`;
- Productivo: 520 parcelas;
- residuo mediano aproximado del registro del Anexo: `1.34 m`;
- parcelas limítrofes no concluyentes quedan publicadas aparte como ambiguas;
- GeoARBA actual puede diferir del estado catastral de 2020.

Archivos principales:

```text
public/data/auditoria/zonificacion-11819-productiva.geojson.gz
public/data/auditoria/zonificacion-11819-recuperacion.geojson.gz
public/data/auditoria/zonificacion-11819-equipamiento.geojson.gz
public/data/auditoria/zonificacion-11819-uso-especifico.geojson
public/data/auditoria/zonificacion-11819-asignaciones.json.gz
public/data/auditoria/zonificacion-11819-qa.json
```

Documentos que fijan criterio:

```text
TERRITORIAL_SCOPE_PRODUCTIVO.md
TERRITORIAL_LOTEO_CRITERIA.md
TERRITORIAL_ML_MASTER_PLAN.md
TERRITORIAL_BUILDING_V3_QA_2023.md
```

Ante una ambigüedad espacial, prevalecen los dos primeros.

---

## 5. Cluster 2: piloto VHR

Cluster de trabajo inicial:

```text
cluster_id = 2
```

BBox WGS84:

```text
[-58.34573983010086, -34.882246399467945,
 -58.33009294873659, -34.86837586219111]
```

Mosaicos:

```text
2917 x 3152 px
zoom = 18
```

Fechas:
- 2016-11-30;
- 2020-03-03;
- 2022-03-01;
- 2023-04-19;
- 2026-01-11.

Metadata versionada:

```text
config/territorial/cluster-02-georef.json
```

2023 es la referencia geométrica.

QA píxel ↔ coordenada:

```text
bbox world span = 2916.790 x 3151.707 px
raster          = 2917 x 3152 px
delta           = 0.210 x 0.293 px
```

Interpretación: georreferencia esencialmente exacta para el piloto.

---

## 6. Registro histórico

QA del registro local contra 2023:

| Año | tiles válidos | variación espacial | p95 residual |
|---|---:|---:|---:|
| 2016 | 9/16 | 0.57 px | 1.0 px |
| 2020 | 11/16 | 1.33 px | 2.7 px |
| 2022 | 16/16 | 0.24 px | 0.25 px |
| 2026 | 15/16 | 0.0 px | 0.0 px |

Lectura:
- 2022 y 2026: alta confianza;
- 2016: utilizable con confianza moderada;
- 2020: cambios finos requieren cautela y revisión.

Scripts relacionados:

```text
scripts/register-cluster02-history.py
scripts/apply-local-registration.py
scripts/inspect-cluster02-georef.py
```

---

## 7. Segmentación de cubiertas 2023

Modelo:

```text
hotosm/dinov3s-buildings
```

Versión operativa válida: **V3 oficial**.

V1/V2 quedan sólo como diagnóstico y no deben usarse para cuantificación.

Semántica oficial de salida:
- canal 0: mask logit → sigmoid;
- canal 1: boundary → sigmoid;
- canal 2: signed distance → tanh.

Preprocesamiento oficial:

```text
RGB / 255
mean = [0.4296737853453577,0.4001659668453235,0.34333372802741474]
std  = [0.2056069389373208,0.16738555558380538,0.1598986422586595]
```

Parámetros:

```text
stride = 128
threshold = 0.4371
Gaussian blending sigma_frac = 0.125
min area = 2.6465 m²
simplify = 0.9626 m
```

Corrida V3 2023:
- 528 tiles;
- CPU workstation, 20 threads;
- tiempo total: `198.212 s`;
- fraction @0.30: `0.07765338`;
- fraction @0.4371: `0.07123598`;
- fraction @0.60: `0.06470047`;
- probability mean: `0.07568246`;
- probability p95: `0.8767659`.

Gate visual V3:

```text
PASS
```

No repetir inferencia V3 salvo una razón metodológica nueva.

Script:

```text
scripts/infer-building-mask.py
```

---

## 8. Vectorización V3 Productivo

Script:

```text
scripts/vectorize-building-v3-productivo.py
```

Pipeline:

```text
probability + signed distance
→ watershed
→ contornos
→ world-pixel z18 → WGS84
→ EPSG:32721
→ clip Productivo estricto
→ filtro de área
→ asignación a parcela Productivo
→ GeoJSON / CSV / resumen parcelario / QA
```

Resultado 2023:
- 520 parcelas Productivo resueltas;
- 0 parcelas inválidas reparadas;
- 1 geometría de máscara reparada;
- `raw_instance_labels = 790`;
- `objects_inside_productivo = 290`;
- superficie detectada provisional: `60,381.44 m²`;
- 49 parcelas con al menos una detección.

Regla crítica:

```text
290 != cantidad real de edificios
790 != cantidad real de edificios
```

La subcapa queda aceptada como **superficie cubierta observable**, no como conteo de edificios.

---

## 9. QA visual y Overture

Scripts:

```text
scripts/qa-building-v3-productivo.py
scripts/qa-building-v3-overture-disagreements.py
```

QA general:
- muestra visual de 40 objetos;
- georreferencia: PASS;
- segmentación como superficie cubierta: PASS CON QA;
- conteo/separación de instancias: no validado.

Overture recuperado localmente:

```text
tmp/territorial-analysis/overture-buildings-bbox.geojson
```

Métricas:
- 1544 features Overture en bbox;
- 279/290 V3 con algún solapamiento = `96.2%`;
- 229/290 con solapamiento >=50% = `79.0%`;
- mediana de fracción solapada = `0.7436`;
- 11 V3 sin overlap;
- 61 V3 con overlap <50%.

Revisión dirigida:
- muchos desacuerdos son cubiertas reales omitidas, simplificadas, desplazadas o particionadas distinto por Overture;
- falsos positivos reales aparecen sobre suelo desnudo/preparado, piletas/agua y algunas superficies no edilicias;
- complejos productivos e invernaderos se fusionan con frecuencia.

Overture es feature/QA auxiliar, **nunca filtro duro ni ground truth**.

Clases mínimas previstas para superficie:

```text
building_or_roof_surface
greenhouse_or_productive_cover
probable_nonbuilding_surface
uncertain_surface
```

---

## 10. Próximo bloque activo

La prioridad ya no es perfeccionar el conteo de edificios.

Fase activa:

```text
Señales no edilicias de loteo físico
```

Orden de implementación:
1. movimiento de suelo / nivelación / desmonte;
2. calles o trazados internos;
3. infraestructura visible: postes, tendidos, accesos;
4. cercos / muros;
5. patrón morfológico de subdivisión;
6. accesos;
7. combinación con presencia de cubiertas.

Variables objetivo:

```text
earthwork_or_leveling_score
internal_road_score
utility_infrastructure_score
walls_fences_score
subdivision_pattern_score
access_pattern_score
building_presence_score
mixed_preparation_score
physical_loteo_score
physical_loteo_confidence
```

Un área puede tener señal alta de loteo físico sin viviendas si aparecen calles, suelo nivelado, postes, cercos y subdivisión aparente.

---

## 11. Agregación parcelaria objetivo

Por parcela Productivo:

```text
partida
nomenclatura
productive_area_m2
building_or_roof_surface_m2
greenhouse_or_productive_cover_m2
probable_nonbuilding_surface_m2
uncertain_surface_m2
earthwork_score
internal_road_score
utility_infrastructure_score
walls_fences_score
subdivision_pattern_score
physical_transformation_productive_pct
physical_loteo_score
physical_loteo_confidence
first_observed_date
latest_observed_date
```

Parcelas parcialmente intersectadas:
- medir sólo la porción Productivo.

Serie histórica objetivo:

```text
partida | 2016 | 2020 | 2022 | 2023 | 2026 |
first_change | latest_change | physical_loteo_score | confidence
```

---

## 12. Validación humana

Página pública:

```text
public/validacion-territorial.html
```

Dataset:

```text
public/data/auditoria/territorial-validation-cases.geojson
```

Storage del navegador:

```text
biocorredor-mr:territorial-validation:v1
```

El MVP actual nació con una muestra estratificada de 40 huellas Overture y sirve como semilla metodológica.

No confundir ese MVP con el producto V3 final.

Objetivo futuro:
- 200–300 etiquetas humanas balanceadas;
- split espacial por parcela/cluster;
- separar label humano de output automático;
- no sobrescribir detección con juicio humano.

---

## 13. Paneles públicos

Mapa principal:

```text
public/auditoria-territorial.html
```

URL de producción conocida:

```text
https://biocorredor-mr.embudo.com.ar/auditoria-territorial.html
```

Validación:

```text
https://biocorredor-mr.embudo.com.ar/validacion-territorial.html
```

Panel de estado actual:

```text
public/estado-territorial.html
```

Dataset público del estado:

```text
public/data/auditoria/estado-actual.json
```

El panel de estado debe ser la explicación ejecutiva de:
- qué está validado;
- qué es provisional;
- qué decisiones se tomaron;
- qué falta;
- qué límites legales tiene el análisis.

---

## 14. Cupo legal: estado correcto

No existe todavía una conclusión jurídica cerrada.

Pendientes:
- porcentaje exacto aplicable: `10%` vs `15%`;
- definición del denominador oficial;
- exclusiones del denominador;
- memoria administrativa del cupo;
- expedientes y actos aprobatorios asociados a desarrollos concretos.

Existe un screening espacial histórico usando Productivo como proxy, pero no debe presentarse como contabilidad jurídica definitiva.

Regla:

```text
screening espacial != cierre legal del cupo
```

---

## 15. Arquitectura de cómputo

### Workstation Windows

Usar para:
- inferencia ONNX;
- procesamiento raster;
- vectorización;
- extracción de features;
- QA visual;
- entrenamiento/benchmarks.

Hardware conocido:
- Intel i7-12700;
- 20 hilos lógicos;
- 32 GiB RAM;
- AMD RX 6700 XT;
- DirectML falló y cayó a CPU.

Entorno local territorial:

```text
.venv-territorial-win
```

Activación PowerShell:

```powershell
.\.venv-territorial-win\Scripts\Activate.ps1
```

### VPS

Ruta conocida:

```text
/opt/biocorredor-mr
```

Uso:
- integración;
- publicación;
- servicios;
- almacenamiento operativo;
- artefactos que sólo existen allí.

No usar VPS para ML pesado si la workstation está disponible.

Archivos/directorios no versionados conocidos en VPS que **no deben borrarse**:

```text
.venv-territorial/
SUPERUSER.md
\
backup.sh
docker-compose*.yml
tmp/
```

Nunca ejecutar:

```text
git clean -fd
```

Nunca borrar archivos de infraestructura desconocidos.

---

## 16. Build web

Proyecto web:
- React + TypeScript + Vite;
- `public/` se copia al output `dist/` durante build.

Scripts:

```text
npm run build
npm run test:run
npm run lint
```

Dockerfile versionado:
- build con Node 20 Alpine;
- output servido por Nginx.

La infraestructura concreta del VPS puede usar archivos Compose no versionados. **No asumir nombres de servicios, puertos ni comandos de despliegue sin inspeccionar el servidor.**

Antes de desplegar:
1. verificar branch y HEAD;
2. verificar `git status --short`;
3. preservar archivos untracked;
4. identificar la infraestructura real que está corriendo;
5. correr build/tests disponibles;
6. actualizar sólo el servicio correspondiente;
7. comprobar URLs públicas.

---

## 17. Artefactos locales importantes

Históricos Cluster 2:

```text
tmp/territorial-analysis/cluster-02-history/
```

Inferencia V3:

```text
tmp/territorial-analysis/cluster-02-history/building-segmentation-v3-official/
```

Vectores Productivo:

```text
tmp/territorial-analysis/cluster-02-history/building-vectors-v3-productivo/
```

QA:

```text
tmp/territorial-analysis/cluster-02-history/building-vectors-v3-productivo/qa/
tmp/territorial-analysis/cluster-02-history/building-vectors-v3-productivo/qa-disagreements/
```

Overture auxiliar:

```text
tmp/territorial-analysis/overture-buildings-bbox.geojson
```

No asumir que estos archivos existen en GitHub.

---

## 18. Estado de fases

| Fase | Estado |
|---|---|
| A · Base cartográfica y registro | operativa para Cluster 2 |
| B · Inferencia cubiertas 2023 | completa |
| C · Vectorización / superficie cubierta | cerrada con QA; conteo no validado |
| D · Señales no edilicias | **activa** |
| E · Agregación Productivo por parcela | pendiente |
| F · Serie histórica combinada | pendiente |
| G · Dataset / validación humana | MVP existente; ampliar |
| H · Capa operativa integrada | pendiente |

---

## 19. Decisiones que no deben reabrirse sin evidencia nueva

1. Scope = Productivo solamente.
2. 520 parcelas se obtienen de `zones["productiva"]`; la máscara Productivo es una geometría disuelta.
3. V1/V2 no son cuantificables.
4. V3 usa semántica y preprocesamiento oficiales.
5. Threshold inicial = `0.4371`.
6. No repetir inferencia V3 por defecto.
7. Overture no es ground truth ni filtro duro.
8. 290 objetos V3 no equivalen a 290 edificios.
9. La superficie cubierta es una señal auxiliar del análisis territorial.
10. La prioridad inmediata son señales no edilicias.
11. No existe todavía conclusión jurídica cerrada sobre cupo.
12. No desplegar `tmp/` experimental a producción sin un producto explícitamente validado.

---

## 20. Cómo debe continuar otro agente

Antes de modificar código:
1. leer `BLUEPRINT.md`;
2. leer `TERRITORIAL_ML_MASTER_PLAN.md`;
3. leer `TERRITORIAL_SCOPE_PRODUCTIVO.md`;
4. leer `TERRITORIAL_LOTEO_CRITERIA.md`;
5. leer `TERRITORIAL_BUILDING_V3_QA_2023.md`;
6. inspeccionar HEAD de `feature/validacion-territorial`;
7. no asumir que producción está sincronizada con GitHub;
8. no rehacer análisis ya cerrados.

Para cada cambio importante actualizar:
- documentación de estado;
- QA;
- siguiente gate;
- `public/data/auditoria/estado-actual.json` si cambia lo que debe mostrar producción.

---

## 21. Definición de éxito

El proyecto estará en una versión analítica madura cuando pueda responder, por cada parcela Productivo y fecha:

```text
¿Qué transformación física observable existe?
¿Qué señales de preparación para loteo aparecen?
¿Cuándo aparecen por primera vez?
¿Qué confianza tiene cada señal?
¿Qué superficie Productivo afecta?
¿Qué antecedentes administrativos están vinculados?
¿Qué parte sigue sin explicación documental?
```

Y pueda hacerlo sin confundir evidencia física con conclusión jurídica.
