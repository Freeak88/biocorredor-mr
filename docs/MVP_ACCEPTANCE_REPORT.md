# Informe de aceptación técnica del MVP

Fecha: 2026-08-06  
Rama: `mvp-relevamiento-15-agosto`  
Commit: `72ab8bb`  
Fase: auditoría sin modificar código.

## Resultado ejecutivo

**NO APTO PARA EL 15**.

La aplicación compila y la suite unitaria pasa, pero eso no demuestra el circuito operativo solicitado. Faltan exportación del paquete probatorio, prueba offline real con cuatro registros y fotografías, persistencia offline del evento/cierre, generación de preview/EXIF y corrección versionada de registros sellados.

## Remediación crítica: Bloque A

Estado: **IMPLEMENTADO Y PROBADO** en el commit de éxito `feat: add verified independent offline field fallback`. Se incorporó un fallback estático independiente de PocketBase en `public/field-fallback/`, con jornada local, ocurrencias, cambios territoriales, GPS/precisión, Blob durable en IndexedDB, SHA-256, exportación ZIP y service worker de precache.

La prueba de producción `PLAYWRIGHT_PRODUCTION=1 npx playwright test e2e/offline-fallback.spec.ts --project=chromium` pasó **dos veces consecutivas** usando perfil persistente: tras cerrar/reabrir completamente y sin red se recuperaron 3 registros y 3 fotografías originales. El ZIP demo se encuentra en `artifacts/block-a/biocorredor-field-fallback-demo.zip`; se verificaron hashes de manifiesto, backup y las tres medias.

Tabla de recursos offline observada:

| URL | Destino | Estado | Content-Type | Origen |
|---|---|---:|---|---|
| `/field-fallback/index.html` | document | 200 | `text/html;charset=utf-8` | precache |
| `/field-fallback/fallback.js` | script | 200 | `text/javascript` | precache |
| `/field-fallback/fallback.css` | style | 200 | `text/css` | precache |
| `/field-fallback/manifest.webmanifest` | manifest | 200 | `application/manifest+json` | precache |

La regla corregida aplica fallback HTML sólo a navegación/documento; scripts, estilos, workers y manifest requieren respuesta cacheada con MIME propio. El cache versionado es `biocorredor-field-fallback-v2`.

## Cumplimiento P0

La planilla declara 71 campos/requisitos P0. La clasificación aplicada es la de `docs/IMPLEMENTATION_TRACEABILITY.md`. El cálculo reproducible es:

| Estado P0 | Conteo auditado | Peso | Puntos |
|---|---:|---:|---:|
| IMPLEMENTADO_Y_PROBADO | 6 | 1,0 | 6,0 |
| IMPLEMENTADO_SIN_PROBAR | 31 | 0,6 | 18,6 |
| PARCIAL | 27 | 0,3 | 8,1 |
| SOLO_DOCUMENTADO | 0 | 0,1 | 0,0 |
| NO_IMPLEMENTADO/BLOQUEADO | 7 | 0,0 | 0,0 |
| **Total** | **71** |  | **32,7 / 71 = 46,1%** |

Este porcentaje es de preparación documental/funcional P0, no una aprobación de ensayo. La matriz completa y el criterio de cada conteo están en `IMPLEMENTATION_TRACEABILITY.md`.

## Pruebas ejecutadas

| Comando | Código | Resultado |
|---|---:|---|
| `npm run lint` | 0 | TypeScript sin errores. |
| `npm run test:run -- --pool=forks --poolOptions.forks.singleFork=true` | 0 | 7 archivos, 65 tests, 65 aprobados, 0 fallidos. |
| `npm run build` | 0 | Build Vite de producción correcto; advertencia: chunk `vendor` vacío. |
| `docker compose -f docker-compose.local.yml config --quiet` | 0 | Configuración válida; no implica migración ejecutada. |
| `npm run e2e` | Bloqueado | No completó en este entorno; no se contabiliza como prueba. |
| Migración desde base vacía | No ejecutado | Requiere levantar PocketBase efímero; no se infiere desde archivos. |
| Backup/restauración/exportación | No ejecutado | No existe servicio que genere el paquete solicitado. |

## Pruebas obligatorias no demostradas

No se ejecutó la secuencia de cuatro registros offline porque hacerlo sin un flujo de prueba reproducible y PocketBase efímero produciría una afirmación no verificable. Por lo tanto no hay logs reales, IDs de servidor, conteo post-sync, ZIP ni hash de manifiesto para reportar. El detalle está en `MVP_GAPS.json`.

## Bloqueantes

1. No existe exportación completa `events.csv`, `occurrences.csv`, `identifications.csv`, `territorial_changes.csv`, GeoJSON, backup, hashes, manifiesto y media.
2. Inicio/cierre de evento no se encolan como operaciones offline cuando PocketBase no responde.
3. La durabilidad de las fotografías tras cerrar/reabrir el navegador no está probada; el fallback localStorage tampoco es adecuado para archivos grandes.
4. La idempotencia no está respaldada por índices únicos para `change_id` y `media_id`, y no existe prueba de doble sincronización.
5. Sellado/corrección versionada sólo está parcialmente modelado; las colecciones de observaciones, cambios y media siguen permitiendo update autenticado.
6. La separación de coordenadas reservadas/públicas no tiene generalización ni reglas diferenciadas probadas.

## Alcance cubierto

Se revisaron repositorio, rama, commits, migraciones, hooks, colecciones, interfaces/captura, IndexedDB, sync, archivos, hashes, exportadores, tests, documentación, Docker y fallback. El mapa GeoARBA y el tracking de ruta existen, pero no se consideran prueba de disponibilidad offline porque no se ejecutó un escenario sin red.

## Próxima acción

La ejecución queda detenida al completar Bloque A, como solicitaste. Bloque B y los restantes no fueron iniciados.

## Modo Campo MR: `MR-20260815`

Se verificó el bloque recortado de piloto sobre `/field-fallback/`, sin modificar la aplicación React principal ni implementar tracking continuo. El E2E de producción pasó tres veces consecutivas desde perfiles limpios con el ciclo online → offline → cierre total → reapertura → nueva captura offline → cierre → ZIP.

La jornada exportada conserva `eventId`, `eventName`, `teamId`, `observerName`, `sectorId`, `deviceId`, `protocolVersion`, `startedAt`, `completedAt` y `status`. Las observaciones conservan categoría, nombre de campo, nombre científico opcional, certeza, ambiente, abundancia, fenología, timestamp, GPS, precisión y medios originales. El artefacto de aceptación es `artifacts/block-a/biocorredor-MR-20260815-acceptance.zip`.

## Microfase A.1: papel y QR

Se agregó trazabilidad manual offline mediante `paper_id`, incluyendo normalización, validación local, detección de duplicado en IndexedDB, URL `?paper=`, imagen original de ficha como `paper_original`, hash y exportación bajo `paper/<paper_id>/`. La prueba específica es `e2e/offline-paper-id.spec.ts`. El escaneo QR por cámara y la sincronización/conflicto remoto no se declaran implementados en esta microfase.


## Bloque B: ciclo offline de jornadas y metodología mínima

Estado: **IMPLEMENTADO Y PROBADO**. La prueba de aceptación pasó en producción con perfil persistente. Se añadieron `strata`, `sampling_units`, campos metodológicos de `survey_events`, `morphospecies_code` y `evidence_type` en la migración `1790000016_sampling_methodology.js`. El fallback precarga catálogos, permite una jornada estandarizada/estratificada con `MR-PAS-T01`, conserva dos observaciones con/sin `paper_id`, morfoespecie y fotografías, y permite recuperación y cierre offline.

La prueba de aceptación es `e2e/offline-survey-methodology.spec.ts`. Se mantienen fuera de B QR por cámara, sincronización remota, `paper_record`, integraciones taxonómicas y análisis estadístico. La especificación de datos está en `docs/SAMPLING_MODEL.md`.


## Bloque C: media offline y evidencia

Estado: **IMPLEMENTADO Y PROBADO** para PHOTO P0. Se consolidó la persistencia del original como Blob en IndexedDB, con SHA-256 sobre bytes exactos, roles de evidencia, relaciones padre, metadatos de ciclo de vida y reconstrucción de previews con `objectURL`. El fallback y el campo principal comparten la garantía de almacenamiento; la sincronización remota queda preparada mediante `local_id`, `server_id`, `retry_count` y `last_sync_error`, pero sigue fuera de este bloque.

La prueba `e2e/offline-media-persistence.spec.ts` verifica cinco fotografías correspondientes a ocurrencia, ambiente, detalle diagnóstico, cambio territorial y ficha `MR-20260815-P017`. Tras cerrar página y contexto, se recuperan los cinco Blob, se recalculan sus hashes y se vuelven a mostrar las cinco previews. Las cuatro pruebas offline A/A.1/B/C pasan juntas. No se implementan audio, video, documentos ni upload remoto.


## Corrección Gate D.0: contrato de unidad de esfuerzo

Se corrigió de forma aditiva el catálogo de unidades de esfuerzo. La aplicación, el fallback y PocketBase comparten ahora `minutes`, `observer_minutes`, `meters`, `kilometers`, `square_meters`, `points`, `point_minutes` y `other`. Los aliases históricos inequívocos se normalizan sin convertir magnitudes distintas. `sampling_effort_notes` permite documentar unidades extraordinarias. La reconstrucción limpia de PocketBase, las ocho escrituras reales y el rechazo de `banana` quedaron verificadas; el Bloque D de sincronización remota no se inició.
