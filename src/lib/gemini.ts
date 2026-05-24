import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export interface MushroomTaxonomy {
  kingdom?: string;
  division?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
}

export interface MushroomCandidate {
  taxon: string;
  confidence: number;
}

export interface QualityAssessment {
  photo_quality: 'good' | 'fair' | 'poor';
  visible_features: string[];
  missing_features: string[];
}

export interface MushroomIdentification {
  status: 'identified' | 'unknown' | 'unidentifiable';
  level: 'species' | 'genus' | 'family' | 'order' | 'class' | 'division' | 'kingdom';
  taxonomy: MushroomTaxonomy;
  displayName: string;
  confidence: number;
  confidenceLevel: 'high' | 'medium-high' | 'medium' | 'low' | 'very-low';
  candidates?: MushroomCandidate[];
  commonName?: string;
  toxicity?: string;
  description?: string;
  habitat?: string;
  features?: string;
  quality: QualityAssessment;
  warnings?: string[];
}

export async function identifyMushroomFromImage(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<MushroomIdentification> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'placeholder') {
    throw new Error('Gemini API key not configured');
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `Actuá como un experto micólogo de campo con 20 años de experiencia en hongos de Sudamérica.

Analizá esta imagen de un hongo y devolvé ÚNICAMENTE un JSON con este schema exacto:

{
  "status": "identified" | "unknown" | "unidentifiable",
  "level": "species" | "genus" | "family" | "order" | "class" | "division" | "kingdom",
  "taxonomy": {
    "kingdom": "Fungi" (o null si no aplica),
    "division": "Basidiomycota" | "Ascomycota" | etc (o null),
    "class": "Agaricomycetes" | etc (o null),
    "order": "Agaricales" | etc (o null),
    "family": "Amanitaceae" | etc (o null),
    "genus": "Amanita" | etc (o null),
    "species": "Amanita muscaria" | etc (o null)
  },
  "displayName": "nombre para mostrar al usuario (ej: 'Amanita muscaria' o 'Amanita sp.' o 'Familia Amanitaceae')",
  "confidence": 0-100,
  "candidates": [
    { "taxon": "nombre científico", "confidence": 87 },
    { "taxon": "nombre científico 2", "confidence": 8 }
  ],
  "commonName": "nombre común en español si existe",
  "toxicity": "Comestible" | "Tóxico" | "Mortal" | "Psicoactivo" | "Desconocido",
  "description": "descripción corta para cuaderno de campo",
  "habitat": "hábitat natural donde crece",
  "features": "características distintivas visibles",
  "quality": {
    "photo_quality": "good" | "fair" | "poor",
    "visible_features": ["cap", "gills", "stem", "ring", "volva", "habitat", etc],
    "missing_features": ["spore_print", "underside", etc]
  },
  "warnings": ["lista de advertencias si aplica"]
}

REGLAS ESTRICTAS:
1. Si la foto es de muy baja calidad (borrosa, muy oscura, hongo roto o incompleto, no se ve ninguna estructura micológica): status="unidentifiable", confidence=0, y explicá por qué en warnings.
2. Si la foto es buena pero el hongo no está en tu base de conocimiento o es muy raro/criptico: status="unknown", confidence<20, level="kingdom" o lo más alto que puedas.
3. Si confidence a especie < 80 pero confidence a género >= 70: devolvé level="genus" con displayName="X sp.".
4. Si confidence a especie < 80 y género < 70 pero familia >= 60: level="family".
5. Siempre devolvé al menos kingdom="Fungi" a menos que la foto claramente no sea un hongo.
6. NUNCA inventes nombres. Si no estás seguro, bajá de nivel taxonómico o poné "unknown".
7. Toxicidad: si no hay consenso científico claro, usá "Desconocido".
8. Candidates: ordenadas por confidence descendente. Máximo 5. Vacías si confidence > 90.
9. Respondé SOLO el JSON, sin markdown, sin explicaciones.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ["identified", "unknown", "unidentifiable"] },
            level: { type: Type.STRING, enum: ["species", "genus", "family", "order", "class", "division", "kingdom"] },
            taxonomy: {
              type: Type.OBJECT,
              properties: {
                kingdom: { type: Type.STRING, nullable: true },
                division: { type: Type.STRING, nullable: true },
                class: { type: Type.STRING, nullable: true },
                order: { type: Type.STRING, nullable: true },
                family: { type: Type.STRING, nullable: true },
                genus: { type: Type.STRING, nullable: true },
                species: { type: Type.STRING, nullable: true }
              }
            },
            displayName: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            candidates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  taxon: { type: Type.STRING },
                  confidence: { type: Type.NUMBER }
                }
              }
            },
            commonName: { type: Type.STRING, nullable: true },
            toxicity: { type: Type.STRING, enum: ["Comestible", "Tóxico", "Mortal", "Psicoactivo", "Desconocido"] },
            description: { type: Type.STRING },
            habitat: { type: Type.STRING },
            features: { type: Type.STRING },
            quality: {
              type: Type.OBJECT,
              properties: {
                photo_quality: { type: Type.STRING, enum: ["good", "fair", "poor"] },
                visible_features: { type: Type.ARRAY, items: { type: Type.STRING } },
                missing_features: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["status", "level", "taxonomy", "displayName", "confidence", "quality"]
        }
      }
    });

    const raw = JSON.parse(response.text || '{}');
    return normalizeIdentification(raw);

  } catch (error) {
    console.error("Gemini Vision Error:", error);
    throw error;
  }
}

function normalizeIdentification(raw: any): MushroomIdentification {
  const confidence = Math.max(0, Math.min(100, Math.round(raw.confidence || 0)));

  let confidenceLevel: MushroomIdentification['confidenceLevel'];
  if (confidence >= 90) confidenceLevel = 'high';
  else if (confidence >= 80) confidenceLevel = 'medium-high';
  else if (confidence >= 60) confidenceLevel = 'medium';
  else if (confidence >= 40) confidenceLevel = 'low';
  else confidenceLevel = 'very-low';

  const candidates = (raw.candidates || [])
    .filter((c: any) => c.taxon && typeof c.confidence === 'number')
    .map((c: any) => ({ taxon: c.taxon, confidence: Math.round(c.confidence) }))
    .sort((a: any, b: any) => b.confidence - a.confidence)
    .slice(0, 5);

  return {
    status: raw.status || 'unknown',
    level: raw.level || 'kingdom',
    taxonomy: {
      kingdom: raw.taxonomy?.kingdom || undefined,
      division: raw.taxonomy?.division || undefined,
      class: raw.taxonomy?.class || undefined,
      order: raw.taxonomy?.order || undefined,
      family: raw.taxonomy?.family || undefined,
      genus: raw.taxonomy?.genus || undefined,
      species: raw.taxonomy?.species || undefined,
    },
    displayName: raw.displayName || raw.taxonomy?.species || raw.taxonomy?.genus + ' sp.' || 'Fungi',
    confidence,
    confidenceLevel,
    candidates: candidates.length > 0 ? candidates : undefined,
    commonName: raw.commonName || undefined,
    toxicity: raw.toxicity || 'Desconocido',
    description: raw.description || '',
    habitat: raw.habitat || '',
    features: raw.features || '',
    quality: {
      photo_quality: raw.quality?.photo_quality || 'fair',
      visible_features: raw.quality?.visible_features || [],
      missing_features: raw.quality?.missing_features || [],
    },
    warnings: raw.warnings || [],
  };
}
