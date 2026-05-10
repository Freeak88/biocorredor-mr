# Fungimap — Plan de Funcionalidades (Draft)

> **Scope:** Planificación conceptual. Sin código.  
> **Fecha:** 2026-05-10  
> **Contexto base:** BLUEPRINT.md existente (PocketBase, Gemini Vision API, rate limiting 20 req/h, colección `users` con `role`/`points`, `sightings` con taxonomía GBIF).

---

## Funcionalidad 1: IA con "Rate de Precisión" + Taxonomía + Alternativas

### Core Concept
La IA no devuelve un único nombre. Devuelve un **ranking probabilístico** estructurado taxonómicamente. La UI presenta más o menos alternativas según la confianza del top-1.

### Componentes Conceptuales

#### 1.1 Salida de la IA (estructura de respuesta)
En lugar de:
```
"Amanita muscaria"
```
La respuesta ideal:
```
Top-1: Amanita muscaria — Confianza 87%
Alternativas taxonómicas:
  - Familia: Amanitaceae (confianza agregada 94%)
  - Género: Amanita (confianza agregada 91%)
  - Especie 2: Amanita pantherina (confianza 34%)
  - Especie 3: Amanita caesarea (confianza 12%)
```

**Nota técnica:** Gemini Vision API (multimodal) puede devolver probabilidades si se le pide explícitamente en el prompt. Pero no garantiza scores calibrados. Alternativa: usar la API para generar una lista de candidatos y luego rankear con un modelo secundario o heurísticas de contexto geográfico/temporal.

#### 1.2 Lógica de presentación (cliente)
| Confianza Top-1 | Comportamiento UI |
|---|---|
| > 85% | Muestra top-1 + 1 alternativa del mismo género + breadcrumbs taxonómicos |
| 50-85% | Muestra top-3 especies + breadcrumbs taxonómicos completos |
| < 50% | Muestra top-5 especies + alerta "Baja confianza, consultá experto" + breadcrumbs taxonómicos |

#### 1.3 Estructura taxonómica obligatoria
Cada candidato debe navegarse por:
- Reino → Filo → Clase → Orden → Familia → Género → Especie

Esto permite al usuario "subir" en la taxonomía si no confía en la especie exacta.

#### 1.4 Edge cases a definir
- ¿Qué pasa si la IA devuelve un género correcto pero especie incorrecta? ¿Es "acierto parcial"?
- ¿Se guarda en la base la confianza de la IA para ese sighting? (Sí, recomendado: campo `ai_confidence` + JSON de `ai_alternatives`)
- ¿Se usa la confianza para alertar al usuario sobre toxicidad? (Ej: si confianza < 70% y el top-1 es tóxico, mostrar disclaimer más fuerte)

### Dependencias
- Requiere cambiar el prompt de Gemini (backend hook)
- Requiere modificar el schema de `sightings` para guardar alternativas
- Requiere componente UI nuevo para mostrar árbol taxonómico

---

## Funcionalidad 2: Sesiones Naturales + Tracking de "Primeros"

### Core Concept
El usuario no "inicia una sesión" explícitamente. Entra, registra hongos. El sistema trackea:
1. Cuántos hongos registró en total
2. Cuántos de esos nunca habían sido registrados por nadie en la plataforma

Esto alimenta la reputación/gamificación sin fricción.

### Componentes Conceptuales

#### 2.1 Métricas por usuario (nuevos campos en `users`)
- `sightings_total`: total de registros del usuario (ya existe `points`, pero no se sabe si es esto)
- `sightings_first`: cuántos registros suyos fueron "primera vez en la plataforma"
- `sightings_streak_current`: racha actual de días con al menos 1 registro
- `sightings_streak_max`: racha máxima histórica

#### 2.2 Lógica de "primero en la plataforma"
Al crear un `sighting`, el backend debe chequear:
```
¿Existe otro sighting con:
  - misma especie (o género, definir)
  - distinto usuario
  - en un radio de X km? (opcional, para "primero local" vs "primero global")
```

Variantes a definir:
- **Primero global**: primera vez que esa especie aparece en Fungimap (sin importar ubicación)
- **Primero local**: primera vez en un radio de, ej, 50km (más útil para comunidad)

#### 2.3 Gamificación ligera
- Badge/insignia por cada "primero"
- Notificación in-app: "¡Descubriste un [Coprinus comatus] que nadie había registrado!"
- Leaderboard opcional de "descubridores" (sin presionar, para no generar spam)

### Dependencias
- Requiere migración de schema en `users`
- Requiere hook `onRecordCreate` en `sightings` para contar "primeros"
- Requiere definir si "primero" es por especie exacta o por taxonomía más alta (¿un género nuevo cuenta?)

---

## Funcionalidad 3: Validación de Fichas (Wikipedia-style)

### Core Concept
Cada especie tiene una **ficha técnica** con datos: descripción, toxicidad, habitat, usos, imágenes de referencia. Cualquier usuario puede proponer ediciones. Las ediciones se aplican solo si un usuario con suficiente reputación las **valida**.

### Componentes Conceptuales

#### 3.1 Nueva colección: `species_sheets`
Campos conceptuales:
- `species_name` (unique)
- `taxonomy` (JSON: reino, filo, clase, orden, familia, género, especie)
- `content` (JSON estructurado: descripción, toxicidad, habitat, usos, notas)
- `status`: `draft` | `published` | `disputed`
- `last_validated_by` (relation → users)
- `last_validated_at`
- `validation_count`: cuántas validaciones tiene

#### 3.2 Nueva colección: `sheet_edits`
- `sheet` (relation → species_sheets)
- `proposed_by` (relation → users)
- `field`: qué campo se editó (ej: "toxicidad")
- `old_value` / `new_value`
- `status`: `pending` | `approved` | `rejected`
- `reviewed_by` (relation → users)

#### 3.3 Regla de validación
Un usuario puede validar (aprobar/rechazar) ediciones solo si:
```
users.sightings_total >= MIN_SIGHTINGS_FOR_VALIDATOR
// sugerencia: 10 registros
```

O alternativa más sofisticada:
```
users.sightings_first >= MIN_FIRST_SIGHTINGS_FOR_VALIDATOR
// sugerencia: 3 "primeros"
```

#### 3.4 Flujo de validación
1. Usuario A propone editar "toxicidad" de Amanita muscaria
2. Edit queda en `pending`
3. Usuario B (con >=10 registros) ve el pending en una "cola de revisión"
4. Usuario B aprueba → campo se actualiza, edit pasa a `approved`
5. Si Usuario B rechaza → edit pasa a `rejected`, se notifica a A

#### 3.5 Edge cases
- ¿Qué pasa si dos usuarios proponen editar el mismo campo simultáneamente?
- ¿Se necesita un "super-validador" (admin) para disputas?
- ¿Se versiona el historial completo de una ficha? (Sí, recomendado)

### Dependencias
- Depende de la Funcionalidad 2 (necesitamos el conteo de registros por usuario)
- Requiere dos nuevas colecciones en PocketBase
- Requiere UI nueva: visor de fichas, editor de campos, cola de validación

---

## Funcionalidad 4: IA Deshabilitada por Defecto + Control por Usuario

### Core Concept
La identificación con IA consume tokens ($). Actualmente está habilitada para todos (20 req/h). Se propone:
- **Default:** IA identificación deshabilitada para todos los usuarios nuevos
- **Habilitación selectiva:** por rol, por cantidad de registros, o manual por admin
- **Preparar arquitectura** para monetización posterior (créditos, suscripción)

### Componentes Conceptuales

#### 4.1 Estados de acceso a IA por usuario
Nuevo campo en `users`:
- `ai_access`: `disabled` | `enabled_free` | `enabled_paid` | `enabled_beta`

#### 4.2 Lógica de habilitación
| Estado | Cómo se obtiene |
|---|---|
| `disabled` | Default para usuarios nuevos |
| `enabled_free` | Otorgado por admin, o automático tras X registros validados |
| `enabled_beta` | Para testers elegidos manualmente |
| `enabled_paid` | (Futuro) tras comprar créditos o suscripción |

#### 4.3 Control de consumo (existente + extendido)
Ya existe `rate_limits` con 20 req/h. Extender a:
- `ai_calls_total`: contador histórico de usos de IA por usuario
- `ai_credits_remaining`: (futuro) saldo de créditos

#### 4.4 UI/UX
- Botón "Identificar con IA" en el formulario de sighting:
  - Si `disabled`: muestra "Identificación con IA no disponible. [Saber más]" (link a cómo habilitar)
  - Si `enabled_free`: funciona normal, con contador de usos restantes del rate limit
  - Si `enabled_paid`: funciona, mostrando créditos restantes

#### 4.5 Preparación para monetización (sin implementar ahora)
Estructura a dejar lista:
- Campo `ai_credits_remaining` en users (inicialmente null o high para free)
- Hook de backend que descuente créditos en lugar de solo rate-limit por tiempo
- Tabla `credit_transactions` (futuro): historial de compras/uso

### Dependencias
- Depende de la Funcionalidad 2 (para habilitar IA automáticamente tras X registros)
- Requiere modificar hook de IA actual para chequear `users.ai_access`
- Requiere modificar UI del formulario para estados deshabilitados

---

## Funcionalidad 5: Cámara Directa desde el Mapa (UX de Campo)

### Core Concept
Actualmente el flujo para registrar un hongo es: tomar foto con app de cámara → ir a galería → volver a Fungimap → subir desde galería. Esto es fricción innecesaria en campo.

**Objetivo:** Desde el mapa, un botón flotante o acción rápida abre la cámara nativa del dispositivo, toma la foto, y la lleva directamente al formulario de `NewSightingModal` con la imagen ya cargada.

### Componentes Conceptuales

#### 5.1 Trigger desde el mapa
- Botón flotante "+" en `MapView.tsx` (ya existe probablemente para agregar sighting)
- Al tocar: modal o bottom-sheet con dos opciones:
  - 📷 **Cámara** — abre cámara nativa
  - 🖼️ **Galería** — picker de archivos existente
- Opción por defecto configurable en settings del usuario

#### 5.2 API de cámara nativa (PWA)
Mediante `navigator.mediaDevices.getUserMedia()` o `<input type="file" accept="image/*" capture="environment">`:
- `capture="environment"` → cámara trasera por defecto
- `capture="user"` → cámara frontal (no relevante para hongos)
- En iOS Safari y Android Chrome funciona nativamente abriendo la cámara del SO

#### 5.3 Flujo post-captura
```
Usuario toca "+" en mapa
  → Elige "Cámara"
    → Dispositivo abre cámara nativa
    → Usuario saca foto
    → Foto vuelve a Fungimap como File object
    → Se abre NewSightingModal con:
        - Imagen ya en preview
        - Geolocalización actual precargada
        - Campo "Fecha/hora" = now()
    → Usuario completa nombre/descripción o usa IA
    → Submit
```

#### 5.4 Consideraciones técnicas
- **Permisos:** La primera vez el navegador pide permiso de cámara. Hay que manejar el caso de "denegado" con mensaje amigable.
- **PWA / iOS:** En iOS PWA, `getUserMedia()` tiene limitaciones. El approach de `<input capture>` es más confiable cross-platform.
- **Offline:** Si el usuario está sin internet en el bosque, la foto debe guardarse localmente y subirse cuando haya conexión (ya existe offline queue parcialmente).
- **GPS:** Al abrir desde el mapa, la geolocalización debe capturarse en el momento del disparo, no del submit posterior (el usuario puede moverse mientras completa el formulario).

#### 5.5 Edge cases
- ¿Qué pasa si el usuario sale de la cámara sin tomar foto? → Volver al mapa, sin acción
- ¿Qué pasa si toma foto pero cierra la app antes de completar el formulario? → Draft guardado en localStorage/offline queue
- ¿Múltiples fotos rápidas? → Permitir burst: tomar 3-5 fotas seguidas y luego completar una ficha por cada una (o una ficha con múltiples imágenes)

### Dependencias
- Requiere que `NewSightingModal` acepte una imagen precargada como prop
- Requiere que el hook `useSightingForm` maneje inicialización con imagen existente
- Requiere manejo de permisos de cámara en el PWA
- **No depende** de las otras funcionalidades del plan, puede implementarse en paralelo

### Prioridad
🔥 **Alta** — mejora drásticamente el UX de campo, reduce fricción de registro, y es implementable rápido (principalmente frontend).

---

## Matriz de Dependencias Cruzadas

```
Func 5 (Cámara directa)
        │
        └─→ No depende de nadie. Puede implementarse en paralelo a todo.
              Alta prioridad por impacto UX.

Func 2 (Tracking de registros)
        │
        ├─→ Func 3 (Validación: requiere N registros para validar)
        │
        └─→ Func 4 (Habilitación IA: requiere N registros para unlock)

Func 1 (IA probabilística)
        │
        └─→ Func 4 (Control de IA: la Func 1 consume tokens,
                     por eso la Func 4 es más urgente si Func 1 se mejora)
```

**Orden sugerido de implementación:**
1. **Func 5 (Cámara directa)** — 🔥 máxima prioridad, UX de campo, no depende de otras
2. **Func 2 (tracking)** — base para todo lo demás
3. **Func 4 (control de IA)** — protege costos
4. **Func 1 (IA mejorada)** — consume tokens, ya protegido por Func 4
5. **Func 3 (fichas)** — depende de Func 2, menos crítico para MVP

---

### Decisiones Resueltas (última actualización: 2026-05-10)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | **Radio `first_local`** | **30km** |
| 2 | **Seed inicial de fichas** | **Ya existe.** Usuario nutriendo base manualmente. Quitar script `seed-species-sheets.js` del plan. |
| 3 | **Grace period usuarios existentes** | **Ninguno.** Todos los usuarios existentes pasan a `ai_access=disabled`. Solo admin (Damián) habilita manualmente caso por caso. |
| 4 | **Timeline / modo de ejecución** | **Desarrollo agentico.** No es tiempo de "equipo humano". Los milestones se ejecutan en batches según dependencias técnicas, no según días de calendario. El cuello de botella es validación del usuario + testing en dispositivos reales. |

### Nota: Rate Limit (contexto)
Rate limit = límite de requests por unidad de tiempo. Actualmente Fungimap tiene un rate limit de **20 requests/hora por usuario** para la identificación con IA (Gemini Vision API). Esto existe para:
- Controlar costos de tokens de Google
- Evitar abuso / spam de la IA
- No saturar la API

El rate limit actual se maneja en la colección `rate_limits` de PocketBase. Si el usuario supera 20 identificaciones en una hora, la API responde con error hasta que pase el tiempo.

**Pregunta para vos:** ¿Mantener 20/h para usuarios con `enabled_free`? ¿Reducir? ¿O dejarlo como está y solo preocuparnos cuando llegue el monetizado?

---

## Decisiones Pendientes (requieren tu input)

### Func 1
- [ ] ¿Gemini devuelve scores confiables o usamos heurísticas post-proceso?
- [ ] ¿"Alternativas" son siempre del mismo género/familia, o pueden saltar taxonomías?
- [ ] ¿Se guarda la confianza de IA en el sighting permanentemente?

### Func 2
- [ ] ¿"Primero" es global o por radio geográfico (o ambos)?
- [ ] ¿Gamificación visible (leaderboard) o privada (solo badges personales)?
- [ ] ¿Se premia más un "primero" de especie rara vs común?

### Func 3
- [ ] ¿MIN_SIGHTINGS_FOR_VALIDATOR = 10? ¿Otro número?
- [ ] ¿Una validación alcanza o requiere N validadores independientes?
- [ ] ¿Los admin pueden editar sin validación?

### Func 4
- [ ] ¿Unlock automático tras X registros o solo manual por admin?
- [ ] ¿X = cuántos registros para unlock?
- [ ] ¿Rate limit actual (20/h) se mantiene para free, o se reduce?

---

## Próximo Paso Propuesto

> Una vez definidas las decisiones de arriba, generar un **plan técnico de implementación** (migraciones de schema, hooks de backend, componentes frontend, orden de PRs).

¿Querés que:
1. **Resolvamos las decisiones pendientes** ahora (iterar sobre cada una)
2. **Vaya directo al plan técnico** asumiendo defaults razonables
3. **Agregue otra funcionalidad** a la lista
