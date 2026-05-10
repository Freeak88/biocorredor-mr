# Fungimap — Plan de Implementación con Pruebas

> **Estado:** APROBADO para ejecución agentica  
> **Fecha:** 2026-05-10  
> **Modo:** Desarrollo agentico (no humano). El cuello de botella es validación del usuario + testing en dispositivo.  
> **Referencia técnica:** `PLAN_TECNICO.md` (schema, hooks, componentes, riesgos)

---

## 0. Protocolo de Ejecución Agentica

### Reglas
1. **Un batch a la vez.** No saltar. No adelantar.
2. **Cada batch termina en un commit con mensaje descriptivo.**
3. **Cada batch tiene un "checkpoint de validación" que EL USUARIO debe aprobar antes de continuar.**
4. **Si algo falla en un batch, se arregla dentro del batch. No se deuda técnica para después.**
5. **Testing en producción (fungimap.lab.embudo.com.ar) solo después de que el usuario de el OK.**

### Cómo valida el usuario
Después de cada batch, el usuario debe probar en su celular o navegador y responder:
- ✅ **Aprobado** → pasar al siguiente batch
- ⚠️ **Ajustar X** → se arregla X dentro del batch actual, nuevo checkpoint
- ❌ **No funciona** → debug completo, no se avanza

---

## Batch 0: Preparación — Validar Schema Actual

**Objetivo:** Revisar el schema y código actual para identificar conflictos antes de tocar nada.

### Paso 0.1 — Snapshot del estado actual
```bash
cd /root/.openclaw/workspace/projects/fungi/fungimap

# Verificar que el repo está limpio
git status
# Si hay cambios sin commitear, stash o commit antes de empezar

git log --oneline -5
# Notar el último commit para referencia
```

### Paso 0.2 — Revisar schema actual de PocketBase
```bash
# Ver migraciones existentes
ls -la pocketbase/pb_migrations/
# Debería haber: 001_setup.js, 003_gbif_bot.js, 004_users_fields.js, 1777*.js

# Ver hooks actuales
cat pocketbase/pb_hooks/main.js | head -100
# Notar: hook de Gemini, rate limiting, rutas custom
```

### Paso 0.3 — Revisar colecciones actuales en PB admin
```bash
# Abrir admin UI
curl -s http://fungimap.lab.embudo.com.ar/_/ | head -20
# Loguearse y verificar: users, sightings, comments, chat_messages, reports, logs, rate_limits
```

### Paso 0.4 — Verificar que no hay campos conflictivos
Campos a buscar en schema actual (no deben existir todavía):
- `users.sightings_total`
- `users.sightings_first_global`
- `users.sightings_first_local`
- `users.ai_access`
- `sightings.ai_confidence`
- `sightings.ai_alternatives`
- Colección `first_sightings_log`
- Colección `species_sheets`
- Colección `sheet_votes`

```bash
# Si la app está corriendo, hacer backup de pb_data antes de cualquier migración
# (PocketBase guarda todo en SQLite, el backup es copiar el directorio)
cp -r /opt/fungimap/pb_data /opt/fungimap/pb_data.backup.$(date +%Y%m%d_%H%M%S)
```

### Checkpoint 0 ✅
**¿Está todo limpio? ¿No hay campos conflictivos?**

El usuario debe confirmar:
- [ ] Schema revisado, no hay conflictos
- [ ] Backup de pb_data realizado
- [ ] Listo para Batch 1

---

## Batch 1: Cámara Directa desde el Mapa

**Funcionalidad:** Usuario toca `+` en mapa → elige Cámara → saca foto → formulario se abre con imagen + GPS precargados.

### Paso 1.1 — Crear componente `CaptureButton.tsx`
**Archivo:** `src/components/CaptureButton.tsx`

```tsx
// Bottom sheet / action sheet con dos opciones: Cámara y Galería
// Usar <input type="file" accept="image/*" capture="environment" /> para cámara trasera
// Usar <input type="file" accept="image/*" /> para galería
// Ambos hidden, activados por click en botones del sheet
```

**Prueba manual:**
```bash
# Compilar y verificar que el componente renderiza
npm run build
# No debe haber errores de TypeScript
```

### Paso 1.2 — Modificar `MapView.tsx` para integrar `CaptureButton`
**Archivo:** `src/components/MapView.tsx`

```tsx
// Agregar botón flotante "+" que abre CaptureButton
// Al elegir opción, propagar el File object al callback onCapture
```

**Prueba manual:**
1. Abrir `http://fungimap.lab.embudo.com.ar` en celular
2. Tocar `+` → debe aparecer sheet con "Cámara" y "Galería"

### Paso 1.3 — Modificar `NewSightingModal.tsx` para aceptar `prefillImage`
**Archivo:** `src/components/NewSightingModal.tsx`

```tsx
// Nuevo prop: prefillImage?: File
// Si existe, mostrar en ImagePreview inmediatamente
// No requerir que el usuario toque "Subir imagen"
```

**Prueba manual:**
```bash
# En desktop, simular pasando un File mock:
# Abrir consola, crear un objeto File, llamar al modal
# Verificar que la imagen aparece en preview
```

### Paso 1.4 — Modificar `useSightingForm.ts` para inicializar con imagen
**Archivo:** `src/hooks/useSightingForm.ts`

```ts
// Agregar parámetro opcional: initialImage?: File
// En useState inicial, si initialImage existe, setearlo en form.images
```

### Paso 1.5 — Capturar GPS en momento del disparo (no del submit)
**Archivo:** `src/components/CaptureButton.tsx` o `MapView.tsx`

```ts
// Cuando el usuario elige "Cámara", capturar navigator.geolocation.getCurrentPosition()
// Guardar lat/lng en un ref o state
// Pasar al NewSightingModal como props: initialLat, initialLng
// En useSightingForm, inicializar lat/lng con estos valores
```

**Prueba manual:**
1. En celular, tocar `+` → Cámara
2. Verificar que el GPS se captura ANTES de que la cámara se abra
3. En el formulario, lat/lng deben estar prellenados

### Paso 1.6 — Manejo de permisos de cámara
**Archivo:** `src/components/CaptureButton.tsx`

```tsx
// Si el usuario deniega permiso de cámara:
// Mostrar mensaje: "Necesitamos acceso a la cámara para identificar hongos en campo.
//                  Ve a Configuración > Safari > Cámara > Permitir"
// (ajustar texto según navegador)
```

**Prueba manual:**
1. En iOS Safari, bloquear permiso de cámara
2. Tocar `+` → Cámara
3. Debe mostrar mensaje amigable, no crashear

### Paso 1.7 — Draft en localStorage (recuperación de interrupción)
**Archivo:** `src/hooks/useSightingForm.ts` y `App.tsx`

```ts
// En useSightingForm:
// - useEffect: guardar estado actual en localStorage cada 5 segundos (debounced)
// - Al inicializar, si hay draft en localStorage y el form está vacío, preguntar al usuario:
//   "Tenés un borrador guardado. ¿Continuar?" / "Descartar"
// - Clave: `fungimap_draft_sighting_${userId}`
// - Limpiar localStorage al submit exitoso
```

**Prueba manual:**
1. Abrir formulario, cargar imagen, escribir descripción
2. Cerrar pestaña / matar app
3. Reabrir Fungimap
4. Debe preguntar "¿Continuar borrador?"
5. Al elegir "Sí", el formulario debe estar exactamente como estaba

### Paso 1.8 — Test E2E con Playwright
**Archivo:** `e2e/camera-flow.spec.ts`

```ts
// Test: flujo completo cámara → formulario → submit
// Simular input file (no se puede testear cámara nativa real, pero sí el flujo post-captura)
// Verificar que sighting se crea con imagen y coordenadas correctas
```

```bash
npx playwright test e2e/camera-flow.spec.ts
```

### Paso 1.9 — Commit y deploy
```bash
git add .
git commit -m "Batch 1: Cámara directa desde mapa + GPS capture + draft recovery"
npm run build
docker compose up -d --build
```

### Checkpoint 1 ✅
**El usuario debe probar en su celular:**
- [ ] Tocar `+` en el mapa
- [ ] Elegir "Cámara" → se abre cámara nativa trasera
- [ ] Sacar foto → se abre formulario con imagen precargada
- [ ] Verificar que lat/lng están prellenados con ubicación actual
- [ ] Cerrar app sin guardar, reabrir → pregunta "¿Continuar borrador?"
- [ ] Si deniega cámara, mensaje amigable

---

## Batch 2: Tracking de Registros + Badges + Leaderboard

**Funcionalidad:** Detectar "primeros" registros (global y local 30km), asignar badges, mostrar rachas, leaderboard regional top 10.

### Paso 2.1 — Migración `005_user_stats.js`
**Archivo:** `pocketbase/pb_migrations/005_user_stats.js`

```javascript
migrate((db) => {
  const usersCollection = db.findCollectionByNameOrId("users");
  
  // Agregar campos nuevos
  usersCollection.schema.addField(new SchemaField({
    name: "sightings_total", type: "number", required: false, default: 0
  }));
  usersCollection.schema.addField(new SchemaField({
    name: "sightings_first_global", type: "number", required: false, default: 0
  }));
  usersCollection.schema.addField(new SchemaField({
    name: "sightings_first_local", type: "number", required: false, default: 0
  }));
  usersCollection.schema.addField(new SchemaField({
    name: "sightings_streak_current", type: "number", required: false, default: 0
  }));
  usersCollection.schema.addField(new SchemaField({
    name: "sightings_streak_max", type: "number", required: false, default: 0
  }));
  usersCollection.schema.addField(new SchemaField({
    name: "last_sighting_at", type: "date", required: false
  }));
  usersCollection.schema.addField(new SchemaField({
    name: "badges", type: "json", required: false, default: "[]"
  }));

  return db.saveCollection(usersCollection);
});
```

**Prueba:**
```bash
# Levantar PocketBase local con la migración
cd pocketbase && ./pocketbase serve
# Verificar en Admin UI que los campos aparecen en users
```

### Paso 2.2 — Migración `006_first_sighting_log.js`
**Archivo:** `pocketbase/pb_migrations/006_first_sighting_log.js`

```javascript
migrate((db) => {
  const collection = new Collection({
    name: "first_sightings_log",
    type: "base",
    schema: [
      { name: "user", type: "relation", required: true, options: { collectionId: "_pb_users_auth_" }},
      { name: "sighting", type: "relation", required: true, options: { collectionId: "sightings" }},
      { name: "type", type: "select", required: true, options: { values: ["global", "local"] }},
      { name: "species", type: "text", required: true },
      { name: "radius_km", type: "number", required: false },
    ],
    indexes: [
      "CREATE INDEX idx_first_log_species_type ON first_sightings_log (species, type)",
      "CREATE INDEX idx_first_log_user ON first_sightings_log (user, type)"
    ]
  });
  return db.saveCollection(collection);
});
```

### Paso 2.3 — Hook `onRecordCreate` sighting: tracking básico
**Archivo:** `pocketbase/pb_hooks/main.js` (o nuevo archivo importado)

```javascript
// Al crear un sighting:
// 1. Incrementar users.sightings_total
// 2. Detectar first_global
// 3. Detectar first_local (30km)
// 4. Actualizar streaks
// 5. Agregar badge si corresponde

// Función haversine para distancia en km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

**Prueba con curl:**
```bash
# Crear un sighting de prueba
curl -X POST http://fungimap.lab.embudo.com.ar/api/collections/sightings/records \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "user": "<USER_ID>",
    "mushroom_name": "Amanita muscaria",
    "description": "Test tracking",
    "lat": -34.6037,
    "lng": -58.3816
  }'

# Verificar que users.sightings_total incrementó
curl http://fungimap.lab.embudo.com.ar/api/collections/users/records/<USER_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

### Paso 2.4 — Detectar `first_global`
**Lógica:**
```
¿Existe first_sightings_log con:
  - species = nueva_species
  - type = "global"
  - user != usuario_actual
? 
Si NO → es first_global:
  - Insertar en first_sightings_log
  - Incrementar users.sightings_first_global
  - Agregar badge: "first_global:{species}"
```

**Prueba:**
1. Crear sighting con species "Coprinus comatus" como User A
2. Verificar que users.sightings_first_global = 1
3. Crear sighting con MISMA species como User B
4. Verificar que users.sightings_first_global NO incrementa (ya existe)

### Paso 2.5 — Detectar `first_local` (radio 30km)
**Lógica:**
```
¿Existe sighting con:
  - species = nueva_species
  - user != usuario_actual
  - haversine(lat, lng, nuevo_lat, nuevo_lng) < 30
?
Si NO → es first_local:
  - Insertar en first_sightings_log (type="local", radius_km=30)
  - Incrementar users.sightings_first_local
  - Agregar badge: "first_local:30km:{species}"
```

**Prueba:**
1. User A registra en Buenos Aires (-34.6, -58.4) → first_local = 1
2. User B registra MISMA species en Buenos Aires (-34.6, -58.4) → first_local NO incrementa
3. User C registra MISMA species en Mar del Plata (-38.0, -57.5) → first_local = 1 (está lejos)

### Paso 2.6 — Rachas (streaks)
**Lógica:**
```
last = users.last_sighting_at
now = new Date()
diffDays = (now - last) / (1000 * 60 * 60 * 24)

if diffDays >= 2:
  streak_current = 1
elif diffDays >= 1:
  streak_current += 1
  if streak_current > streak_max:
    streak_max = streak_current
```

**Prueba:**
```bash
# Simular con 3 sightings en días consecutivos (mock dates en DB)
# Verificar streak_current = 3, streak_max = 3

# Simular 5 días sin sighting, luego uno nuevo
# Verificar streak_current = 1 (se reseteó)
```

### Paso 2.7 — Componente `UserBadges.tsx`
**Archivo:** `src/components/UserBadges.tsx`

```tsx
// Renderiza users.badges como chips con iconos
// "first_global:amanita_muscaria" → "🥇 Primero en Fungimap: Amanita muscaria"
// "first_local:30km:coprinus_comatus" → "🌎 Primero en la zona: Coprinus comatus"
```

**Prueba visual:**
1. Abrir perfil de usuario
2. Verificar que los badges renderizan con texto humano-legible

### Paso 2.8 — Endpoint `GET /api/custom/leaderboard`
**Archivo:** `pocketbase/pb_hooks/main.js`

```javascript
// Query param: ?lat=XX&lng=YY
// Devuelve top 10 usuarios por sightings_first_local
// donde el usuario tiene al menos 1 first_local en radio 30km de (lat, lng)
// O más simple: top 10 global por sightings_first_local (para MVP)
// NOTA: El leaderboard "regional dinámico" requiere geoespacial real.
//       Para MVP, hacer top 10 global por sightings_first_local + first_global.
```

**Prueba con curl:**
```bash
curl "http://fungimap.lab.embudo.com.ar/api/custom/leaderboard?lat=-34.6&lng=-58.4"
# Debe devolver JSON con top 10
```

### Paso 2.9 — Componente `LeaderboardPanel.tsx`
**Archivo:** `src/components/LeaderboardPanel.tsx`

```tsx
// Slide-out panel desde Header
// Muestra top 10 con avatar, nombre, score
// Score = sightings_first_local + sightings_first_global
```

### Paso 2.10 — Notificación in-app de "first"
**Archivo:** `src/components/NewSightingModal.tsx` o hook

```tsx
// Al submit exitoso:
// Si la respuesta del backend incluye "first_global" o "first_local",
// mostrar toast: "🥇 ¡Descubriste un [species] que nadie había registrado!"
```

### Paso 2.11 — Commit y deploy
```bash
git add .
git commit -m "Batch 2: Tracking first sightings + badges + leaderboard"
npm run build && docker compose up -d --build
```

### Checkpoint 2 ✅
**El usuario debe probar:**
- [ ] Registrar un hongo nuevo → verificar que sightings_total incrementa
- [ ] Registrar una species nunca antes vista → toast "¡Descubriste...!"
- [ ] Badge aparece en perfil
- [ ] Leaderboard muestra top 10
- [ ] Registrar MISMA species con otro usuario cercano → NO es first
- [ ] Registrar MISMA species con otro usuario lejos → SÍ es first_local

---

## Batch 3: Control de IA (Deshabilitada por Defecto)

**Funcionalidad:** IA deshabilitada para todos los nuevos usuarios. Solo admin habilita. Rate limit 20/h.

### Paso 3.1 — Migración `007_ai_access.js`
**Archivo:** `pocketbase/pb_migrations/007_ai_access.js`

```javascript
migrate((db) => {
  const users = db.findCollectionByNameOrId("users");
  users.schema.addField(new SchemaField({
    name: "ai_access",
    type: "select",
    required: false,
    options: { values: ["disabled", "enabled_free", "enabled_beta", "enabled_paid"] },
    default: "disabled"
  }));
  users.schema.addField(new SchemaField({
    name: "ai_calls_total",
    type: "number",
    required: false,
    default: 0
  }));
  users.schema.addField(new SchemaField({
    name: "ai_credits_remaining",
    type: "number",
    required: false
  }));
  return db.saveCollection(users);
});
```

**IMPORTANTE:** Usuarios existentes quedan con `ai_access = "disabled"`.
Damián (admin) debe habilitarse a sí mismo manualmente.

### Paso 3.2 — Modificar hook `POST /api/custom/identify`
**Archivo:** `pocketbase/pb_hooks/main.js`

```javascript
// Al inicio del handler:
// 1. Obtener usuario autenticado
// 2. Si user.ai_access === "disabled" → return 403 { message: "IA no disponible. Contactá al admin." }
// 3. Si rate limit excedido → return 429
// 4. Llamar Gemini
// 5. Incrementar user.ai_calls_total
```

### Paso 3.3 — Rate limit con ventana deslizante exacta
**Lógica:**
```
En colección rate_limits:
- period_start: datetime del inicio de la ventana actual
- count: número de requests en esa ventana

Al recibir request:
- Si now - period_start > 1 hora → resetear period_start = now, count = 0
- Si count >= 20 → return 429
- count++
- Guardar
```

**Prueba con curl:**
```bash
# Hacer 21 requests identificación
for i in {1..21}; do
  curl -X POST http://fungimap.lab.embudo.com.ar/api/custom/identify \
    -H "Authorization: Bearer <TOKEN>" \
    -F "image=@test.jpg"
done
# La 21ª debe devolver 429
```

### Paso 3.4 — Admin UI: toggle `ai_access`
**Archivo:** `src/components/AdminPanel.tsx`

```tsx
// En la lista de usuarios, agregar columna "IA Access"
// Dropdown o toggle para cambiar entre disabled/enabled_free/enabled_beta
// Solo visible para role === "admin"
```

**Prueba visual:**
1. Admin abre panel
2. Cambia su propio ai_access a "enabled_free"
3. Verificar que el cambio persiste en DB

### Paso 3.5 — UI: estado del botón IA en `NewSightingModal`
**Archivo:** `src/components/NewSightingModal.tsx`

```tsx
// Si user.ai_access === "disabled":
//   Botón grisado, texto: "Identificación con IA no disponible"
//   Link: "¿Cómo habilitar?" → modal informativo
// Si user.ai_access === "enabled_free":
//   Botón normal, badge: "X/20 restantes"
// Si rate limit alcanzado:
//   Botón deshabilitado, cuenta regresiva
```

### Paso 3.6 — Commit y deploy
```bash
git add .
git commit -m "Batch 3: IA disabled by default + admin toggle + rate limit 20/h"
npm run build && docker compose up -d --build
```

### Checkpoint 3 ✅
- [ ] Nuevo usuario tiene `ai_access = disabled`
- [ ] Botón IA grisado con mensaje informativo
- [ ] Admin cambia a `enabled_free` → usuario puede usar IA
- [ ] 20 identificaciones en 1h → 21ª bloqueada
- [ ] UI muestra contador "X/20 restantes"
- [ ] Pasada 1h, vuelve a funcionar

---

## Batch 4: IA Probabilística + Taxonomía

**Funcionalidad:** Gemini devuelve ranking con confianza. UI muestra 1/3/5 alternativas según score. Breadcrumbs taxonómicos.

### Paso 4.1 — Migración `008_ai_alternatives.js`
**Archivo:** `pocketbase/pb_migrations/008_ai_alternatives.js`

```javascript
migrate((db) => {
  const sightings = db.findCollectionByNameOrId("sightings");
  sightings.schema.addField(new SchemaField({
    name: "ai_confidence",
    type: "number",
    required: false
  }));
  sightings.schema.addField(new SchemaField({
    name: "ai_alternatives",
    type: "json",
    required: false
  }));
  return db.saveCollection(sightings);
});
```

### Paso 4.2 — Modificar prompt de Gemini
**Archivo:** `pocketbase/pb_hooks/main.js` (función que llama a Gemini)

```javascript
// Nuevo prompt:
const prompt = `
Analizá esta imagen de hongo. Respondé EXCLUSIVAMENTE en JSON con esta estructura:
{
  "top_candidate": {
    "name": "nombre científico",
    "confidence": 0.0-1.0,
    "taxonomy": {
      "kingdom": "...", "phylum": "...", "class": "...",
      "order": "...", "family": "...", "genus": "...", "species": "..."
    }
  },
  "alternatives": [
    // máximo 4 alternativas adicionales (total 5), ordenadas por confidence descendente
    { "name": "...", "confidence": 0.0-1.0, "taxonomy": {...} }
  ],
  "warning": null o "low_confidence" si confidence < 0.5
}
`;
```

### Paso 4.3 — Parser defensivo
**Archivo:** `pocketbase/pb_hooks/main.js`

```javascript
// Intentar parsear JSON
// Si falla: regex para extraer bloque JSON entre ```json y ```
// Si sigue fallando: fallback a estructura básica sin confidence
// Normalizar confidence: clamp entre 0 y 1
// Si falta taxonomy: buscar en GBIF o dejar vacío
```

### Paso 4.4 — Componente `AiResultPanel.tsx`
**Archivo:** `src/components/AiResultPanel.tsx`

```tsx
// Recibe: AiIdentificationResult
// Lógica:
//   if confidence > 0.85 → muestra top-1 + 1 alternativa
//   if confidence > 0.50 → muestra top-1 + 3 alternativas
//   else → muestra top-1 + 5 alternativas + alerta "Baja confianza"
// Cada candidato muestra: nombre, confidence %, TaxonomyBreadcrumb
```

### Paso 4.5 — Componente `TaxonomyBreadcrumb.tsx`
**Archivo:** `src/components/TaxonomyBreadcrumb.tsx`

```tsx
// Reino > Filo > Clase > Orden > Familia > Género > Especie
// Cada nivel es clickeable (futuro: navegar a ficha de ese nivel)
// Por ahora: visualización plana, no interactiva (o interactiva básica)
```

### Paso 4.6 — Integración en flujo
**Archivo:** `src/components/NewSightingModal.tsx`

```tsx
// Al usar IA:
// 1. Mostrar loader mientras Gemini responde
// 2. Mostrar AiResultPanel con resultados
// 3. Usuario puede:
//    a) Seleccionar un candidato → prellena mushroom_name, taxonomy
//    b) Escribir manualmente → ignora IA
// 4. Al submit, guardar ai_confidence y ai_alternatives en el sighting
```

### Paso 4.7 — Commit y deploy
```bash
git add .
git commit -m "Batch 4: AI probabilistic ranking + taxonomy breadcrumbs"
npm run build && docker compose up -d --build
```

### Checkpoint 4 ✅
- [ ] Foto nítida de hongo común → confidence >85%, 1 alternativa mostrada
- [ ] Foto borrosa → confidence <50%, 5 alternativas + alerta roja
- [ ] Breadcrumbs taxonómicos visibles para cada candidato
- [ ] Al seleccionar candidato, nombre y taxonomía se prellenan
- [ ] Si Gemini devuelve malformado, no crashea (fallback)
- [ ] sighting guarda ai_confidence y ai_alternatives

---

## Batch 5: Fichas Wikipedia + Votación

**Funcionalidad:** Cada especie tiene ficha. Upvote/downvote. Propuesta de ediciones.

### Paso 5.1 — Migración `009_species_sheets.js`
**Archivo:** `pocketbase/pb_migrations/009_species_sheets.js`

```javascript
// Crear colección species_sheets
// Campos: species_name (unique), taxonomy (json), content (json),
//         status (select), version (number), score (number)
```

### Paso 5.2 — Migración `010_sheet_votes.js`
**Archivo:** `pocketbase/pb_migrations/010_sheet_votes.js`

```javascript
// Crear colección sheet_votes
// Campos: sheet (relation), user (relation), vote_type (select),
//         proposed_field, old_value, new_value, status
// Unique constraint: sheet + user + vote_type
```

### Paso 5.3 — Hook recalcular score
**Archivo:** `pocketbase/pb_hooks/main.js`

```javascript
// onRecordCreate para sheet_votes:
// - Validar unique constraint
// - Si vote_type === "propose_edit" → species_sheets.status = "disputed"
// - Recalcular score: count(upvote) - count(downvote) para esa sheet
// - Guardar score en species_sheets
```

### Paso 5.4 — Componente `SpeciesSheetView.tsx`
**Archivo:** `src/components/SpeciesSheetView.tsx`

```tsx
// Mostrar:
// - species_name como título
// - TaxonomyBreadcrumb
// - Secciones colapsables: Descripción, Toxicidad, Hábitat, Usos, Notas
// - Score con Upvote/Downvote buttons
// - Botón "Proponer edición" → abre SheetEditor
```

### Paso 5.5 — Componente `SheetEditor.tsx`
**Archivo:** `src/components/SheetEditor.tsx`

```tsx
// Inline editor: seleccionar campo (dropdown), ver valor actual,
// escribir nuevo valor, submit
// Crea un sheet_votes con vote_type="propose_edit"
```

### Paso 5.6 — Integración en SightingDetail y AiResultPanel
```tsx
// En SightingDetail: clickear mushroom_name → navegar a SpeciesSheetView
// En AiResultPanel: cada candidato tiene link "Ver ficha" → SpeciesSheetView
```

### Paso 5.7 — Commit y deploy
```bash
git add .
git commit -m "Batch 5: Species sheets + voting + edit proposals"
npm run build && docker compose up -d --build
```

### Checkpoint 5 ✅
- [ ] Ficha de especie visible con descripción, toxicidad, hábitat
- [ ] Usuario puede upvote/downvote
- [ ] No puede votar 2 veces
- [ ] Usuario propone edición → queda en pending, ficha pasa a disputed
- [ ] Score se actualiza
- [ ] Ficha accesible desde sighting y desde resultado de IA

---

## Post-Implementación: Optimización y Deuda Técnica

**Solo después de que los 5 batches estén aprobados:**

1. **Recalcular stats para usuarios existentes** (`scripts/recalc-user-stats.js`)
2. **Agregar índices faltantes** en queries lentas
3. **Tests de carga** para leaderboard con 1000+ usuarios
4. **Documentación** para Damián sobre cómo usar AdminPanel

---

## Historial de Checkpoints

| Batch | Estado | Fecha aprobación |
|---|---|---|
| 0 — Preparación | ⬜ Pendiente | |
| 1 — Cámara | ⬜ Pendiente | |
| 2 — Tracking | ⬜ Pendiente | |
| 3 — Control IA | ⬜ Pendiente | |
| 4 — IA Probabilística | ⬜ Pendiente | |
| 5 — Fichas | ⬜ Pendiente | |

---

*Documento ejecutable. No tocar código hasta aprobación de checkpoint correspondiente.*
