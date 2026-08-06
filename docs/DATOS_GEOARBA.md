# Datos de parcelas GeoARBA

## Descarga local

Se descargó la capa oficial de parcelas catastrales del partido de Almirante Brown:

- Partido GeoARBA: `3` (`Almirante Brown`)
- Capa: `110101` (`Parcela`)
- Endpoint: `https://geo.arba.gov.ar/datoabierto/datos/3/110101`
- Fecha de descarga: `2026-08-06`
- Archivo original: `003_parcela.tar.gz`
- SHA-256: `0B686499A1178C2B636BE6DDB3DD2EB8FFD3014220E824FC7ADA3BEC3467505A`
- Sistema de referencia: `EPSG:5347` (POSGAR 2007 / Argentina 5)

Los archivos extraídos se encuentran en `data/geoarba/almirante-brown-parcelas/` y están excluidos de Git por su tamaño. Para repetir la descarga:

```powershell
./scripts/download-geoarba-parcels.ps1
```

La aplicación sirve un recorte local en `public/data/geoarba/ministro-rivadavia-parcels.geojson` con 16.385 parcelas y un área operativa aproximada alrededor del centro de Ministro Rivadavia. Ese recorte facilita el uso móvil y no pretende reemplazar un límite administrativo o normativo. Por rendimiento, la capa se activa manualmente desde `Capas del mapa` y no bloquea la apertura de la jornada.

La descarga cubre todo el partido. El recorte operativo a Ministro Rivadavia debe hacerse usando un polígono oficial de sector/localidad o un límite de trabajo validado, no mediante una caja aproximada. La nomenclatura, partida y superficie pueden utilizarse para el expediente de parcela; la titularidad no debe inferirse de esta geometría.

## Fuente y alcance

GeoARBA publica la descarga vectorial por partido y capa desde su portal de geoservicios. El catálogo de objetos identifica `Parcela` como un polígono y documenta los atributos de nomenclatura catastral (`CCA`), partida (`PDA`), superficie (`ARA`) y plano (`PLA`).

Fuente institucional: https://arba.gov.ar/geoarba/inicio.asp
