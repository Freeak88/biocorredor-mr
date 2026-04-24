import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function identifyMushroomFromImage(base64Image: string, mimeType: string = 'image/jpeg') {
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
