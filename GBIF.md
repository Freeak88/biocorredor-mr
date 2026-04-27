# GBIF Integration Plan for FungiMap

## API Endpoint
Base: https://api.gbif.org/v1/occurrence/search
Params: country=AR&kingdomKey=4&hasCoordinate=true&limit=300

## Fields mapping (GBIF → PocketBase sightings)
- species → mushroom_name
- decimalLatitude → lat
- decimalLongitude → lng
- eventDate → created (original observation date)
- recordedBy → description (as "Observado por: X")
- media[0].identifier → images (download and re-upload, or store URL)
- gbifID → network_id (with prefix "gbif_")
- basisOfRecord → habitat
- stateProvince → features

## Status
All GBIF imports get status: "gbif_import"
Special user: system user "gbif_bot" created via migration

## Visual distinction on map
GBIF markers: smaller, grey, different icon (herbarium/specimen icon)
User markers: current atlas style (color, mushroom icon)

## Species profile cards
Aggregated from GBIF data:
- observation count by month → seasonality chart
- lat/lng range → distribution
- first/last observation date
- photos from observations
