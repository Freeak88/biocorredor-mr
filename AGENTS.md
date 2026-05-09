# Fungimap — AGENTS.md

App/mapa colaborativo de hongos silvestres. Futuro `map.funga.com.ar`.

> **Nota:** Antes se llamaba `Fungimom`. La carpeta del repo conservó ese nombre internamente.

## Estado

App con código (Firebase + PocketBase + Vite + Vitest + Playwright). Mapa colaborativo geoposicionado.

## Stack

- Frontend: Vite + TypeScript.
- Backend: Firebase (functions, firestore.rules, storage.rules, hosting) + PocketBase como alternativa local.
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
