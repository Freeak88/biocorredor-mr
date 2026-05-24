# Sistema de Reconocimiento Micológico con IA
## Especificación de diseño — Fungimap / Funga Map

> **Estado:** borrador de arquitectura para implementación futura.
> **Fecha:** 2026-05-24
> **Modelo actual:** Gemini (Google) como fallback temporal.
> **Objetivo a mediano plazo:** modelo propio entrenado en dataset de hongos sudamericanos.

---

## 1. Taxonomía de fallback (de específico a general)

| Nivel | Ejemplo | Uso en la app |
|---|---|---|
| **Especie** | *Amanita muscaria* | Ideal. Muestra nombre común + científico. |
| **Género** | *Amanita* sp. | Si no hay confianza a especie pero sí a género. |
| **Familia** | Amanitaceae | Solo para indicar grupo morfológico amplio. |
| **Orden** | Agaricales | Muy genérico, raramente útil para el usuario. |
| **Clase** | Agaricomycetes | Casi nunca mostrado al usuario. |
| **División** | Basidiomycota | Útil solo para distinguir Basidio vs Ascomycota. |
| **Reino** | Fungi | Fallback absoluto. “Es un hongo”. |

---

## 2. Score de seguridad (confianza de identificación)

### Escala propuesta: 0–100

| Rango | Label visual | Comportamiento |
|---|---|---|
| 90–100 | 🟢 **Alta** | Muestra especie + características distintivas. |
| 80–89 | 🟡 **Media-Alta** | Muestra especie con disclaimer: *"Posible identificación"*. |
| 60–79 | 🟠 **Media** | Muestra **lista de candidatas** (top N especies) + pide confirmación de experto. |
| 40–59 | 🔴 **Baja** | Baja a **género** + lista de candidatas de especies dentro de ese género. |
| 20–39 | ⚫ **Muy baja** | Baja a **familia/clase** + etiqueta *"Grupo morfológico: X"*. |
| 0–19 | ❓ **Desconocido / No identificable** | Ver sección 3. |

### Threshold inicial: **80%**
> El 80% es conservador para hongos (alta variabilidad intraespecie, especies cripticas). Se ajustará con datos reales de geofirmación.

---

## 3. Estados especiales (cuando la IA no llega a especie)

### 3.1 "Desconocido"
**Condiciones:**
- Foto de buena calidad (resolución suficiente, hongo completo, buena iluminación).
- La IA no encuentra match en su base de conocimiento.
- Score < 20% a cualquier nivel taxonómico.

**UX:**
> *"Este hongo no se encuentra en nuestra base de datos. ¿Sos experto? Ayudanos a identificarlo y sumarlo al atlas."*

**Acción:**
- Guarda la imagen en cola de "hallazgos sin identificar".
- Notifica a moderadores/expertos de la comunidad.
- Permite al usuario etiquetar manualmente (con verificación posterior).

### 3.2 "No identificable"
**Condiciones:**
- Foto de mala calidad (borrosa, muy oscura, hongo roto/incompleto).
- Hongo en estado de descomposición avanzada.
- Objeto que claramente no es un hongo (piedra, raíz, etc.).

**UX:**
> *"No podemos identificar este hallazgo. La imagen parece incompleta o de baja calidad. Probá sacar otra foto desde otro ángulo, incluyendo el pie, las láminas y el hábitat."*

**Acción:**
- No guarda en la base de especies.
- Ofrece tips de fotografía micológica (guía rápida).
- Permite reintentar con nueva foto.

---

## 4. Pipeline de decisión (diagrama de flujo)

```
Foto del usuario
       │
       ▼
[Validación de calidad de imagen]
       │
       ├─► Foto mala / incompleta ──► ❌ "No identificable" + tips
       │
       └─► Foto OK ──► [IA: extracción de features]
                            │
                            ▼
              [Score a nivel ESPECIE]
                            │
              ├─► ≥ 90% ──► 🟢 Especie confirmada
              │
              ├─► 80–89% ──► 🟡 Especie posible (con disclaimer)
              │
              ├─► 60–79% ──► 🟠 Lista de candidatas (top 3 especies)
              │
              ├─► 40–59% ──► [Fallback a GÉNERO]
              │                    │
              │                    ├─► Score género ≥ 70% ──► 🔴 "Amanita sp."
              │                    │
              │                    └─► Score género < 70% ──► [Fallback a FAMILIA]
              │                                                       │
              │                                                       ▼
              │                                                  [… y así sucesivamente …]
              │
              └─► < 40% a todos los niveles ──► ❓ "Desconocido" + cola de expertos
```

---

## 5. Datos que la IA debería devolver

```json
{
  "identification": {
    "level": "species | genus | family | order | class | division | kingdom | unknown | unidentifiable",
    "taxon": {
      "kingdom": "Fungi",
      "division": "Basidiomycota",
      "class": "Agaricomycetes",
      "order": "Agaricales",
      "family": "Amanitaceae",
      "genus": "Amanita",
      "species": "Amanita muscaria"
    },
    "confidence": 87,
    "confidence_level": "medium-high",
    "candidates": [
      { "taxon": "Amanita muscaria", "confidence": 87 },
      { "taxon": "Amanita persicina", "confidence": 8 },
      { "taxon": "Amanita gemmata", "confidence": 3 }
    ]
  },
  "quality_assessment": {
    "photo_quality": "good | fair | poor",
    "visible_features": ["cap", "gills", "stem", "ring", "volva", "habitat"],
    "missing_features": ["spore_print"]
  },
  "safety": {
    "toxicity": "deadly | poisonous | psychoactive | edible | unknown",
    "edibility_confidence": 65,
    "warnings": ["No consumir sin verificación de experto"]
  }
}
```

---

## 6. Entrenamiento de modelo propio (futuro)

### Dataset necesario
| Fuente | Estado |
|---|---|
| Observaciones de Fungimap (con geofirmación) | En construcción |
| iNaturalist (licencia CC) | Disponible vía API |
| GBIF (registros con imágenes) | Disponible |
| Dataset académico específico de hongos AR/UY/CL | A buscar/contactar |

### Arquitectura propuesta
- **Backbone:** EfficientNet-B0 o ConvNeXt-Tiny (ligero para mobile).
- **Head:** Clasificador jerárquico que predice simultáneamente:
  - Especie (softmax sobre ~2.000 especies comunes de Argentina).
  - Género (fallback automático si especie < threshold).
- **Training:** Fine-tuning con transfer learning desde ImageNet.
- **Infra:** ONNX Runtime para inferencia en el servidor (Python/FastAPI).

### Métricas de evaluación
- **Top-1 accuracy** a nivel especie (target: > 75% en hongos comunes).
- **Top-3 accuracy** (target: > 90%).
- **Precision/recall por género** (para detectar especies cripticas).

---

## 7. Integración con Gemini (solución actual)

Mientras no tenemos modelo propio, usamos Gemini con un **prompt estructurado**:

```
Actuá como micólogo experto. Analizá esta imagen de hongo y devolvé:

1. Taxonomía completa (reino, división, clase, orden, familia, género, especie).
2. Score de confianza (0–100) para la identificación.
3. Si el score < 80, listá las 3 especies más probables con sus scores.
4. Evaluá la calidad de la foto: ¿es suficiente para identificar? ¿qué partes del hongo se ven?
5. Toxicidad/edibilidad conocida (solo si hay alta confianza).
6. Si la foto es de muy baja calidad o no es un hongo, indicá "no_identificable".
7. Si la foto es buena pero no reconocés el hongo, indicá "desconocido".

Respondé ÚNICAMENTE en JSON con este schema: [schema arriba].
```

---

## 8. Próximos pasos

1. **Implementar el parser de respuesta Gemini** con el formato JSON estructurado.
2. **Agregar UI de confianza** (colores, disclaimers, lista de candidatas).
3. **Sistema de feedback del usuario** ("¿Esta identificación fue correcta?") para acumular ground truth.
4. **Investigar datasets** para entrenamiento de modelo propio.
5. **Definir métricas de éxito** y threshold de score con datos reales (A/B testing con geofirmadores).

---

*Documento vivo. Actualizar a medida que se implementen piezas.*
