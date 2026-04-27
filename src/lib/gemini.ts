import { GoogleGenAI, Type } from "@google/genai";

// NOTE: This client-side Gemini call should eventually migrate to a PocketBase
// custom endpoint (e.g. /api/collections/sightings/actions/gemini) to keep the
// API key server-side. Until then, VITE_GEMINI_API_KEY must be set in .env.

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export async function identifyMushroomFromImage(base64Image: string, mimeType: string = 'image/jpeg') {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'placeholder') {
    throw new Error('Gemini API key not configured');
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  try {
    const prompt = `Actúa como un experto micólogo de campo. Analiza esta imagen de un hongo y proporciona una identificación técnica precisa. 
    Debes identificar el nombre científico, nombre común probable, nivel de toxicidad, descripción, hábitat natural y características distintivas para el cuaderno de campo.`;

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
            scientificName: { type: Type.STRING },
            commonName: { type: Type.STRING },
            toxicity: { 
              type: Type.STRING,
              enum: ["Comestible", "Tóxico", "Mortal", "Desconocido"]
            },
            description: { type: Type.STRING },
            habitat: { type: Type.STRING },
            features: { type: Type.STRING }
          },
          required: ["scientificName", "commonName", "toxicity", "description", "habitat", "features"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return result;
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    throw error;
  }
}
