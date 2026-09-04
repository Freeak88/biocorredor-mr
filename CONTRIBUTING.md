# Contribuir a Biocorredor MR

Gracias por ayudar a construir una herramienta comunitaria para conocer y
cuidar los territorios.

## Antes de empezar

- Revisá el [README](README.md) y la documentación operativa.
- Buscá issues existentes antes de abrir uno nuevo.
- No publiques coordenadas sensibles, datos personales ni fotografías sin
  autorización.
- No subas secretos, credenciales, bases PocketBase ni datos de participantes.

## Desarrollo local

```bash
npm ci
Copy-Item .env.example .env.local
npm run lint
npm test -- --run
npm run build
```

Para levantar PocketBase localmente:

```bash
docker compose -f docker-compose.local.yml up --build
npm run dev
```

## Cambios

1. Abrí una rama descriptiva desde la rama estable.
2. Mantené los cambios pequeños y enfocados.
3. Agregá o actualizá tests cuando cambie un comportamiento.
4. Ejecutá lint, tests y build antes de abrir el pull request.
5. Explicá el impacto para observadores, coordinación y curaduría.

## Pull requests

Un pull request debe incluir:

- qué cambia;
- por qué es necesario;
- cómo se probó;
- capturas si cambia la interfaz;
- impacto offline, de privacidad y de sincronización;
- migraciones o pasos operativos, si corresponde.

## Licencias

El software se distribuye bajo AGPL-3.0-or-later. La documentación y los
materiales comunitarios se distribuyen bajo CC BY-SA 4.0. Revisá las licencias
de datos, mapas, fotografías y dependencias de terceros antes de incorporarlos.
