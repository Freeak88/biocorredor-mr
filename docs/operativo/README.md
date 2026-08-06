# Paquete operativo MVP

Este directorio contiene la versión 1.0 del modelo de campos, la ficha única de respaldo, el protocolo científico-probatorio y las etiquetas QR preparadas para la jornada del 15 de agosto de 2026.

## Aplicación en la plataforma

- Cada jornada conserva protocolo, versión, método y esfuerzo.
- Cada relevamiento puede vincularse con un `paper_id` de la ficha impresa.
- El formulario registra grupo biológico, calificador de identificación y método de conteo sin exigir conocer la especie.
- GPS, fotografía e identificación quedan pendientes cuando no están disponibles, sin perder el registro local.
- La evidencia original conserva hash, ID de medio y fecha de ingesta.
- La visibilidad inicial de las observaciones es `private`; coordinación decide una publicación posterior.

La migración `1790000013_operational_field_model.js` agrega los campos operativos al esquema existente.
