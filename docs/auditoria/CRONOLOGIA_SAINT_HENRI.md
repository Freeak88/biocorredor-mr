# Cronología de verificación — Saint Henri / entorno Aeroclub Longchamps

Estado: **cronología preliminar con hitos documentales; comparación visual satelital todavía pendiente de cierre**.

## Regla metodológica

Se distinguen cuatro clases de fecha:

1. **fecha normativa**: ordenanza, resolución o acto oficial;
2. **fecha comercial**: primera evidencia pública de oferta/promoción localizada;
3. **fecha física observada**: apertura de calles, movimientos de suelo, construcciones u otra transformación visible en imagen;
4. **fecha administrativa**: factibilidad, aprobación, subdivisión, DIA, hidráulica u otro acto del expediente.

Una fecha comercial no reemplaza una fecha administrativa y una transformación física visible no prueba por sí sola aprobación ni venta.

## Hitos confirmados hasta ahora

| Fecha | Tipo | Hito | Estado |
| --- | --- | --- | --- |
| 2019 | normativa | Ordenanza 11.440/19 modifica la zonificación de Ministro Rivadavia e incorpora, entre otras situaciones, R6 y Zona Residencial Extraurbana (ZRE). | confirmado por texto oficial |
| 2020 | normativa | Ordenanza 11.819/20 establece categorías territoriales rurales y un mecanismo cuantitativo de localización de clubes de campo con cupo ordinario y eventual tramo adicional. | confirmado por texto oficial |
| 2024 | normativa | Ordenanza 13.378/24 es convalidada provincialmente por Resolución 511/2024 como actualización del ordenamiento territorial de Almirante Brown. | confirmado por fuente provincial |
| 2026 | comercial | Publicaciones consultadas describen Saint Henri Aero & Country Club en Estanislao San Zeballos 1320, con aproximadamente 55 ha, 349 lotes y 16 manzanas. | confirmado como dato publicitado, no como dato catastral/aprobatorio |

## Comparación histórica de imágenes — protocolo

Para cada corte temporal se debe conservar:

- proveedor/capa;
- fecha o rango de captura informado por el proveedor;
- centro y bbox;
- captura o identificador de tesela;
- observaciones visibles;
- nivel de confianza;
- comparación contra el acto administrativo más próximo en el tiempo.

### Variables visuales a registrar

- traza de pista/aeródromo preexistente;
- caminos internos;
- apertura de calles nuevas;
- cercos/perímetros;
- desmonte o movimiento de suelo;
- canales/obras hidráulicas;
- lotificación físicamente legible;
- hangares;
- viviendas/edificaciones;
- infraestructura lineal y postes;
- cambios de cobertura vegetal.

## Estado de la búsqueda satelital

Se localizaron como fuentes públicas/consultables para el análisis histórico:

- Esri World Imagery Wayback;
- Sentinel-2 / catálogos STAC públicos para series desde 2015-2016;
- ortofotos o capas provinciales/municipales cuando estén disponibles.

Al cierre de esta iteración **no se asignan fechas exactas de apertura de calles ni primeras construcciones**, porque todavía falta completar la inspección visual imagen por imagen con fecha de captura verificable. La aplicación debe mantener esas celdas como `pending_review` hasta contar con la evidencia visual archivada.

## Ventana temporal prioritaria

La investigación visual debe comenzar por cortes anuales o semestrales 2018–2026, y densificarse alrededor del primer cambio detectado. La secuencia óptima es:

`2018 -> 2020 -> 2022 -> 2023 -> 2024 -> 2025 -> 2026`

Si entre dos cortes aparece una transformación, revisar todas las imágenes disponibles dentro de ese intervalo hasta acotar el primer momento visible.

## Qué falta para volver concluyente la cronología

1. Identificar el polígono catastral exacto del desarrollo.
2. Archivar capturas históricas del mismo bbox con metadatos de fecha.
3. Identificar la primera aparición visible de calles/obras.
4. Obtener el expediente y ordenar sus actos por fecha.
5. Cruzar ambas cronologías y detectar si la transformación física precede, coincide o sucede a cada autorización pertinente.
