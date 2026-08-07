# Modelo de media offline

## Garantía

La fuente persistente de una evidencia es el `Blob` original almacenado en IndexedDB. Una vista previa es siempre derivada: se crea un `objectURL` al reconstruir la interfaz y nunca se almacena como referencia permanente ni reemplaza el original.

El fallback independiente usa el almacén `biocorredor-field-fallback-v2/media`. El flujo principal usa `biocorredor-media-evidence/media` a través de `src/lib/mediaEvidence.ts`. Ambos conservan bytes, MIME, tamaño, captura, ingesta y SHA-256 calculado sobre `Blob.arrayBuffer()`.

## Registro local

Cada media conserva:

`media_id`, `parent_type`, `parent_local_id`, `media_role`, `mime_type`, `file_size`, `captured_at`, `ingested_at`, `sha256`, `sync_status`, `local_id`, `server_id`, `retry_count`, `last_sync_error` y `blob`.

Los roles P0 son `biological_evidence`, `territorial_evidence`, `paper_original`, `habitat_context`, `diagnostic_detail` y `other`. `paper_id` sigue siendo un campo directo de la observación/cambio; no existe una entidad `paper_record`.

## Ciclo de vida

1. Se incorpora el archivo original y se copia como Blob.
2. Se calcula SHA-256 sobre los bytes exactos. Si falla, el Blob y el registro quedan con `pending_hash`/error para reintento.
3. Se persiste la observación y su relación local.
4. La interfaz reconstruye previews con `URL.createObjectURL(blob)` al abrir o refrescar.
5. La sincronización futura lee el Blob por `media_id`, envía el original y actualiza `server_id`/`sync_status`; un fallo incrementa `retry_count` y conserva `last_sync_error`.

No se implementan todavía upload remoto completo, conflictos, borrado remoto, firma ni exportación científica. Audio, video y documentos quedan fuera de P0; sólo se conserva el catálogo backend existente.

## Capacidad y persistencia del navegador

Cuando el navegador lo ofrece, la aplicación solicita `navigator.storage.persist()` y muestra uso/cuota mediante `navigator.storage.estimate()`. Una cuota cercana al límite genera una advertencia no bloqueante. La decisión depende del navegador, permisos y dispositivo.

## Verificación

`e2e/offline-media-persistence.spec.ts` crea cinco evidencias de los cuatro flujos relevantes, cierra página y contexto, reabre offline, reconstruye cinco previews `blob:`, vuelve a leer cinco Blob desde IndexedDB y recalcula cinco hashes iguales al original.
