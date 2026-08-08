# Demo de campo D.1

## Entrada

Abrir `http://127.0.0.1:3000/` e ingresar con un usuario observador que tenga una asignación vigente. La pantalla operativa es **Jornada**; coordinación prepara previamente evento, sector, equipo, protocolo y participantes.

## Recorrido reproducible

1. Abrir **Jornada** y comprobar sector, equipo, protocolo, estado de conexión y pendientes.
2. Pulsar **Iniciar jornada**. El inicio queda guardado en el dispositivo y aparece como jornada en curso; no depende de una confirmación remota.
3. Pulsar **Nueva observación**, completar los datos mínimos, capturar GPS si está disponible y adjuntar la fotografía original. Guardar.
4. Confirmar el mensaje **Guardado en este dispositivo** o **Pendiente de sincronización**. Abrir **Más → Mis registros** para comprobar que el registro sobrevive al cierre y reapertura de la pantalla.
5. En DevTools o con el dispositivo en modo avión, comprobar el estado **Sin conexión**, mantener la jornada y crear otro registro. El chat queda deshabilitado, pero el registro no se pierde.
6. Volver a conectar. Desde la jornada o el relevamiento pulsar **Sincronizar ahora**. El indicador pasa por **Pendiente de sincronización** y luego **Sincronizado**.
7. En PocketBase, revisar `survey_events`, `occurrences` o `territorial_changes` y `media_evidence`. La misma `sync_key` debe conservarse sin duplicados.
8. Para finalizar, volver a **Jornada**, elegir **Cerrar jornada**, completar únicamente lo conocido y confirmar. El cierre también se guarda localmente y entra en la cola canónica.

## Qué debe ver el observador

La interfaz sólo expone estados de trabajo: guardado en el dispositivo, pendiente, sincronizado, sin conexión o requiere atención. Los identificadores técnicos, IndexedDB, PocketBase y hashes quedan fuera del flujo operativo.

## E2E con backend real

`e2e/demo-field-flow.spec.ts` no intercepta red ni usa mocks. Para ejecutarlo se deben definir `DEMO_FIELD_EMAIL`, `DEMO_FIELD_PASSWORD` y `PLAYWRIGHT_BASE_URL` apuntando a un PocketBase con una asignación de prueba activa. Sin esas variables el caso se omite para no convertir la suite local en una dependencia de credenciales.

