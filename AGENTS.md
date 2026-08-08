# Biocorredor MR — AGENTS.md

Plataforma comunitaria para biodiversidad, ambientes y cambios territoriales.

## Estado

MVP con PocketBase como backend activo, Vite, Vitest, Playwright, PWA y mapa
territorial geoposicionado. Firebase permanece como legado y no debe usarse en
código nuevo.

## Stack

- Frontend: Vite + TypeScript.
- Backend: PocketBase con migraciones, hooks y sincronización idempotente.
- Tests: Playwright (e2e) + Vitest.
- Containerización: Docker + nginx.

## Datos

- Fuente inicial: **GBIF** (163K registros Argentina, 50M global, API gratis).
- Especies comestibles AR ya mapeadas en GBIF: Coprinus comatus (932), Pleurotus djamor (64), P. ostreatus (28), Ganoderma lucidum (20), Laetiporus sulphureus (17), etc.
- GBIF provee: coordenadas, fotos (iNaturalist), fecha, taxonomía, observador, licencia CC.

## Valor agregado vs GBIF

Comunidad, edibilidad para público general, verificación en tiempo real, datos locales.

## Refs

- `BLUEPRINT.md` — diseño completo.
- `MIGRATION.md` — plan de migración.
- `GBIF.md` — integración con GBIF.
- `screenshots/` — capturas (fungimap_screen, screenshot_check).
- `firebase.json`, `firestore.rules`, `storage.rules`.

## Pendiente

Estado del desarrollo: ver último commit del repo (`.git/`).
