# Fungimap — Plan Técnico de Implementación

> **Versión:** 1.0  
> **Fecha:** 2026-05-10  
> **Scope:** Planificación técnica. Sin código.  
> **Estado:** Decisiones de negocio aprobadas (ver `PLAN_FUNCIONALIDADES.md`).

---

## 1. Resumen Ejecutivo

**Objetivo:** Implementar 5 funcionalidades priorizadas que transforman Fungimap de un registro manual a una experiencia de campo fluida con gamificación, control de costos IA, y validación comunitaria.

**Stack base:** PocketBase (backend + DB), Vite+React+TypeScript (frontend), Docker+Traefik (infra).

**Horizonte:** 6-8 semanas (estimación conservadora, 1 desarrollador fullstack).

---

## 2. Fases y Milestones

> **Nota sobre modo de ejecución:** Este es desarrollo **agentico**, no trabajo de equipo humano. Los milestones no se miden en "semanas de calendario" sino en **bloques de trabajo ejecutables**. El cuello de botella real es: (a) validación del usuario sobre decisiones de UX, y (b) testing en dispositivos físicos (cámara nativa, PWA iOS). Los milestones se pueden ejecutar en secuencia rápida cuando no hay bloqueo humano.

### Milestone 0 — Preparación (Batch inicial)
| Tarea | Esfuerzo | Riesgo |
|---|---|---|
| Revisar schema actual vs necesidades del plan | 2h | Bajo |
| Definir estructura de JSON fields (gamificación, AI alternativas) | 2h | Medio |
| Establecer convención de migraciones PocketBase | 1h | Bajo |
| Branch strategy: `main` → `develop` → feature branches | 1h | Bajo |

**Entregable:** Migraciones `005_` a `009_` listas en local, no aplicadas aún.

---

### Milestone 1 — Cámara Directa (Func 5) — Semana 1
**Prioridad:** 🔥 Máxima. No depende de otras funcionalidades.

| # | Tarea | Esfuerzo | Stack | Criterio de aceptación |
|---|---|---|---|---|
| 1.1 | `NewSightingModal`: aceptar `prefillImage?: File` como prop | 2h | Frontend | Modal abre con imagen en preview sin tocar galería |
| 1.2 | `useSightingForm`: inicializar estado con imagen precargada | 2h | Frontend | Hook no pierde la imagen entre pasos del formulario |
| 1.3 | Componente `CaptureButton`: bottom-sheet "Cámara / Galería" | 3h | Frontend | UI consistente con Tailwind, accesible (a11y) |
| 1.4 | Integración `<input capture="environment">` en `CaptureButton` | 2h | Frontend | En iOS Safari y Android Chrome abre cámara nativa trasera |
| 1.5 | Manejo de permisos denegados + mensaje amigable | 2h | Frontend | Si usuario bloquea cámara, muestra instrucciones para desbloquear |
| 1.6 | GPS: capturar coordenadas en momento del disparo, no del submit | 2h | Frontend | `lat/lng` se congelan al abrir cámara, no al guardar |
| 1.7 | Draft local: si usuario cierra app antes de submit, recuperar en localStorage | 4h | Frontend | Al reabrir Fungimap, detecta draft pendiente y pregunta "¿Continuar?" |
| 1.8 | Tests E2E (Playwright): flujo cámara → formulario → submit | 4h | QA | Test automatizado simula capture y verifica sighting creado |

**Total Milestone 1:** ~21h (~3 días efectivos)

**Entregable:** Usuario puede abrir cámara desde mapa, sacar foto, completar ficha, y recuperar draft si interrumpe.

---

### Milestone 2 — Tracking de Registros (Func 2) — Semana 2
**Prioridad:** Alta. Base para Func 3 y Func 4.

#### 2.1 Schema — Migración `005_user_stats.js`

```javascript
// Colección users — campos nuevos
{
  sightings_total:        number   (default: 0),
  sightings_first_global: number   (default: 0),
  sightings_first_local:  number   (default: 0),
  sightings_streak_current: number (default: 0),
  sightings_streak_max:   number   (default: 0),
  last_sighting_at:       datetime (default: null),
  badges:                 json     (default: []),
  // badges esperados: ["first_global:amanita_muscaria", "first_local:50km:boletus_edulis", ...]
}
```

#### 2.2 Schema — Migración `006_first_sighting_log.js`

```javascript
// Nueva colección: first_sightings_log
{
  user:        relation → users (required),
  sighting:    relation → sightings (required),
  type:        select ["global", "local"] (required),
  species:     string   // nombre científico o género
  radius_km:   number   // null para global, 30 para local
  created:     datetime (auto)
}
// Indexes: species + type, user + type
```

| # | Tarea | Esfuerzo | Stack | Criterio de aceptación |
|---|---|---|---|---|
| 2.1 | Migración `005_user_stats.js` | 2h | Backend | Campos aplicados sin pérdida de datos existentes |
| 2.2 | Migración `006_first_sighting_log.js` | 2h | Backend | Colección creada con indexes para queries rápidas |
| 2.3 | Hook `onRecordCreate` sighting: contar `sightings_total` | 2h | Backend | Cada sighting incrementa contador atómicamente |
| 2.4 | Hook `onRecordCreate` sighting: detectar `first_global` | 4h | Backend | Si species no existe en `first_sightings_log` con `type=global` de otro user, marca como first |
| 2.5 | Hook `onRecordCreate` sighting: detectar `first_local` (radio 30km) | 4h | Backend | Query geoespacial: ¿existe sighting de misma species dentro de 30km por otro user? |
| 2.6 | Hook: racha de días (`streak_current` / `streak_max`) | 3h | Backend | Si last_sighting_at es ayer → streak+1. Si >1 día → streak=1 |
| 2.7 | Hook: asignar badge en campo `users.badges` | 2h | Backend | Badge agregado como string estructurado en JSON array |
| 2.8 | Endpoint `GET /api/custom/leaderboard?lat=&lng=&radius=30` | 4h | Backend | Retorna top 10 usuarios por `sightings_first_local` en región dinámica (30km) |
| 2.9 | Componente `UserBadges`: mostrar insignias en perfil | 3h | Frontend | Renderiza badges con iconos/emoji según tipo |
| 2.10 | Componente `LeaderboardPanel`: top 10 regional | 4h | Frontend | Panel deslizable desde header, se recarga con ubicación actual |
| 2.11 | Notificación in-app: "¡Descubriste un [especie]!" | 2h | Frontend | Toast o modal momentáneo al crear sighting first |
| 2.12 | Tests: hook de first_sighting con múltiples usuarios y ubicaciones | 4h | QA | Vitest para hooks, Playwright para flujo completo |

**Total Milestone 2:** ~36h (~5 días efectivos)

**Entregable:** Sistema de tracking + badges + leaderboard regional top 10 operativo.

---

### Milestone 3 — Control de IA (Func 4) — Semana 3
**Prioridad:** Alta. Protege costos antes de mejorar IA.

#### 3.1 Schema — Migración `007_ai_access.js`

```javascript
// Colección users — campos nuevos
{
  ai_access:          select ["disabled", "enabled_free", "enabled_beta", "enabled_paid"] (default: "disabled"),
  ai_calls_total:     number   (default: 0),
  ai_credits_remaining: number   (default: null), // null = no aplica (free/beta)
}

// Colección rate_limits — ya existe, extender:
{
  // mantener: user, action, count, last_request
  // agregar: period_start datetime para ventana deslizante exacta
}
```

| # | Tarea | Esfuerzo | Stack | Criterio de aceptación |
|---|---|---|---|---|
| 3.1 | Migración `007_ai_access.js` | 2h | Backend | **Usuarios existentes pasan a `disabled`**. Sin grace period. Solo admin habilita manualmente. |
| 3.2 | Hook `POST /api/custom/identify`: chequear `ai_access != disabled` | 2h | Backend | Retorna 403 si usuario no tiene acceso |
| 3.3 | Hook `POST /api/custom/identify`: contador `ai_calls_total++` | 1h | Backend | Contador atómico por llamada |
| 3.4 | Hook `POST /api/custom/identify`: rate limit con ventana deslizante 1h | 3h | Backend | 20 req/hora exactas, no solo "desde última llamada" |
| 3.5 | Admin UI: toggle `ai_access` por usuario en `AdminPanel.tsx` | 3h | Frontend | Checkbox o select para cambiar estado de IA por usuario |
| 3.6 | `NewSightingModal`: estado del botón IA según `ai_access` | 3h | Frontend | Disabled → mensaje "No disponible". Free → contador "12/20 restantes" |
| 3.7 | `NewSightingModal`: contador visual de rate limit | 2h | Frontend | Badge con countdown "Renueva en 14 min" |
| 3.8 | Tests: rate limit exacto, edge cases de ventana deslizante | 3h | QA | Vitest avanza reloj simulado, verifica bloqueo y liberación |

**Total Milestone 3:** ~19h (~3 días efectivos)

**Entregable:** IA deshabilitada por defecto para nuevos usuarios. Admin habilita manualmente. Rate limit 20/h operativo. UI informa estado y créditos.

---

### Milestone 4 — IA Probabilística (Func 1) — Semana 4
**Prioridad:** Media-Alta. Depende de Func 4 (control de costos).

#### 4.1 Schema — Migración `008_ai_alternatives.js`

```javascript
// Colección sightings — campos nuevos
{
  ai_confidence:   number   (null si no usó IA),
  ai_alternatives: json     (null si no usó IA),
  // ai_alternatives esperado:
  // [
  //   { rank: 1, name: "Amanita muscaria", confidence: 0.87,
  //     taxonomy: { kingdom: "Fungi", phylum: "Basidiomycota", ... } },
  //   { rank: 2, name: "Amanita pantherina", confidence: 0.34,
  //     taxonomy: { ... } }
  // ]
}
```

#### 4.2 Prompt Engineering — Backend Hook

El hook actual de Gemini debe modificarse para solicitar:
```
Analizá esta imagen de hongo. Respondé EXCLUSIVAMENTE en JSON con:
- top_candidate: { name, confidence 0-1, taxonomy: {kingdom, phylum, class, order, family, genus, species} }
- alternatives: array de { name, confidence, taxonomy } ordenado por confidence descendente
- max 5 alternativas
- si confidence < 0.5, incluir warning: "low_confidence"
```

| # | Tarea | Esfuerzo | Stack | Criterio de aceptación |
|---|---|---|---|---|
| 4.1 | Migración `008_ai_alternatives.js` | 1h | Backend | Campos agregados, sightings existentes quedan null |
| 4.2 | Hook Gemini: nuevo prompt estructurado con JSON mode | 4h | Backend | Respuesta parseable 100% de las veces. Fallback si Gemini no respeta formato |
| 4.3 | Parser de respuesta Gemini: validar schema, clamp confidences | 2h | Backend | Si confidence > 1 o < 0, lo normaliza. Si falta taxonomy, lo busca en GBIF |
| 4.4 | Lógica de presentación: decidir cuántas alternativas mostrar según confidence | 2h | Frontend | Función pura `getDisplayAlternatives(confidence) → 1|3|5` |
| 4.5 | Componente `AiResultPanel`: mostrar top-1 + alternativas + taxonomía | 6h | Frontend | Árbol taxonómico navegable. Confianza >85% → 1 alternativa. 50-85% → 3. <50% → 5 + alerta |
| 4.6 | Componente `TaxonomyBreadcrumb`: Reino → Filo → ... → Especie | 3h | Frontend | Cada nivel es clickeable para ver info de esa taxonomía (linkea a ficha futura) |
| 4.7 | Integrar `AiResultPanel` en `NewSightingModal` flujo post-IA | 2h | Frontend | Al usar IA, resultados se muestran antes de submit. Usuario puede elegir candidato o escribir manual |
| 4.8 | Guardar `ai_confidence` + `ai_alternatives` en sighting al submit | 1h | Frontend | Pasar datos del panel al payload de create |
| 4.9 | Tests: respuestas Gemini malformadas, edge cases de confidence | 3h | QA | Mock de respuestas inválidas, verificar que no crashea |
| 4.10 | Tests E2E: flujo cámara → IA → elegir candidato → submit | 4h | QA | Playwright simula todo el flujo |

**Total Milestone 4:** ~28h (~4 días efectivos)

**Entregable:** IA devuelve ranking probabilístico con taxonomía. UI adapta cantidad de alternativas según confianza.

---

### Milestone 5 — Fichas Wikipedia + Validación (Func 3) — Semanas 5-6
**Prioridad:** Media. Depende de Func 2 (tracking). MVP de validación es "likes/upvotes" sin gatekeeper.

#### 5.1 Schema — Migración `009_species_sheets.js`

```javascript
// Nueva colección: species_sheets
{
  species_name:   string   (unique, required),
  taxonomy:       json     (required),
  content:        json     // { description, toxicity, habitat, uses, notes }
  status:         select ["draft", "published", "disputed"] (default: "draft"),
  version:        number   (default: 1),
  last_proposed_by: relation → users,
  last_proposed_at: datetime,
  created:        datetime (auto),
  updated:        datetime (auto)
}

// Nueva colección: sheet_votes  (antes sheet_edits, renombrado a "votes/likes")
{
  sheet:        relation → species_sheets (required),
  user:         relation → users (required),
  vote_type:    select ["upvote", "downvote", "propose_edit"],
  // para propose_edit:
  proposed_field: string?,   // ej: "toxicity"
  old_value:    string?,
  new_value:    string?,
  status:       select ["pending", "merged", "rejected"] (default: "pending"),
  created:      datetime (auto)
}
// Unique: sheet + user + vote_type (1 voto por usuario por acción)
```

| # | Tarea | Esfuerzo | Stack | Criterio de aceptación |
|---|---|---|---|---|
| 5.1 | Migración `009_species_sheets.js` + `sheet_votes` | 3h | Backend | Colecciones creadas, indexes para queries por species y por user |
| 5.2 | Hook `onRecordCreate` sheet_votes: recalcular score de ficha | 3h | Backend | Campo virtual/calculado: `score = upvotes - downvotes` (o guardado en species_sheets) |
| 5.3 | Hook `onRecordCreate` sheet_votes (type=propose_edit): marcar ficha como `disputed` | 2h | Backend | Si hay ediciones pendientes, status cambia a `disputed` |
| 5.4 | ~~Seed inicial: importar datos GBIF de especies comestibles AR a `species_sheets`~~ | ~~4h~~ | ~~Backend~~ | ~~Script one-off que popula ~50-100 especies con taxonomy desde GBIF~~ |
| 5.4 | **No aplica.** Usuario nutre `species_sheets` manualmente. Saltear. | — | — | — |
| 5.5 | Componente `SpeciesSheetView`: visor de ficha estilo Wikipedia | 6h | Frontend | Secciones colapsables, taxonomía, imágenes placeholder |
| 5.6 | Componente `SheetEditor`: proponer edición de campo específico | 4h | Frontend | Inline edit: usuario clickea "editar" en una sección, escribe nuevo valor, submit |
| 5.7 | Componente `SheetVotes`: upvote/downvote + contador | 3h | Frontend | Botones thumbs, contador animado, estado ya-votado |
| 5.8 | Componente `PendingEditsQueue`: lista de ediciones propuestas | 4h | Frontend | Solo visible para admin o usuarios con muchos registros (futuro). Por ahora: panel público de "propuestas recientes" |
| 5.9 | Integrar `SpeciesSheetView` en `SightingDetail.tsx` (link desde sighting) | 2h | Frontend | Clickear nombre del hongo abre su ficha |
| 5.10 | Integrar `SpeciesSheetView` en `AiResultPanel` (link desde candidato IA) | 2h | Frontend | Cada candidato del ranking tiene "Ver ficha" |
| 5.11 | Tests: votación concurrente, ediciones duplicadas | 3h | QA | Verificar que unique constraint funciona, no hay doble voto |

**Total Milestone 5:** ~32h (~4-5 días efectivos)

**Entregable:** Fichas de especies con contenido base, sistema de upvote/downvote, propuesta de ediciones pendientes, links desde sightings y resultados IA.

---

## 3. Timeline Consolidada (Modo Agentico)

```
Batch 0: Preparación                        ██ 6h
Batch 1: Milestone 1 (Cámara directa)       ████████████████████ 21h
Batch 2: Milestone 2 (Tracking + Badges)    ████████████████████████████████ 32h
Batch 3: Milestone 3 (Control IA)           █████████████████ 17h
Batch 4: Milestone 4 (IA Probabilística)   ██████████████████████████ 28h
Batch 5: Milestone 5 (Fichas Wikipedia)     ██████████████████████████████ 32h

Esfuerzo total estimado: ~136h de trabajo agentico
Cuello de botella real: validación humana + testing en dispositivo
```

**Ejecución agentica:**
- Los batches se ejecutan secuencialmente según dependencias técnicas.
- Entre batch y batch: pausa para que el usuario pruebe en su dispositivo (especialmente cámara nativa iOS/Android).
- No hay "semanas de calendario" predeterminadas. La velocidad depende de la retroalimentación del usuario.

---

## 4. Schema Consolidado — Migraciones

### Orden de aplicación
1. `005_user_stats.js` (Func 2)
2. `006_first_sighting_log.js` (Func 2)
3. `007_ai_access.js` (Func 4)
4. `008_ai_alternatives.js` (Func 1)
5. `009_species_sheets.js` (Func 3)

### Resumen de cambios por colección

| Colección | Campos nuevos | Colecciones nuevas | Hooks modificados |
|---|---|---|---|
| `users` | `sightings_total`, `sightings_first_global`, `sightings_first_local`, `sightings_streak_current`, `sightings_streak_max`, `last_sighting_at`, `badges`, `ai_access`, `ai_calls_total`, `ai_credits_remaining` | — | — |
| `sightings` | `ai_confidence`, `ai_alternatives` (json) | — | `onRecordCreate` (tracking, first detection, streaks) |
| `rate_limits` | `period_start` (datetime) | — | Lógica de ventana deslizante |
| — | — | `first_sightings_log` | `onRecordCreate` sighting |
| — | — | `species_sheets` | — |
| — | — | `sheet_votes` | `onRecordCreate` (recalcular score) |

---

## 5. Hooks de Backend — Detalle

### Hook: `onRecordCreate` sightings (modificado)

**Ubicación:** `pb_hooks/main.js` (o módulo separado `pb_hooks/sighting_hooks.js`)

**Flujo:**
```
1. Crear sighting (payload base)
2. Si _ai_recognize flag → llamar Gemini (verifica rate limit + ai_access primero)
3. Incrementar users.sightings_total
4. Detectar first_global:
   a. Query first_sightings_log WHERE species = ? AND type = "global" AND user != current
   b. Si no existe → insertar first_sightings_log, incrementar users.sightings_first_global, agregar badge
5. Detectar first_local:
   a. Query sightings WHERE species = ? AND user != current AND haversine(lat,lng) < 50km
   b. Si no existe → insertar first_sightings_log, incrementar users.sightings_first_local, agregar badge
6. Actualizar racha:
   a. Si last_sighting_at es null o >24h atrás → streak_current = 1
   b. Si last_sighting_at es entre 24h-48h atrás → streak_current += 1
   c. Si streak_current > streak_max → streak_max = streak_current
   d. Update users.last_sighting_at = now()
7. Si todo OK → retornar sighting creado
```

**Notas de implementación:**
- Usar transactions de PocketBase si es posible (PB v0.22+ tiene soporte básico)
- Si no hay transactions, hacer operaciones en orden idempotente (si falla el badge, no importa, se puede recalcular)
- Haversine: implementar en JS hook o usar extensión SQLite (más rápido)

### Hook: `POST /api/custom/identify` (modificado)

**Flujo:**
```
1. Auth check → obtener userId
2. Check users.ai_access != "disabled" → 403 si no
3. Check rate_limits ventana deslizante 1h < 20 → 429 si excede
4. Call Gemini Vision API con prompt estructurado (JSON mode)
5. Parse response, validar schema
6. Incrementar users.ai_calls_total
7. Insertar/actualizar rate_limits
8. Retornar { top_candidate, alternatives, warning? }
```

### Hook: `onRecordCreate` sheet_votes

**Flujo:**
```
1. Validar unique constraint (sheet + user + vote_type)
2. Si vote_type = "propose_edit":
   a. Validar que proposed_field existe en schema
   b. Cambiar species_sheets.status = "disputed"
3. Recalcular species_sheets.score = (count upvote) - (count downvote)
4. Si vote_type = "upvote" en una propose_edit existente → evaluar merge automático (futuro, por ahora solo contabilizar)
```

---

## 6. API Contracts (Interfaces TypeScript)

### AiIdentificationResult
```typescript
interface AiIdentificationResult {
  top_candidate: {
    name: string;
    confidence: number; // 0.0 - 1.0
    taxonomy: TaxonomyNode;
  };
  alternatives: Array<{
    name: string;
    confidence: number;
    taxonomy: TaxonomyNode;
  }>;
  warning?: "low_confidence" | "multiple_species" | "poor_image";
}

interface TaxonomyNode {
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  genus: string;
  species: string;
}
```

### UserStats (extensión de User)
```typescript
interface UserStats {
  sightings_total: number;
  sightings_first_global: number;
  sightings_first_local: number;
  sightings_streak_current: number;
  sightings_streak_max: number;
  last_sighting_at: string | null; // ISO datetime
  badges: string[]; // ["first_global:amanita_muscaria", "first_local:50km:boletus_edulis"]
  ai_access: "disabled" | "enabled_free" | "enabled_beta" | "enabled_paid";
  ai_calls_total: number;
  ai_credits_remaining: number | null;
}
```

### LeaderboardEntry
```typescript
interface LeaderboardEntry {
  rank: number;
  user: {
    id: string;
    name: string;
    avatar: string;
  };
  score: number; // sightings_first_local en la región
  badges_count: number;
}

// GET /api/custom/leaderboard?lat=-34.6&lng=-58.4&radius_km=50
interface LeaderboardResponse {
  region: { lat: number; lng: number; radius_km: number };
  entries: LeaderboardEntry[]; // max 10
  user_rank?: number; // posición del usuario actual si está fuera del top 10
}
```

### SpeciesSheet
```typescript
interface SpeciesSheet {
  id: string;
  species_name: string;
  taxonomy: TaxonomyNode;
  content: {
    description: string;
    toxicity: string;
    habitat: string;
    uses: string;
    notes: string;
  };
  status: "draft" | "published" | "disputed";
  version: number;
  score: number; // upvotes - downvotes
  last_proposed_by?: string;
  last_proposed_at?: string;
}

interface SheetVote {
  id: string;
  sheet: string;
  user: string;
  vote_type: "upvote" | "downvote" | "propose_edit";
  proposed_field?: string;
  old_value?: string;
  new_value?: string;
  status: "pending" | "merged" | "rejected";
  created: string;
}
```

---

## 7. Componentes Frontend — Árbol de dependencias

```
MapView.tsx
├── CaptureButton (nuevo)
│   ├── input[type=file capture=environment]
│   └── ActionSheet (Cámara / Galería)
├── UserLocationMarker
└── SightingMarkers

NewSightingModal.tsx (modificado)
├── ImagePreview (acepta prefillImage)
├── AiResultPanel (nuevo)
│   ├── TaxonomyBreadcrumb (nuevo)
│   ├── ConfidenceBadge
│   └── AlternativeList
├── SightingForm (useSightingForm modificado)
└── SubmitButton

SightingDetail.tsx (modificado)
├── WeatherBadge
├── ChatPanel
└── SpeciesSheetLink (nuevo) → navega a SpeciesSheetView

Header.tsx (modificado)
├── LeaderboardPanel (nuevo) → slide-out panel
│   └── LeaderboardEntry[]
├── UserProfileButton
└── AdminButton

UserProfile.tsx (nuevo / existente)
├── UserBadges (nuevo)
│   └── BadgeCard[]
└── UserStats (nuevo)

SpeciesSheetView.tsx (nuevo)
├── TaxonomyBreadcrumb
├── SheetContent (secciones colapsables)
├── SheetVotes (nuevo)
│   ├── UpvoteButton
│   └── DownvoteButton
└── SheetEditor (nuevo)
    └── InlineFieldEditor

AdminPanel.tsx (modificado)
├── UserList (agregar columna ai_access)
├── AiAccessToggle (nuevo)
└── PendingEditsQueue (nuevo) → sheet_votes filtrado
```

---

## 8. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Gemini no respeta formato JSON en respuesta | Media | Alto | Parser defensivo con regex fallback + retry con prompt más estricto |
| Haversine en JS hook lento con muchos sightings | Media | Medio | Agregar índice espacial en SQLite (extensión R*Tree) o denormalizar geohash pre-calculado |
| PocketBase no soporta transactions complejas | Alta | Medio | Diseñar hooks idempotentes. Si falla badge, no es crítico. Recalcular batch si es necesario |
| iOS PWA no abre cámara con `<input capture>` | Baja | Alto | Testear en iOS Safari real. Fallback: instructivo manual si no funciona |
| Usuarios spamean registros para subir en leaderboard | Media | Medio | Rate limit de sightings por hora (ej: 10/h). Detección de patrones sospechosos en admin |
| Costo Gemini imprevisto si habilitamos a muchos usuarios | Media | Alto | Func 4 es barrera. Solo admin habilita. Monitoreo diario de `ai_calls_total` agregado |
| Schema JSON `ai_alternatives` crece sin límite | Baja | Medio | Validar en hook: máximo 5 alternativas. Clamps de confidence. No guardar campos vacíos |
| Ediciones en fichas generan conflictos (merge) | Baja | Medio | MVP: no merge automático. Solo propuesta + voto. Merge manual por admin. Sistema de versionado explícito en `species_sheets.version` |

---

## 9. Checklist de Aceptación por Milestone

### Milestone 1 — Cámara Directa
- [ ] Usuario toca "+" en mapa → elige "Cámara" → abre cámara nativa trasera
- [ ] Al tomar foto, se abre formulario con imagen precargada y GPS capturado
- [ ] Si cierra app antes de submit, al reabrir pregunta "¿Continuar draft?"
- [ ] Permiso denegado: muestra mensaje instructivo, no crashea
- [ ] Test Playwright pasa en Chrome desktop + mobile emulation

### Milestone 2 — Tracking
- [ ] Primer sighting de usuario A incrementa `sightings_total` a 1
- [ ] Segundo usuario B registra species X donde no existe en **30km** → badge `first_local`
- [ ] Tercer usuario C registra species X donde NO existe en toda la plataforma → badge `first_global`
- [ ] Leaderboard muestra top 10 usuarios por `first_local` en radio **30km** del usuario actual
- [ ] Streak: 3 días consecutivos con sightings → `streak_current=3`, `streak_max=3`
- [ ] Día 5 sin sighting → `streak_current=1` en próximo sighting

### Milestone 3 — Control IA
- [ ] Usuario nuevo (ai_access=disabled) ve botón IA grisado con mensaje informativo
- [ ] Admin cambia ai_access a enabled_free → usuario puede usar IA
- [ ] Usuario hace 20 identificaciones en 1h → la 21ª devuelve error "Límite alcanzado"
- [ ] Pasada 1h desde la 1ª identificación → puede hacer identificación nuevamente
- [ ] Contador en UI muestra "X/20 restantes" y cuenta regresiva

### Milestone 4 — IA Probabilística
- [ ] Foto de Amanita muscaria bien nítida → confidence >85%, muestra 1 alternativa
- [ ] Foto borrosa o poco característica → confidence <50%, muestra 5 alternativas + alerta
- [ ] Cada alternativa muestra breadcrumbs taxonómicos clickeables
- [ ] Al submit, sighting guarda `ai_confidence` y `ai_alternatives` en DB
- [ ] Respuesta Gemini malformada → fallback a mensaje genérico, no crashea app

### Milestone 5 — Fichas Wikipedia
- [ ] **Usuario nutre `species_sheets` manualmente.** No hay seed automático.
- [ ] Usuario ve ficha de "Amanita muscaria" con descripción, toxicidad, hábitat
- [ ] Usuario propone editar toxicidad → queda en pending, ficha pasa a `disputed`
- [ ] Otro usuario upvotea la propuesta → score aumenta, queda registrado
- [ ] Usuario no puede votar 2 veces (unique constraint)
- [ ] Ficha linkeable desde SightingDetail y desde AiResultPanel

---

## 10. Notas para el Desarrollador

### Convenciones de código
- **Migraciones PocketBase:** nombre `XXX_descripcion_snake.js`, timestamp Unix como prefijo
- **Hooks PB:** usar `$app.newRecord()` para instancias, no objetos planos
- **Frontend:** hooks nuevos en `src/hooks/`, componentes en `src/components/`, tipos en `src/types/`
- **Tests:** Vitest para lógica pura (hooks, utils), Playwright para flujos críticos (cámara, IA, submit)
- **JSON fields:** validar con Zod en frontend y backend (doble validación)

### Variables de entorno nuevas
| Variable | Usada en | Valor default |
|---|---|---|
| `VITE_FIRST_LOCAL_RADIUS_KM` | Frontend | 30 |
| `FIRST_LOCAL_RADIUS_KM` | Backend hook | 30 |
| `AI_RATE_LIMIT_PER_HOUR` | Backend hook | 20 |
| `AI_DEFAULT_ACCESS` | Backend hook | `"disabled"` |

### Scripts de utilidad (sugeridos)
- `scripts/recalc-user-stats.js` — one-off para backfill `sightings_total`, `first_*`, badges en usuarios existentes
- ~~`scripts/seed-species-sheets.js`~~ — **No aplica.** Usuario nutre la base manualmente.

---

## 11. Próximos pasos inmediatos

1. **Validar Milestone 0** (preparación): revisar si schema actual tiene campos conflictivos
2. **Confirmar radio de `first_local`**: **30km** ✓ confirmado
3. **Seed de especies**: **No aplica.** Usuario nutre la base manualmente. ✓ confirmado
4. **Aprobación de modo agentico**: Los batches se ejecutan secuencialmente. Pausa entre batches para testing en dispositivo real. No hay deadline de calendario.
5. **Generar issues/tickets**: una vez aprobado este plan, desglosar cada tarea # en tickets de GitHub/Notion

---

*Plan generado por Aletheia. No tocar código hasta aprobación explícita del usuario.*
