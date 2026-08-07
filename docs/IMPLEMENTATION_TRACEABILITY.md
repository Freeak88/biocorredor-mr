# Auditoría de trazabilidad de implementación

Fecha de auditoría: 2026-08-06  
Rama: `mvp-relevamiento-15-agosto`  
Commit auditado: `72ab8bb` (`feat: enforce offline field record integrity`)  
Fuente obligatoria: `docs/operativo/Modelo_campos_MVP_Biocorredor_MR_v1.xlsx`, `Adenda_Aletheia_modelo_campos_Biocorredor_MR_v1.md`, protocolo científico, ficha única y etiquetas QR.

## Criterio

La matriz usa exclusivamente los estados solicitados. `IMPLEMENTADO_Y_PROBADO` exige persistencia, interfaz o flujo ejecutable y una prueba que lo cubra. La existencia de una migración, interfaz o documento aislado se informa como `PARCIAL` o `SOLO_DOCUMENTADO`.

Referencias de evidencia:

| Código | Evidencia verificable |
|---|---|
| E1 | `pocketbase/pb_migrations/1790000000_biocorredor_core.js:91-349`: colecciones, campos, índices y reglas base. |
| E2 | `pocketbase/pb_migrations/1790000001_operational_closure.js:29-58`: cierre, coordenadas públicas/reservadas y consentimiento. |
| E3 | `pocketbase/pb_migrations/1790000006_route_tracking.js:8-31`: recorrido GPS e índice único. |
| E4 | `pocketbase/pb_migrations/1790000008_event_assignments.js:16-56`: equipos, dispositivos y asignaciones. |
| E5 | `pocketbase/pb_migrations/1790000013_operational_field_model.js:20-73`: campos operativos adicionales. |
| E6 | `pocketbase/pb_migrations/1790000014_operational_integrity.js:8-27`: estado de sincronización, coordenada pública y regla de evento sellado. |
| E7 | `src/components/FieldJourneyPanel.tsx:30-105`: jornada, checklist, inicio, cierre y acceso a captura. |
| E8 | `src/components/FieldSurveyPanel.tsx:40-235`: captura, GPS, hash, cola, media e impacto territorial. |
| E9 | `src/lib/offline.ts:23-201`: IndexedDB, fallback localStorage, cola y borrado por operación. |
| E10 | `src/services/routeTracking.ts:27-54`: puntos de ruta e idempotencia básica. |
| E11 | `src/components/CoordinatorPanel.tsx:20-106`: listado, filtro, exportación simple y asignaciones. |
| E12 | `src/hooks/useAdmin.ts:109-141`: exportación heredada de sightings a un solo GeoJSON. |
| E13 | `src/__tests__`: 65 tests unitarios/componentes; no cubren la captura offline real ni exportación operativa. |
| E14 | `docs/operativo/evaluacion-caminos-usuario.md` y `docs/CHECKLIST_JORNADA.md`: documentación, no prueba de ejecución. |

## Colecciones PocketBase

| Colección | Esquema actual, relaciones e índices | Reglas de acceso | Migración | Auditoría |
|---|---|---|---|---|
| `projects` | `code`, `name`, `description`, `organization`, `area_geojson`, `status`, `public_coordinate_precision_m`; índice único `code`. | Lectura autenticada; alta/edición/borrado admin. | `1790000000:91-107` | PARCIAL: no existe campo técnico `project_id` separado; no hay prueba de migración desde vacío. |
| `protocols` | `code`, `version`, `title`, `description`, `sampling_method`, `required_fields_json`, `status`, `document`, `document_sha256`; índice único `(code, version)`. | Lectura autenticada; escritura admin. | `1790000000:109-127` | PARCIAL: hash/documento existen, pero no hay publicación/sellado probado ni UI operativa del protocolo. |
| `sites` | relación `project`; `code`, `name`, `type`, `geometry_geojson`, `habitat`, `description`, `access_notes`, `status`; índice `(project, code)`. | Lectura autenticada; escritura coordinación/admin. | `1790000000:129-147` | PARCIAL: catálogo y asignación existen; mapa de sectores no demuestra edición offline. |
| `survey_events` | `event_id`, relaciones project/site/protocol/parent_event, `title`, `team_name`, `participants`, fechas, esfuerzo, track, clima, hábitat, notas, estado, creador, sellado; índices por id/estado. | Alta autenticada; actualización autenticada; regla sellado agregada en `1790000014`. | `1790000000:149-188`, `1790000001:29-34`, `1790000013:20-34`, `1790000014:26` | PARCIAL: inicio/cierre funciona online, pero no tiene cola de operación para el cierre cuando PocketBase no responde. |
| `occurrences` | `occurrence_id`, relaciones event/observer, fecha, lat/lon/incertidumbre, fuente, field/scientific name, taxón, cantidad, unidad, etapa, conducta, sustrato, microhábitat, estado, identificación, sensibilidad, visibilidad, notas y estado local; campos operativos adicionales y coordenadas públicas. Índices por id/event/observer. | CRUD autenticado; borrado admin. | `1790000000:190-224`, `1790000001:36-39`, `1790000013:36-51`, `1790000014:8-13` | PARCIAL: captura offline e ID funcionan en código, pero no existe prueba real de cierre/reapertura ni exportación completa. |
| `media_evidence` | relaciones opcionales a occurrence/change/event; original y preview; hash, MIME, tamaño, captura/carga, lat/lon, EXIF, dispositivo, tipo, original, sync status, creador; índices de relación/hash. | CRUD autenticado; borrado admin. | `1790000000:251-280`, `1790000013:53-60`, `1790000014:21-23` | PARCIAL: se conserva original y hash; no se genera preview, no se preserva EXIF desde captura, ni se verifica reintento de archivo tras cierre del navegador. |
| `identifications` | relación occurrence, nombre, taxón, validador, fecha, confianza numérica, diagnóstico, referencias, estado y `supersedes`; índice por occurrence. | Lectura autenticada; escritura coordinación; borrado admin. | `1790000000:282-311`, `1790000013:62-68` | PARCIAL: modelo separado existe; no hay pantalla de curaduría/versionado ni prueba de corrección. |
| `territorial_changes` | relación event/observer; tipo controlado, fecha, lat/lon/incertidumbre, geometría, área, descripción, severidad, estado, visibilidad, notas, `change_id`, versión y sync status. Índice sólo por event. | CRUD autenticado; borrado admin. | `1790000000:226-249`, `1790000013:70-73`, `1790000014:16-19` | PARCIAL: formulario de captura comparte `FieldSurveyPanel`; persistencia separada sí, exportación separada no, índice único de `change_id` no. |
| `audit_log` | actor, action, collection, record, timestamp, reason, metadata; índice `(collection_name, record_id)`. | Lectura coordinación; creación autenticada; sin update; borrado admin. | `1790000000:313-329` | PARCIAL: colección existe; no se escriben auditorías para captura/cierre/correcciones/sincronización. |
| `export_manifests` | project/event, generación, creador, conteos, `files_json`, hash y archivo de manifiesto; índice project/event. | Lectura/creación coordinación; update coordinación; borrado admin. | `1790000000:331-349` | PARCIAL: CoordinatorPanel crea un registro ficticio con `sha256: local-export`; no genera manifiesto/hash real. |

## Matriz P0: 71 campos/requisitos

Los campos se toman individualmente del `Diccionario_campos` y `Reglas_validacion` de la planilla. La columna evidencia usa las referencias detalladas arriba; “exportación” se refiere al exportador operativo y no a que el campo exista en PocketBase.

| Requisito | Estado | Modelo/campo exacto | Evidencia, pantalla, offline/sync, exportación, prueba, commit | Brecha |
|---|---|---|---|---|
| ID interno del proyecto | PARCIAL | `projects.id` (no `project_id`) | E1; Admin/configuración; sólo servidor; no exportado; E13 no lo prueba; `5c2cd19`. | Falta UUID de dominio explícito y prueba offline. |
| Código del proyecto | IMPLEMENTADO_SIN_PROBAR | `projects.code` | E1; configuración; servidor; aparece en export simple; sin prueba; `5c2cd19`. | No hay export completo probado. |
| Nombre del proyecto | IMPLEMENTADO_SIN_PROBAR | `projects.name` | E1; configuración; servidor; export simple; sin prueba; `5c2cd19`. | — |
| ID del protocolo | PARCIAL | `protocols.id` | E1; no hay pantalla de protocolo; offline documental; no exportado; sin prueba; `5c2cd19`. | Falta identificador de dominio/UI. |
| Código del protocolo | IMPLEMENTADO_SIN_PROBAR | `protocols.code` | E1; sólo catálogo; no captura desde UI; no exportado; sin prueba; `5c2cd19`. | El evento no muestra protocolo visible en captura. |
| Versión de protocolo | IMPLEMENTADO_SIN_PROBAR | `protocols.version`, `survey_events.protocol_version` | E1/E5; captura indirecta; sin cola de evento; no exportado; sin prueba; `2376204`. | No se demuestra hash/version congelada. |
| Versión de aplicación | IMPLEMENTADO_SIN_PROBAR | `survey_events.app_version` | E5; no se completa en FieldJourney; no exportado; sin prueba; `2376204`. | Campo existe pero no se persiste en flujo. |
| ID de evento | IMPLEMENTADO_Y_PROBADO | `survey_events.event_id` | E1/E7; jornada; inicio/cierre online; no creación offline; no export completo; E13 sólo smoke; `5c2cd19`. | La prueba no cubre creación offline. |
| Jornada madre | PARCIAL | `survey_events.parent_event` | E1; no aparece en pantalla; sin offline/sync probado; no exportado; sin prueba; `5c2cd19`. | Relación existe pero no se gestiona. |
| Sector/sitio | IMPLEMENTADO_Y_PROBADO | `survey_events.site`, `sites` | E1/E4/E7; sector asignado visible; depende de servidor; no export completo; E13 territorial; `319f6f0`. | No hay cache/offline de catálogo demostrada. |
| Equipo | PARCIAL | `survey_events.team_name`, `teams`/assignment | E1/E4/E7; visible por asignación; no se copia como relación del evento; no exportado; sin prueba; `319f6f0`. | Campo textual no normalizado. |
| Participantes | PARCIAL | `survey_events.participants` | E1/E4/E7; assignment visible; no validación >=1 ni cierre con lista; no exportado; sin prueba; `319f6f0`. | Se cierra con `observers_count: 1` fijo. |
| Inicio | IMPLEMENTADO_Y_PROBADO | `started_at` | E1/E7:69; botón iniciar; online; no cola si falla; no export completo; smoke indirecto; `f919895`. | Persistencia local sólo estado UI. |
| Fin | PARCIAL | `ended_at`, `closed_at` | E1/E2/E7:76; formulario cierre; sin cola; no export; sin prueba; `f919895`. | No se prueba relación inicio<fin ni reintento. |
| Método de muestreo | PARCIAL | `sampling_method` | E5; no formulario; no offline/sync; no export; sin prueba; `2376204`. | Sólo esquema. |
| Valor del esfuerzo | PARCIAL | `sampling_effort_value` | E5; cierre usa distancia/duración no este campo; no export; sin prueba; `2376204`. | No se persiste en cierre. |
| Unidad del esfuerzo | PARCIAL | `sampling_effort_unit` | E5; no UI; no export; sin prueba; `2376204`. | Sólo esquema. |
| Cantidad de observadores | PARCIAL | `observers_count` | E1/E7; cierre escribe 1; no export; sin prueba; `f919895`. | No deriva participantes reales. |
| Ambiente del evento | PARCIAL | `habitat`, `habitat_summary` | E1/E5/E7; cierre captura texto; no export; sin prueba; `2376204`. | No catálogo múltiple ni prueba. |
| Estado del evento | PARCIAL | `survey_events.status` | E1/E7; inicio/cierre online; no cola y sellado no probado; no export; E13 no lo cubre; `f919895`. | Regla de sellado no prueba corrección/versionado. |
| Limitaciones/incidentes | IMPLEMENTADO_SIN_PROBAR | `incidents`, `unvisited_sectors`, `notes` | E2/E7; cierre captura; sin cola; no export; sin prueba; `f919895`. | No se verifica límite/manifest. |
| ID de observación | IMPLEMENTADO_Y_PROBADO | `occurrence_id` | E5/E8:114; `newLocalId`; IndexedDB; upsert por error; no export completo; sin prueba específica; `72ab8bb`. | Falta test automatizado de reinicio/duplicado. |
| Evento asociado | IMPLEMENTADO_Y_PROBADO | `occurrences.event` | E1/E8; bloqueo por asignación/jornada; cola payload; no export completo; E13 no lo prueba; `f919895`. | — |
| Observador | IMPLEMENTADO_SIN_PROBAR | `occurrences.observer` | E1/E8; usuario autenticado; cola; no export; sin prueba; `5c2cd19`. | No prueba de no exposición de identidad. |
| Fecha/hora observación | IMPLEMENTADO_SIN_PROBAR | `observed_at` | E8:111; cola; sincroniza; no export completo; sin prueba; `2376204`. | No validación dentro del evento. |
| Grupo taxonómico | IMPLEMENTADO_Y_PROBADO | `taxon_group` | E5/E8:139,224; formulario; cola; no export completo; tipos pasan; `2376204`. | Catálogo legado y nuevo mezclados. |
| Nombre de campo | IMPLEMENTADO_SIN_PROBAR | `field_name` | E1/E8 usa `scientific_name`/fallback; cola; export simple usa scientific_name; sin prueba; `2376204`. | No se conserva `field_name` separado. |
| Estado de ocurrencia | PARCIAL | `occurrence_status` | E1/E8 fija `detected`; cola; no export; sin prueba; `2376204`. | No implementa `not_detected` con protocolo/esfuerzo. |
| Base del registro | IMPLEMENTADO_SIN_PROBAR | `basis_of_record` | E5/E8:137; cola; no export; sin prueba; `2376204`. | No validación de catálogo. |
| Tipo de evidencia | IMPLEMENTADO_SIN_PROBAR | `evidence_types` | E5/E8; foto o vacío; cola; no export; sin prueba; `2376204`. | No permite audio/rastro/nido en captura. |
| Cantidad | IMPLEMENTADO_SIN_PROBAR | `quantity` | E1/E8; guarda sin bloquear; cola; export simple no incluye; sin prueba; `2376204`. | No acepta cero/rango estructurado. |
| Unidad | IMPLEMENTADO_SIN_PROBAR | `quantity_unit` | E8 deriva individuals/cover_percent; cola; no export; sin prueba; `2376204`. | No colonias/indicios y depende de count_method. |
| Hábitat | PARCIAL | `habitat`, `microhabitat` | E1/E8; formulario “condición del lugar”; cola; no export; sin prueba; `2376204`. | No catálogo `habitat` separado. |
| Sustrato | IMPLEMENTADO_SIN_PROBAR | `substrate` | E1/E8; formulario; cola; no export; sin prueba; `2376204`. | No validación condicional. |
| Sensibilidad | IMPLEMENTADO_SIN_PROBAR | `sensitive_record` | E1/E2/E8; checkbox; privada; no export; sin prueba; `2376204`. | No generaliza coordenada pública. |
| Completitud | IMPLEMENTADO_SIN_PROBAR | `completeness_status` | E5/E8:141; calculada foto+GPS; cola; no export; sin prueba; `2376204`. | No distingue identificación/protocolo/esfuerzo. |
| Latitud | IMPLEMENTADO_SIN_PROBAR | `latitude` | E1/E8; GPS opcional; cola; export simple sí; sin prueba; `72ab8bb`. | Sin prueba de rango. |
| Longitud | IMPLEMENTADO_SIN_PROBAR | `longitude` | E1/E8; GPS opcional; cola; export simple sí; sin prueba; `72ab8bb`. | Sin prueba de rango. |
| Datum WGS84 | IMPLEMENTADO_SIN_PROBAR | `geodetic_datum` | E5/E8; fija WGS84 para occurrence; no territorial; no export; sin prueba; `2376204`. | Falta EPSG:4326 y export. |
| Precisión GPS | IMPLEMENTADO_SIN_PROBAR | `coordinate_uncertainty_m`, `gps_accuracy_m` | E1/E2/E8; usa `coords.accuracy`; semáforo UI; no export; sin prueba; `72ab8bb`. | No duplica correctamente `gps_accuracy_m`. |
| Fuente ubicación | IMPLEMENTADO_SIN_PROBAR | `location_source` | E1/E8; gps/missing; cola; no export; sin prueba; `2376204`. | No manual/EXIF/estimada. |
| Momento captura GPS | IMPLEMENTADO_SIN_PROBAR | `location_captured_at` | E5/E8; cola; no export; sin prueba; `2376204`. | — |
| ID de media | IMPLEMENTADO_SIN_PROBAR | `media_id` | E5/E8; UUID local; cola; no export; sin prueba; `72ab8bb`. | Sin índice único. |
| Original | PARCIAL | `media_evidence.original_file` | E1/E8; File/dataURL en cola; no prueba de cierre del navegador; no export ZIP; `72ab8bb`. | IndexedDB guarda operación, no blob dedicado. |
| Tipo media | IMPLEMENTADO_SIN_PROBAR | `media_type` | E1/E8 fija photo; cola; no export; sin prueba; `2376204`. | No audio/video/documento en UI. |
| Hash SHA-256 | IMPLEMENTADO_SIN_PROBAR | `sha256` | E8:97,180-184; calculado antes de cola; no manifiesto; no prueba; `72ab8bb`. | No validación de 64 hex al sellar. |
| MIME | IMPLEMENTADO_SIN_PROBAR | `mime_type` | E8:180-182; cola; no export; sin prueba; `2376204`. | — |
| Tamaño | IMPLEMENTADO_SIN_PROBAR | `file_size` | E1/E8; cola; no export; sin prueba; `2376204`. | Nombre difiere de `file_size_bytes`. |
| Fecha captura media | NO_IMPLEMENTADO | `captured_at` | Campo E1; FieldSurvey no lo envía; no offline/export/test; `2376204`. | No EXIF ni captura de dispositivo. |
| Fecha incorporación media | IMPLEMENTADO_SIN_PROBAR | `ingested_at` | E5/E8; al sincronizar; no export; sin prueba; `72ab8bb`. | No se diferencia de uploaded_at. |
| ID de cambio territorial | IMPLEMENTADO_SIN_PROBAR | `change_id` | E5/E8:115; cola separada; no export; sin prueba; `72ab8bb`. | Falta índice único. |
| Evento del cambio | IMPLEMENTADO_SIN_PROBAR | `territorial_changes.event` | E1/E8; cola separada; no export; sin prueba; `72ab8bb`. | — |
| Tipo de cambio | IMPLEMENTADO_SIN_PROBAR | `change_type` | E1/E8:125,223; select; cola; no export; sin prueba; `72ab8bb`. | — |
| Fecha/hora cambio | IMPLEMENTADO_SIN_PROBAR | `observed_at` | E8:111; cola; no export; sin prueba; `72ab8bb`. | — |
| Descripción objetiva | IMPLEMENTADO_SIN_PROBAR | `objective_description` | E1/E8; campo y texto objetivo; cola; no export; sin prueba; `72ab8bb`. | No filtro de acusaciones. |
| Auditoría creación | PARCIAL | `created`, `created_by` / `audit_log` | E1/E8; PB genera created; no audit log por operación; no export; sin prueba; `5c2cd19`. | Falta cadena de auditoría. |
| Auditoría actualización | NO_IMPLEMENTADO | `updated_at`/version auditada | E1/E6; no hook de cambios; no export/test; `72ab8bb`. | No motivo obligatorio ni versión nueva. |
| Visibilidad privada | IMPLEMENTADO_SIN_PROBAR | `public_visibility=private` | E1/E8; fija private; cola; no export; sin prueba; `72ab8bb`. | No prueba de reglas por rol. |
| Coordenada pública/reservada | PARCIAL | `latitude/longitude`, `public_latitude/public_longitude`, `reserved_coordinates` | E2/E6/E8; originales privadas y públicas nulas; no generalización/test/export; `72ab8bb`. | Falta política de lectura server-side. |
| Manifiesto ID | PARCIAL | `export_manifests.id` / `export_id` | E1/E11:69; creación simple; no cierre real; no export/test; `2376204`. | No `manifest_id` estable de dominio. |
| Conteo registros | PARCIAL | `record_count` | E1/E11:69; cuenta sólo occurrence filtradas; no paquete; no test; `2376204`. | No incluye cambios/media/eventos. |
| Conteo media | NO_IMPLEMENTADO | `media_count` | Campo E1; Coordinator no lo calcula; no export/test; `5c2cd19`. | — |
| Hash manifiesto | NO_IMPLEMENTADO | `manifest_sha256` | E1; Coordinator escribe literal `local-export`; no hash/test; `2376204`. | Bloqueante para sellado. |
| Regla sin GPS | IMPLEMENTADO_Y_PROBADO | comportamiento `position=null` | E8:104-109,141; guardado local; sync payload nulo; no test automatizado; `72ab8bb`. | Prueba sólo por lectura de código. |
| Regla sin foto | IMPLEMENTADO_Y_PROBADO | `evidence_types=[]`, `usable` | E8:141-146; guardado local; sync; no test automatizado; `2376204`. | — |
| Regla `not_detected` | NO_IMPLEMENTADO | `occurrence_status` | E1/E8 fija detected; no protocolo/esfuerzo gate; no export/test; `2376204`. | Requisito de validación incumplido. |
| ID QR duplicado | PARCIAL | `paper_id` | E5/E8:99-105; chequeo sólo online y captura de error indiscriminada; no importación QR ni prueba; `2376204`. | Puede aceptar duplicado por fallo de backend. |

## Matriz P1: 42 campos/requisitos

| Requisito | Estado | Modelo/campo | Evidencia y brecha |
|---|---|---|---|
| Clima | IMPLEMENTADO_SIN_PROBAR | `survey_events.weather` | E1/E7; texto de cierre; sin cola/export/test. |
| Recorrido GeoJSON | PARCIAL | `track_geojson` | E1/E3/E10; puntos se guardan, nunca se construye LineString ni se exporta. |
| Microhábitat | IMPLEMENTADO_SIN_PROBAR | `microhabitat` | E1/E8; texto; no export/test. |
| Nombre científico propuesto | IMPLEMENTADO_SIN_PROBAR | `scientific_name_proposed` | E5/E8; mismo input; no identificación separada/export/test. |
| Calificador | IMPLEMENTADO_SIN_PROBAR | `identification_qualifier` | E5/E8; selector; no validación nombre+qualifier/export/test. |
| Método de cantidad | IMPLEMENTADO_SIN_PROBAR | `count_method` | E5/E8; selector; no export/test. |
| Ubicación manual | NO_IMPLEMENTADO | `manual_location_reason` | E5; no botón/mapa manual ni motivo. |
| EXIF | NO_IMPLEMENTADO | `media_evidence.exif_json` | E1; no extracción ni persistencia desde File. |
| Preview/miniatura | NO_IMPLEMENTADO | `preview_file` | E1; no derivación ni carga. |
| Vista media | PARCIAL | `view_type` | E5; campo existe, UI no lo solicita. |
| Dispositivo media | NO_IMPLEMENTADO | `device_info` | E1; no se completa. |
| Estado media completo | PARCIAL | `sync_status` | E1/E8; estado synced en upload, cola no marca pending/failed/conflict por archivo. |
| Identificación ID | PARCIAL | `identification_id` | E5; campo existe; no alta desde UI. |
| Identificación nombre | PARCIAL | `identifications.scientific_name` | E1; colección existe; no curaduría UI. |
| Rango taxonómico | PARCIAL | `taxon_rank` | E1 como texto; no selector/UI. |
| Validador | PARCIAL | `identified_by` | E1; regla de colección; no flujo. |
| Fecha identificación | PARCIAL | `identified_at`/`date_identified` | E1/E5; no captura. |
| Confianza | PARCIAL | `confidence` | E1 número, planilla catálogo; no UI ni validación. |
| Base diagnóstica | PARCIAL | `diagnostic_features` | E1; no UI. |
| Fuente taxonómica | PARCIAL | `references`/`reference_source` | E1/E5; no UI/export. |
| Identificación reemplazada | PARCIAL | `supersedes` | E1; relación existe; no versión ni prueba. |
| Detalle planta | NO_IMPLEMENTADO | `plant_family_observed`, `growth_form`, `phenology`, `cover_percent`, `health_observation`, `observed_threat` | Sin campos ni UI/migración. |
| Detalle fauna | PARCIAL | `behavior`, `life_stage`; faltan activity/stratum/reproductive/trace | E1/E8 common fields; no campos condicionales. |
| Detalle artrópodo | NO_IMPLEMENTADO | `development_stage`, `associated_plant`, `observed_interaction` | Sin campos/UI. |
| Detalle hongos | PARCIAL | `substrate`, `microhabitat`; faltan growth/hymenophore/size/texture/odor/host | E1/E8; formulario común, no bloque específico. |
| Área estimada | IMPLEMENTADO_SIN_PROBAR | `estimated_area_m2` | E1/E8 usa cantidad; no unidad/método ni export/test. |
| Geometría cambio | NO_IMPLEMENTADO | `geometry_geojson` | Campo existe; captura sólo punto GPS. |
| Severidad inicial | IMPLEMENTADO_SIN_PROBAR | `initial_severity` | E8 fija unknown; no UI ni revisión/test. |
| Precisión pública | NO_IMPLEMENTADO | `public_coordinate_precision_m` | Existe en project; no generalización/publicación. |
| Consentimiento | PARCIAL | `participant_consents` | E2 schema; no formulario/alta ni hash probado. |
| Equipo/dispositivo | PARCIAL | `teams`, `devices`, `event_assignments` | E4/E11; asignación online; no registro en el teléfono offline. |
| Punto de encuentro | IMPLEMENTADO_SIN_PROBAR | `meeting_point` | E2/E7 display/cierre; no prueba. |
| Zonas restringidas | IMPLEMENTADO_SIN_PROBAR | `restricted_zones` | E2 schema; no UI visible ni validación de acceso. |
| Protocolo hash | PARCIAL | `protocol_hash` | E2 field; no cálculo/persistencia en inicio/cierre. |
| Manifiesto del evento | PARCIAL | `manifest_id` | E2 field; se crea export simple, no manifiesto real. |
| Auditoría motivo | NO_IMPLEMENTADO | `audit_log.reason` | Campo existe; ningún flujo lo exige. |
| Conflicto de sync | PARCIAL | `local_status/sync_status=conflict` | E1/E9; no detección ni resolución. |
| Corrección versionada | NO_IMPLEMENTADO | `record_version`, `change_reason` | Campos parciales; no endpoint/UI que cree nueva versión. |
| Export CSV completo | NO_IMPLEMENTADO | exportación | E11 sólo occurrence CSV. |
| Export GeoJSON completo | NO_IMPLEMENTADO | exportación | E12 legacy sólo sightings; E11 no GeoJSON. |
| Backup JSON/ZIP | NO_IMPLEMENTADO | exportación | No generador de paquete. |

## P2

| Requisito | Estado | Evidencia |
|---|---|---|
| Fuente taxonómica/atributos derivados como interfaz estable | SOLO_DOCUMENTADO | Planilla y `docs/operativo/Adenda...`; no flujo de revisión probado. |
| Firma digital del manifiesto | NO_IMPLEMENTADO | `export_manifests.manifest_file` existe en E1; no firma ni validación. |

## Reglas de validación de la planilla

| Regla | Estado | Evidencia |
|---|---|---|
| R01 evento obligatorio | IMPLEMENTADO_SIN_PROBAR | E8 bloquea sin jornada/evento; no prueba de sync final. |
| R02 nombre vacío permitido | IMPLEMENTADO_SIN_PROBAR | E8 usa `Registro pendiente`; no test. |
| R03 sin GPS | IMPLEMENTADO_SIN_PROBAR | E8 permite `position=null`; no test real. |
| R04 precisión >50 | IMPLEMENTADO_SIN_PROBAR | E8 muestra semáforo rojo; no cambia estado ni exige revisión. |
| R05 sin foto | IMPLEMENTADO_SIN_PROBAR | E8 marca usable; no test. |
| R06 hash faltante | PARCIAL | Hash se calcula si hay foto; no estado de fallo/sellado. |
| R07 not_detected | NO_IMPLEMENTADO | E8 fija `detected`. |
| R08 qualifier | PARCIAL | Selector existe, pero no obliga qualifier ante propuesta. |
| R09 cobertura con área/método | NO_IMPLEMENTADO | `cover` permite cantidad sin área/método de unidad. |
| R10 identificación confirmada | NO_IMPLEMENTADO | No hay pantalla que imponga validador/fecha. |
| R11 sensible | PARCIAL | Visibilidad privada sí; generalización pública no. |
| R12 descripción objetiva | PARCIAL | Texto orientativo; no validación. |
| R13 cierre posterior | NO_IMPLEMENTADO | E7 calcula, pero no valida comparación. |
| R14 registro sellado | PARCIAL | E6 protege update de evento; no versión/corrección de occurrence/change. |
| R15 retry idempotente | PARCIAL | E8/E10 recuperan duplicado 400/409; no índices para change/media y no test doble. |
| R16 media failure | PARCIAL | Operación queda en IndexedDB; archivo no tiene blob store dedicado ni prueba de reinicio. |
| R17 fecha futura | NO_IMPLEMENTADO | No validación. |
| R18 fuera de área | PARCIAL | `matchParcel` contextualiza; no alerta de fuera del área general. |
| R19 QR duplicado | PARCIAL | Chequeo online; errores distintos de 404 se tragan. |
| R20 manifiesto conteos/hashes | NO_IMPLEMENTADO | No generador ni gate. |

## Escenarios de aceptación del prompt

| Escenario | Resultado | Evidencia |
|---|---|---|
| Jornada inicia/cierra y se vincula observación | PARCIAL | E7/E8; no offline robusto del evento/cierre. |
| Tres observaciones offline con fotos sobreviven cierre del navegador | BLOQUEADO | E9 usa IndexedDB, pero no hay prueba ejecutada; no hay blob store dedicado ni export de cola. |
| Cambio territorial separado y exportable | PARCIAL | E8 separa colección; no exportación. |
| Dos sincronizaciones no duplican | BLOQUEADO | Código intenta idempotencia, pero no test real ni índice `change_id/media_id`; requiere PocketBase operativo. |
| Mapas/sectores disponibles sin conexión | PARCIAL | GeoJSON estático en `public/data/geoarba`; no prueba de cache/service worker ni sectores completos. |
| Exportación ZIP íntegra | NO_IMPLEMENTADO | No existe servicio ni archivo generado. |
| Sellado y corrección no silenciosa | PARCIAL | Regla E6 sólo para eventos; no hook/versionado general. |
| Fallback sin PocketBase, mapa e internet | BLOQUEADO | Captura puede guardar cola, pero no crear evento/exportar JSON/ZIP de forma independiente. |

## Commits relevantes

`5c2cd19` modelo core; `165ccd1` flujo offline; `f919895` jornada activa; `20d8575` tracking; `66ca55e` parcelas; `319f6f0` asignaciones; `2376204` modelo operativo; `72ab8bb` integridad offline actual. Los commits no sustituyen las pruebas: la matriz sólo los cita como origen de implementación.

## Bloque A: remediación verificada

La remediación se implementó en `public/field-fallback/` como aplicación estática independiente de PocketBase. El E2E de producción con perfil persistente pasó dos veces consecutivas: jornada local, 3 registros (2 ocurrencias y 1 cambio territorial), 3 fotografías Blob en IndexedDB, cierre/reapertura completa offline y exportación ZIP. Se verificaron los hashes SHA-256 del manifiesto, backup y originales. El service worker `biocorredor-field-fallback-v2` precarga HTML, JS, CSS y manifest; el fallback HTML se limita a navegaciones y no sustituye recursos con HTML.

## Modo Campo MR: aceptación recortada

El escenario `e2e/offline-fallback.spec.ts` ahora valida el seed `MR-20260815`, metadata operativa, categoría de biodiversidad, certeza, `environment`, `abundance`, `phenologicalState`, GPS simulado, precisión, Blob PNG real, hash y recuperación byte-a-byte. La tercera observación se crea después de la reapertura offline y el ZIP `artifacts/block-a/biocorredor-MR-20260815-acceptance.zip` se genera por el mismo flujo. El escenario pasó tres veces consecutivas. No se implementaron tracking continuo, PocketBase, GeoJSON, parcelas, restauración ni curaduría.

## Microfase A.1: ficha física, `paper_id` y QR

La implementación elige `paper_id` directo en ocurrencias y cambios territoriales, sin convertirlo en clave primaria ni imponer unicidad. El fallback valida `MR-20260815-P001` a `MR-20260815-P120`, acepta manualmente el código offline, conserva una foto/escaneo `paper_original` como Blob y detecta coincidencias locales antes de guardar. La apertura por `?paper=` y la normalización de entrada están implementadas; el escaneo por cámara permanece pendiente. La sincronización/conflicto remoto y la auditoría completa de cambios de `paper_id` quedan documentadas como deuda porque esta microfase no incorpora un backend de sincronización nuevo.


## Bloque B: ciclo offline de jornadas y metodología mínima

Se agregaron las colecciones PocketBase `strata` y `sampling_units` mediante la migración `1790000016_sampling_methodology.js`. `survey_events` incorpora modo de inventario, estrato, unidad, diseño, método normalizado, esfuerzo, observadores, clima, limitaciones y protocolo; `occurrences` incorpora `morphospecies_code` y `evidence_type`. La migración es aditiva y conserva los campos previos.

El fallback independiente de PocketBase precarga catálogos en IndexedDB, permite iniciar una jornada estandarizada/estratificada con `MR-PAS-T01`, registrar observaciones con y sin `paper_id`, conservar morfoespecie y medios originales, cerrar offline y recuperar tras cerrar/reabrir el navegador. La prueba reproducible es `e2e/offline-survey-methodology.spec.ts`; el detalle conceptual está en `docs/SAMPLING_MODEL.md`.

El comportamiento de borrador incompleto es intencional para el modo offline: el formulario ofrece los datos metodológicos y los persiste, mientras la validación de completitud para sincronización remota queda fuera de este bloque.
