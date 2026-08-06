# Usuarios, roles y asignaciones

## Roles operativos

- `administrador`: administra usuarios, seguridad, fuentes, respaldos y configuracion global.
- `coordinador`: crea jornadas, sectores, equipos, asignaciones y controla el cierre.
- `observador`: ve sus jornadas asignadas, inicia el recorrido, registra observaciones y transmite su trayecto.
- `curador`: rol previsto para la revision biologica; durante el piloto puede ser una capacidad del coordinador.

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
