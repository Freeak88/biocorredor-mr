# Informe de aceptación técnica del MVP

Fecha: 2026-08-06  
Rama: `mvp-relevamiento-15-agosto`  
Commit: `72ab8bb`  
Fase: auditoría sin modificar código.

## Resultado ejecutivo

**NO APTO PARA EL 15**.

La aplicación compila y la suite unitaria pasa, pero eso no demuestra el circuito operativo solicitado. Faltan exportación del paquete probatorio, prueba offline real con cuatro registros y fotografías, persistencia offline del evento/cierre, generación de preview/EXIF y corrección versionada de registros sellados.

## Cumplimiento P0

La planilla declara 71 campos/requisitos P0. La clasificación aplicada es la de `docs/IMPLEMENTATION_TRACEABILITY.md`. El cálculo reproducible es:

| Estado P0 | Conteo auditado | Peso | Puntos |
|---|---:|---:|---:|
| IMPLEMENTADO_Y_PROBADO | 6 | 1,0 | 6,0 |
| IMPLEMENTADO_SIN_PROBAR | 31 | 0,6 | 18,6 |
| PARCIAL | 27 | 0,3 | 8,1 |
| SOLO_DOCUMENTADO | 0 | 0,1 | 0,0 |
| NO_IMPLEMENTADO/BLOQUEADO | 7 | 0,0 | 0,0 |
| **Total** | **71** |  | **32,7 / 71 = 46,1%** |

Este porcentaje es de preparación documental/funcional P0, no una aprobación de ensayo. La matriz completa y el criterio de cada conteo están en `IMPLEMENTATION_TRACEABILITY.md`.

## Pruebas ejecutadas

| Comando | Código | Resultado |
|---|---:|---|
| `npm run lint` | 0 | TypeScript sin errores. |
| `npm run test:run -- --pool=forks --poolOptions.forks.singleFork=true` | 0 | 7 archivos, 65 tests, 65 aprobados, 0 fallidos. |
| `npm run build` | 0 | Build Vite de producción correcto; advertencia: chunk `vendor` vacío. |
| `docker compose -f docker-compose.local.yml config --quiet` | 0 | Configuración válida; no implica migración ejecutada. |
| `npm run e2e` | Bloqueado | No completó en este entorno; no se contabiliza como prueba. |
| Migración desde base vacía | No ejecutado | Requiere levantar PocketBase efímero; no se infiere desde archivos. |
| Backup/restauración/exportación | No ejecutado | No existe servicio que genere el paquete solicitado. |

## Pruebas obligatorias no demostradas

No se ejecutó la secuencia de cuatro registros offline porque hacerlo sin un flujo de prueba reproducible y PocketBase efímero produciría una afirmación no verificable. Por lo tanto no hay logs reales, IDs de servidor, conteo post-sync, ZIP ni hash de manifiesto para reportar. El detalle está en `MVP_GAPS.json`.

## Bloqueantes

1. No existe exportación completa `events.csv`, `occurrences.csv`, `identifications.csv`, `territorial_changes.csv`, GeoJSON, backup, hashes, manifiesto y media.
2. Inicio/cierre de evento no se encolan como operaciones offline cuando PocketBase no responde.
3. La durabilidad de las fotografías tras cerrar/reabrir el navegador no está probada; el fallback localStorage tampoco es adecuado para archivos grandes.
4. La idempotencia no está respaldada por índices únicos para `change_id` y `media_id`, y no existe prueba de doble sincronización.
5. Sellado/corrección versionada sólo está parcialmente modelado; las colecciones de observaciones, cambios y media siguen permitiendo update autenticado.
6. La separación de coordenadas reservadas/públicas no tiene generalización ni reglas diferenciadas probadas.

## Alcance cubierto

Se revisaron repositorio, rama, commits, migraciones, hooks, colecciones, interfaces/captura, IndexedDB, sync, archivos, hashes, exportadores, tests, documentación, Docker y fallback. El mapa GeoARBA y el tracking de ruta existen, pero no se consideran prueba de disponibilidad offline porque no se ejecutó un escenario sin red.

## Próxima acción

La auditoría queda detenida aquí, como solicitaste. No se modificó código. Para pasar a implementación hace falta aprobación explícita del orden de corrección, empezando por exportación/manifest, cola durable de eventos y media, y una prueba offline automatizada con PocketBase efímero.
