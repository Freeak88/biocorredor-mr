# Usuarios, roles y asignaciones

## Roles operativos

- `administrador`: administra usuarios, seguridad, fuentes, respaldos y configuracion global.
- `coordinador`: crea jornadas, sectores, equipos, asignaciones y controla el cierre.
- `observador`: ve sus jornadas asignadas, inicia el recorrido, registra observaciones y transmite su trayecto.
- `curador`: revisa identificaciones, evidencia y observaciones pendientes. En el MVP comparte el panel de control con coordinación.

## Asignacion

Una persona no elige libremente una jornada desde el telefono. Coordinacion crea una asignacion con:

- jornada;
- participante;
- equipo;
- sector;
- dispositivo, cuando corresponda;
- responsable de la asignacion;
- estado.

El telefono recibe esa asignacion y la conserva localmente para operar sin conexion. El observador confirma el inicio real; el sistema completa evento, equipo, sector, protocolo y usuario en cada registro.

## Seed de desarrollo

El evento `BIO-MR-PILOTO-2026-08-11`, el equipo `EQ-01`, los tres dispositivos `PILOT-1` a `PILOT-3` y sus asignaciones son datos demo para la instalacion local. En una instalacion de produccion deben reemplazarse desde el flujo de coordinacion.

## Cuentas demo

Todas usan la contraseña `BiocorredorDemo2026!`:

- Observador: `obs1@biocorredor.local`
- Coordinador: `coord@biocorredor.local`
- Curador: `curador@biocorredor.local`
- Administrador: `admin@biocorredor.local`
