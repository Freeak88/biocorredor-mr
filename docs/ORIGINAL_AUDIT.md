# Auditoria inicial de Funga Map

Fecha de auditoria: 2026-08-06

Repositorio original: https://github.com/Freeak88/Fungimom

Copia local independiente: `D:\proyectos\Biocorredor\biocorredor-mr`

Snapshot seguro: tag Git local `funga-map-original-snapshot`

Rama de trabajo: `mvp-relevamiento-15-agosto`

## Estado general

El proyecto original es una PWA llamada FungiMap para registro colaborativo de hongos. La aplicacion ya contiene piezas reutilizables para el MVP del Biocorredor MR: autenticacion con PocketBase, mapa Leaflet, captura de imagenes, geolocalizacion, migraciones PocketBase, hooks del backend, tests y build de frontend.

No es Next.js. El stack real es React 19, TypeScript, Vite, Tailwind, Leaflet y PocketBase.

## Stack identificado

- Frontend: React + TypeScript + Vite.
- Estilos: Tailwind CSS v4, CSS propio en `src/index.css`.
- Backend principal: PocketBase, con migraciones en `pocketbase/pb_migrations` y hooks en `pocketbase/pb_hooks`.
- Mapa: Leaflet via `react-leaflet` y `react-leaflet-cluster`.
- PWA: `public/manifest.json`, `public/service-worker.js` y `public/offline.html`.
- Offline actual: modulo `src/lib/offline.ts` con cola en `localStorage`.
- Imagenes: compresion previa en cliente y subida a campo file de PocketBase.
- IA: integracion Gemini en cliente y hook PocketBase. Para el MVP queda como funcion no prioritaria.
- Docker: `Dockerfile`, `pocketbase/Dockerfile`, `docker-compose.yml` para entorno con Traefik/red externa.

## Modelo de datos actual

Colecciones principales creadas por migraciones:

- `sightings`: avistamientos de hongos con usuario, nombre, descripcion, latitud, longitud, imagenes, estado, geohash y campos de IA/taxonomia.
- `comments`: comentarios sobre avistamientos.
- `chat_messages`: chat geolocalizado.
- `reports`: reportes de contenido.
- `logs`: acciones simples.
- `rate_limits`: control basico para acciones como reconocimiento con IA.
- Extensiones posteriores agregan campos de usuarios, estadisticas, GBIF, feedback de IA y publicacion.

El modelo actual no separa todavia eventos de relevamiento, ocurrencias biologicas, evidencia multimedia, identificaciones posteriores, cambios territoriales, manifiestos de exportacion ni auditoria formal.

## Autenticacion y roles

La app usa la coleccion `users` de PocketBase.

Roles actuales observados en tipos y UI:

- `user`
- `expert`
- `admin`

El login por correo y password existe. Tambien hay Google OAuth y registro publico desde la pantalla de login, que debera deshabilitarse para el MVP porque se pidio precarga de usuarios y no registro abierto.

## Flujo de captura actual

El usuario autenticado ve un mapa y puede agregar un "hallazgo". El formulario actual requiere nombre, descripcion y ubicacion. Permite camara/galeria, intenta capturar GPS antes de la foto, comprime imagenes, guarda un borrador temporal en `localStorage`, sube a `sightings` y luego agrega contexto climatico si puede.

Limitaciones para el MVP:

- Bloquea si no hay ubicacion.
- No conserva original sin comprimir como evidencia primaria.
- No calcula SHA-256 ni registra EXIF.
- No soporta cola robusta con imagenes en IndexedDB.
- No hay estados de sincronizacion por registro.
- No hay flujo de jornada, equipo, sector ni cierre de recorrido.

## Offline y PWA

La PWA existe, pero el service worker actual es passthrough y borra caches anteriores. La cola offline usa `localStorage`, no IndexedDB. Esto no cumple el requisito P0 de operar con fotos y datos sin conectividad, pero sirve como punto de referencia para reemplazarlo por una capa offline-first.

## Docker y PocketBase

El `docker-compose.yml` original esta orientado a despliegue con infraestructura externa:

- Red externa `proxy-net`.
- Volumen externo `fungimon_pb-data`.
- Servicios `web`, `prerender` y `pb`.

En esta maquina esas dependencias no existen, por lo que se agrego `docker-compose.local.yml` para levantar PocketBase localmente con puerto `8090` y volumen local `biocorredor_mr_pb_data`.

La prueba de build de PocketBase no pudo completarse por respuesta `429 Too Many Requests` de Docker Hub al descargar `alpine:3.21`. Es un bloqueo externo de Docker Hub, no un fallo de codigo.

## Verificaciones realizadas

- `npm install`: correcto. Reporta 16 vulnerabilidades de dependencias.
- `npm run lint`: correcto.
- `npm run test:run`: correcto, 63 tests pasan.
- `npm run build`: correcto.
- `npm run dev`: intento de arranque realizado, pero el wrapper local bloqueo el control de proceso en segundo plano; Vite queda cubierto por build y lint.
- `docker compose config`: correcto, pero confirma dependencia de red/volumen externos.
- `docker compose up pb --no-start`: bloqueado por Docker Hub `429 Too Many Requests`.

## Riesgos iniciales

- El MVP requiere un cambio fuerte de flujo: de mapa social de hongos a captura de relevamiento comunitario con eventos, evidencia y exportacion.
- El offline actual no es suficiente para campo.
- Las fotos se comprimen antes de subir; esto contradice la conservacion de originales.
- El registro publico y OAuth no encajan con usuarios precargados.
- El compose actual no sirve como comando local simple sin override.
- Hay dependencias con vulnerabilidades que deben evaluarse sin romper la fecha.

## Decisiones de arquitectura para continuar

- Conservar React + Vite + PocketBase para reducir riesgo.
- Mantener PocketBase como backend del MVP.
- Agregar migraciones versionadas nuevas sin eliminar colecciones existentes.
- Implementar IndexedDB como fuente local operativa para campo.
- Separar ocurrencias biologicas de cambios territoriales.
- Mantener IA, chat y funciones sociales fuera del camino critico P0.
- Preparar fallback Nivel D como formulario local independiente/PWA con exportacion.
