# Evaluación de caminos de usuario

## Observador

1. Ingresa con sus credenciales.
2. Ve la jornada asignada, sector, equipo y estado de sincronización.
3. Abre `Jornada` y verifica el checklist sin quedar bloqueado por tareas operativas.
4. Inicia la jornada.
5. El botón `Relevar` aparece únicamente con asignación válida, evento activo y jornada local activa.
6. Registra biodiversidad, ambiente o impacto; GPS, fotografía, identificación y QR pueden quedar pendientes.
7. El teléfono conserva el registro y la ruta si pierde conexión.
8. Cierra la jornada y deja incidentes, distancia y sectores no recorridos.

**Evaluación:** recorrido corto y seguro. No debe usar el mapa para iniciar una observación ni completar campos de revisión taxonómica.

## Coordinación

1. Ingresa y abre `Control`.
2. Revisa jornadas, registros, último punto GPS y estado de sincronización.
3. Asigna jornada, participante, equipo, sector y dispositivo.
4. Consulta exportaciones CSV/JSON y verifica registros pendientes.

**Evaluación:** concentra decisiones previas y cierre. La asignación es la fuente de verdad; el observador no puede inventar jornada, sector o equipo.

## Curaduría

1. Ingresa con perfil de curaduría.
2. Revisa observaciones pendientes y sugerencias de identificación.
3. Propone o confirma identificaciones versionadas, sin modificar el original de campo.
4. Mantiene separadas la identificación validada, la observación del participante y la interpretación territorial.

**Evaluación:** actualmente comparte la superficie `Control` con coordinación por compatibilidad del MVP. La próxima mejora debe ofrecer una vista propia de curaduría y ocultar la asignación operativa cuando no corresponda.

## Administración

1. Ingresa y ve `Control` y `Admin`.
2. Audita usuarios, actividad, reportes y directivas.
3. No registra observaciones de campo por defecto.
4. Revisa exportaciones, manifiestos y eventos de cierre.

**Evaluación:** el acceso administrativo está separado del flujo de campo y el chat se conserva como canal operativo.

## Reglas de fricción mínima

- No mostrar `Añadir Hallazgo`; el único acceso de campo es `Relevar` dentro de una jornada activa.
- Mantener el registro local aunque falte GPS, foto o identificación.
- Mostrar solo campos comunes al inicio; revelar campos condicionales por grupo biológico.
- Mantener la visibilidad inicial en `private`; publicar requiere revisión posterior.
- Un QR repetido abre conflicto y nunca duplica silenciosamente.
