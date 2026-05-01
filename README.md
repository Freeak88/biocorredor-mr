# FungiMap

PWA para registrar, mapear y enriquecer avistamientos de hongos. El frontend usa React, TypeScript, Vite, Tailwind y Leaflet; el backend principal es PocketBase con migraciones y hooks locales.

## Requisitos

- Node.js 20+
- npm
- Docker y Docker Compose para correr la pila completa
- Una clave `GEMINI_API_KEY` si se va a usar identificacion por IA

## Configuracion local

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env.local` desde `.env.example` y completar las claves necesarias:

```bash
VITE_GEMINI_API_KEY=...
GEMINI_API_KEY=...
```

3. Correr la app web:

```bash
npm run dev
```

La SPA queda disponible en `http://localhost:3000`.

## Docker / PocketBase

La pila de produccion local usa:

- `web`: build Vite servido por Nginx.
- `pb`: PocketBase en `:8090`, con `pb_migrations` y `pb_hooks`.
- Traefik externo esperado en la red `proxy-net`.

```bash
docker compose up --build
```

Las rutas `/api/*` y `/_/*` deben llegar a PocketBase; el resto sirve la SPA.

## Comandos

```bash
npm run lint
npm run test:run
npm run build
npm run e2e
```

## Notas de arquitectura

- PocketBase es la fuente de datos activa. Firebase quedo como legado y no debe usarse en codigo nuevo.
- Los avistamientos se consultan por viewport con filtros `lat/lng`, con cache de movimientos pequenos.
- Las relaciones obligatorias (`user`, `reporter`) se envian desde el frontend para coincidir con las reglas de PocketBase.
- Las imagenes se validan y comprimen antes de subir.
