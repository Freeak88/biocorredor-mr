# Parcelas priorizadas del Biocorredor MR

La capa operativa `public/data/geoarba/ministro-rivadavia-parcels-curated-noreste.geojson` contiene únicamente las parcelas referenciadas por la propuesta comunitaria del documento `Biocorredor M. Rivadavia (1).pdf`.

La selección se cruza con geometría descargada de GeoARBA, pero la referencia del documento no constituye por sí sola una verificación catastral oficial.

| Referencia normalizada | Área operativa | Página | Valor de fuente |
| --- | --- | ---: | --- |
| 694H, 701 | Reserva Juan B. Justo | 6 | 694h, 701 |
| 739, 738C | Lateral de la Granja Municipal | 7 | 739, 738C |
| 694D | Bosque hasta el arroyo | 8 | 694d |
| 746, 747, 748, 749, 750 | La Tosquera | 9 | 746, 747, 748, 749, 750 |
| 690A, 690B, 690C, 691A | Ex Campo Sojero / Bosque / Arroyo | 10 | 690a, 690b, 690c, 691a |
| 671Z, 672, 673 | Corredor Laprida / humedal | 11 | 671z, 672, 673 |

Los sufijos alfabéticos se normalizan a mayúsculas para identificación (`690a` → `690A`) y se conserva `source_value` para trazabilidad.

El resto del parcelario oficial permanece en los GeoJSON originales, pero no se muestra en la capa operativa del MVP.
