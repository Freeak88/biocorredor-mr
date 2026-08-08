# Modelo de sincronización remota

## Identidad

Cada perfil genera una sola vez `device_id` y lo conserva en `localStorage`. Cada entidad P0 recibe un `local_id` estable y un `sync_key` determinista con el formato `device_id:entity_type:local_id`. `server_id` sólo se completa después de crear o resolver el registro PocketBase.

Las entidades sincronizables son `survey_events`, `occurrences`, `territorial_changes` y `media_evidence`. `paper_id` y `morphospecies_code` son datos de campo; no participan en la identidad ni en la idempotencia.

## Cola IndexedDB

`src/lib/remoteSync.ts` mantiene dos almacenes en `biocorredor-remote-sync`:

- `sync_queue`: dataset pendiente, `entity_type`, `local_id`, operación, intentos, timestamps y último error.
- `sync_entities`: copia local durable de cada entidad para conservarla después de una sincronización exitosa.

La cola sobrevive al cierre de pestaña, reinicio del navegador, pérdida de red y reinicio de la aplicación. Los Blob originales continúan en `biocorredor-media-evidence` y nunca se eliminan automáticamente.

## Estados

`local_only -> queued -> syncing -> synced`.

Los errores temporales pasan a `retry` y conservan el trabajo. Los errores de autenticación o no recuperables quedan en `failed`, sin borrado automático. Si existe modificación local pendiente y `remote_updated_at` cambió, el registro pasa a `conflict` y conserva `conflict_local_snapshot`, `conflict_remote_snapshot` y `conflict_detected_at`.

## Dependencias

El sincronizador resuelve en orden `survey_event -> occurrence -> territorial_change -> media_evidence`. Las relaciones hijas se construyen con el `server_id` remoto del padre. Los catálogos `strata` y `sampling_units` se resuelven por sus códigos canónicos y no se duplican por dispositivo.

## Idempotencia

La migración `1790000019_remote_sync_idempotency.js` agrega identidad, estado, reintentos, errores, timestamps y snapshots de conflicto. Cada colección P0 tiene un índice único parcial sobre `sync_key != ''`, compatible con registros históricos seed que aún no tienen identidad.

El cliente primero busca por `sync_key`, intenta crear si no existe y, ante una colisión 400/409, vuelve a resolver el registro existente. Una doble ejecución no crea una segunda identidad. El backend también protege la unicidad para intentos concurrentes.

## Media

La media se crea en PocketBase con el Blob original, relaciones al padre, rol, MIME, tamaño, timestamps y SHA-256. El estado sólo llega a `synced` después de comprobar registro remoto, archivo descargable, tamaño y SHA-256 byte a byte. La media local queda conservada.

## Conflictos y recuperación

El hook de PocketBase actualiza `remote_updated_at` cuando se edita una entidad sincronizada. Si el cliente detecta cambio remoto posterior a `last_synced_remote_updated_at` y también tiene una edición local pendiente, no sobrescribe ninguna versión. La interfaz muestra el resumen de sincronización y conserva el trabajo para revisión.

La acción manual **Sincronizar ahora** ejecuta la misma cola que la recuperación automática al volver la conexión. No se implementa sincronización en segundo plano con el navegador completamente cerrado.

## Alcance y limitaciones

Este bloque no implementa firma digital, Darwin Core completo, QR por cámara, AgroLens, Merlin, iNaturalist, audio/video ni Bloque E. La resolución visual avanzada de conflictos queda pendiente; detección y preservación de ambas versiones son P0.
