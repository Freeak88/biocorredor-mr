# QA visual temporal — corredores dentro de parcelas madre (Cluster 2)

Estado: **PASS CON INTERPRETACIÓN CAUTELOSA**

Scope: Productivo únicamente, limitado a cobertura real de Cluster 2.

Este documento resume la revisión visual dirigida de las 5 parcelas GeoARBA actuales de mayor prioridad según `road-within-mother-parcel`. En todos los paneles, el contorno cian es GeoARBA actual y la línea magenta es el footprint vial V5 2026 proyectado hacia atrás sólo como guía. La superposición magenta no prueba que la traza existiera en años anteriores.

## Resultado principal

Los 5 casos muestran transformación física observable relevante dentro de una geometría parcelaria GeoARBA actual de gran tamaño. La secuencia temporal indica que la consolidación vial/ocupacional no ocurre de la misma manera en todos los casos: algunos presentan trazas rurales o accesos previos a la urbanización, y otros muestran un salto fuerte entre 2020 y 2022.

Por eso, `internal_road_within_mother_parcel_candidate` queda aprobado como **feature de priorización**, pero no como prueba de fecha de loteo ni como indicador administrativo/legal autónomo.

## Lectura por parcela

| Rank | Partida | Nomenclatura | Área actual | Lectura visual temporal | Confianza |
|---|---|---|---:|---|---|
| 1 | 003139476 | 00304000000000000000000000000000000082400B | 90,332.93 m² | 2016/2020: predomina uso abierto/productivo sin grilla consolidada. 2022: comienzan señales de ocupación. 2023: la trama interna ya es observable. 2026: mayor consolidación. Ventana principal probable: 2020–2023. | alta |
| 2 | 003017516 | 003040000000000000000000000000000000816000 | 101,042.40 m² | Existen trazas lineales débiles que pueden corresponder a accesos/caminos rurales previos. La ocupación y organización en lotes se vuelven mucho más claras entre 2020 y 2022 y continúan consolidándose hasta 2026. | media-alta |
| 3 | 003017527 | 003040000000000000000000000000000000819000 | 100,595.49 m² | 2016: patrón predominantemente productivo/vegetado. 2020: transición incipiente. 2022: ocupación y red interna ya ampliamente observables. 2023–2026: consolidación. Ventana principal probable: 2020–2022. | alta |
| 4 | 003017519 | 003040000000000000000000000000000000818000 | 101,078.31 m² | Es el salto temporal más claro del conjunto: 2016/2020 con baja ocupación y sin red interna consolidada; 2022 muestra una transformación extensa con calles y numerosas construcciones; 2023/2026 consolidan. Ventana crítica: 2020–2022. | muy alta |
| 5 | 003076135 | 003040E00000000000000000600000000000001000 | 30,999.44 m² | Algunas trazas internas pueden preexistir como accesos. Para 2020 ya hay ocupación incipiente; 2022 muestra consolidación fuerte y 2023/2026 densificación adicional. Ventana principal de urbanización observable: 2016–2022, con salto fuerte 2020–2022. | media-alta |

## Hallazgo metodológico importante

Los paneles confirman que **calle física y urbanización no tienen necesariamente la misma fecha de aparición**. Un camino rural o acceso interno puede existir antes de una subdivisión/ocupación residencial. Por lo tanto, fechar transformación sólo con `Road` produciría falsos adelantamientos.

La siguiente métrica temporal debe integrar, como mínimo:

- fracción `Road` por fecha;
- fracción `Building` por fecha;
- `Pavement` y `Cropland` como contexto;
- soporte del footprint vial 2026 en cada fecha;
- persistencia temporal;
- earthwork cuando esté disponible.

El evento territorial relevante debe expresarse como **transición hacia urbanización observable**, no simplemente como primera detección de una línea vial.

## Decisión

1. `road-within-mother-parcel` queda **APROBADO como ranking de revisión territorial** para Cluster 2.
2. Los 5 candidatos pasan a análisis temporal cuantitativo multi-clase.
3. No interpretar el contorno GeoARBA actual como prueba de inexistencia de antecedentes administrativos intermedios.
4. No usar `high_priority_segments` como conteo de calles no declaradas.
5. Siguiente gate: cuantificar por parcela y fecha `Road / Building / Pavement / Cropland` con OpenEarthMap y contrastar con la lectura visual de estos paneles.
