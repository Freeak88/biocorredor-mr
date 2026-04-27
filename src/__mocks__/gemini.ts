import { vi } from 'vitest';

export const mockGeminiResponse = {
  scientificName: 'Amanita muscaria',
  commonName: 'Amanita matamoscas',
  toxicity: 'Tóxico',
  description: 'Hongo de color rojo brillante con puntos blancos, común en bosques de coníferas.',
  habitat: 'Bosques de coníferas y caducifolios',
  features: 'Sombrero rojo con escamas blancas, pie blanco con anillo',
};

export const mockGeminiError = new Error('Gemini API rate limit exceeded');

vi.mock('../lib/gemini', async () => {
  return {
    identifyMushroomFromImage: vi.fn((base64Image: string, mimeType?: string) => {
      if (!base64Image || base64Image.length < 10) {
        return Promise.reject(new Error('Invalid image data'));
      }
      return Promise.resolve(mockGeminiResponse);
    }),
  };
});

export function resetGeminiMocks() {
  const { identifyMushroomFromImage } = vi.mocked(await import('../lib/gemini'));
  identifyMushroomFromImage.mockClear();
}
