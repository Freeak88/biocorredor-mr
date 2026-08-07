# Trazabilidad de fichas físicas

## Significado

`paper_id` es el identificador externo de una ficha física, por ejemplo `MR-20260815-P017`. No es `local_id`, `occurrence_id` ni `server_id`. Se valida localmente contra el rango `P001` a `P120`.

La implementación actual usa la opción B de la microfase A.1: `paper_id` directo en ocurrencias y cambios territoriales. No se introduce todavía `paper_record`; una ficha puede tener más de un registro, por lo que `paper_id` no es único en el modelo remoto. La detección local del fallback evita duplicar silenciosamente el mismo vínculo durante la captura.

## Flujo

```text
ficha impresa + etiqueta QR
        -> paper_id
        -> registro local IndexedDB
        -> registro sincronizado con el mismo paper_id
        -> medios biológicos y paper_original
        -> exportación backup/manifest/ZIP
```

El fallback acepta manualmente `MR-20260815-P017`, normaliza minúsculas y espacios, y también puede extraer el valor de una URL futura como `/field-fallback/?paper=MR-20260815-P017`. El escaneo de cámara no está implementado todavía.

## Medios

Una foto o escaneo de la ficha se guarda como Blob original con `media_id`, `paper_id`, `media_role=paper_original`, MIME, tamaño, SHA-256, fechas y `syncStatus`. En el ZIP se ubica en `paper/<paper_id>/`.

## Duplicados y conflictos

Antes de guardar, el fallback busca coincidencias locales y muestra el `paper_id` y el ID local existente. El modelo remoto conserva ambos registros si una ficha tiene varias observaciones. La detección de conflictos remotos entre distintos `local_id` requiere todavía la sincronización PocketBase y su resolución manual; no se implementa silenciosamente en esta microfase.

## Transcripción y verificación

El esquema PocketBase agrega campos opcionales `paper_transcribed_by`, `paper_transcribed_at`, `paper_verified_by` y `paper_verified_at`. `paper_verified` significa que la digitalización coincide con el papel; no significa que la identificación taxonómica esté confirmada.

## Exportación

`paper_id` viaja en `backup.json`, en los metadatos del medio y en `manifest.json` mediante sus hashes. La imagen de ficha original se conserva byte-a-byte dentro del ZIP.
