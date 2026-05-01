# Consultas Geograficas En PocketBase

FungiMap ya no usa Firestore para cargar avistamientos. La estrategia actual usa PocketBase como backend principal y consulta solo los registros visibles en el mapa.

## Flujo Actual

1. `MapView` publica los bounds visibles cuando el mapa carga, se mueve o cambia de zoom.
2. `useSightings` construye un filtro PocketBase:

```text
lat >= south && lat <= north && lng >= west && lng <= east
```

3. La consulta usa `getList(1, 500, ...)`, ordenada por `created`.
4. El hook mantiene cache del viewport y evita recargar si el cambio es menor al 20%.
5. Realtime procesa solo eventos que caen dentro del viewport actual.

## Geohash

Los nuevos avistamientos guardan `geohash` con precision 9. En esta version el filtro primario es `lat/lng` porque PocketBase no ofrece consultas geohash nativas como Firestore.

El campo `geohash` queda disponible para:

- migraciones futuras;
- endpoints custom en PocketBase;
- indices o preagregaciones por tiles;
- interoperabilidad con datasets externos.

## Limites Actuales

- El limite por consulta es 500 registros por viewport.
- Si una zona supera ese volumen, el usuario debe acercar zoom o se debe implementar un endpoint custom.
- Los viewports que cruzan el antimeridiano se filtran con `lng >= west || lng <= east`.

## Mejora Futura Recomendada

Agregar un endpoint PocketBase:

```text
GET /api/custom/sightings/viewport?north=&south=&east=&west=&limit=
```

Ese endpoint podria resolver paginacion, permisos, geohash, clustering y limites de densidad en el servidor.
