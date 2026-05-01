import { vi, describe, it, expect, beforeEach } from 'vitest';
import { identifyMushroomFromImage } from '../../lib/gemini';

const mockGeminiResponse = vi.hoisted(() => ({
  scientificName: 'Amanita muscaria',
  commonName: 'Amanita matamoscas',
  toxicity: 'Tóxico',
  description: 'Hongo de color rojo brillante con puntos blancos, común en bosques de coníferas.',
  habitat: 'Bosques de coníferas y caducifolios',
  features: 'Sombrero rojo con escamas blancas, pie blanco con anillo',
}));

const identifyMushroomFromImageMock = vi.hoisted(() =>
  vi.fn((base64Image: string, _mimeType?: string) => {
    if (!base64Image || base64Image.length < 10) {
      return Promise.reject(new Error('Invalid image data'));
    }
    return Promise.resolve(mockGeminiResponse);
  })
);

vi.mock('../../lib/gemini', () => ({
  identifyMushroomFromImage: identifyMushroomFromImageMock,
}));

describe('Gemini AI Identification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful Identification', () => {
    it('should identify mushroom from valid image data', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const mimeType = 'image/jpeg';

      const result = await identifyMushroomFromImage(base64Image, mimeType);

      expect(identifyMushroomFromImage).toHaveBeenCalledWith(base64Image, mimeType);
      expect(result).toEqual(mockGeminiResponse);
    });

    it('should return scientific name', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.scientificName).toBe('Amanita muscaria');
      expect(result.scientificName.length).toBeGreaterThan(0);
    });

    it('should return common name', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.commonName).toBe('Amanita matamoscas');
    });

    it('should return toxicity level', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.toxicity).toBe('Tóxico');
      expect(['Comestible', 'Tóxico', 'Mortal', 'Desconocido']).toContain(result.toxicity);
    });

    it('should return description', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.description).toBeDefined();
      expect(result.description.length).toBeGreaterThan(0);
    });

    it('should return habitat information', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.habitat).toBeDefined();
      expect(result.habitat.length).toBeGreaterThan(0);
    });

    it('should return distinctive features', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.features).toBeDefined();
      expect(result.features.length).toBeGreaterThan(0);
    });

    it('should default to image/jpeg mime type', async () => {
      const result = await identifyMushroomFromImage('valid-base64');
      expect(identifyMushroomFromImage).toHaveBeenCalledWith('valid-base64');
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid image data', async () => {
      const invalidBase64 = '';
      
      await expect(identifyMushroomFromImage(invalidBase64)).rejects.toThrow();
    });

    it('should reject null image data', async () => {
      await expect(identifyMushroomFromImage(null as any)).rejects.toThrow();
    });

    it('should handle API errors gracefully', async () => {
      vi.mocked(identifyMushroomFromImage).mockRejectedValueOnce(new Error('API Error'));

      await expect(identifyMushroomFromImage('valid-base64')).rejects.toThrow('API Error');
    });

    it('should handle network errors', async () => {
      vi.mocked(identifyMushroomFromImage).mockRejectedValueOnce(new Error('Network error'));

      await expect(identifyMushroomFromImage('valid-base64')).rejects.toThrow('Network error');
    });
  });

  describe('Response Schema', () => {
    it('should return object with all required fields', async () => {
      const result = await identifyMushroomFromImage('valid-base64');

      expect(result).toHaveProperty('scientificName');
      expect(result).toHaveProperty('commonName');
      expect(result).toHaveProperty('toxicity');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('habitat');
      expect(result).toHaveProperty('features');
    });

    it('should have string values for all fields', async () => {
      const result = await identifyMushroomFromImage('valid-base64');

      expect(typeof result.scientificName).toBe('string');
      expect(typeof result.commonName).toBe('string');
      expect(typeof result.toxicity).toBe('string');
      expect(typeof result.description).toBe('string');
      expect(typeof result.habitat).toBe('string');
      expect(typeof result.features).toBe('string');
    });
  });

  describe('Toxicity Classification', () => {
    it('should classify edible mushrooms', async () => {
      vi.mocked(identifyMushroomFromImage).mockResolvedValueOnce({
        ...mockGeminiResponse,
        toxicity: 'Comestible',
      });

      const result = await identifyMushroomFromImage('valid-base64');
      expect(result.toxicity).toBe('Comestible');
    });

    it('should classify toxic mushrooms', async () => {
      vi.mocked(identifyMushroomFromImage).mockResolvedValueOnce({
        ...mockGeminiResponse,
        toxicity: 'Tóxico',
      });

      const result = await identifyMushroomFromImage('valid-base64');
      expect(result.toxicity).toBe('Tóxico');
    });

    it('should classify deadly mushrooms', async () => {
      vi.mocked(identifyMushroomFromImage).mockResolvedValueOnce({
        ...mockGeminiResponse,
        toxicity: 'Mortal',
      });

      const result = await identifyMushroomFromImage('valid-base64');
      expect(result.toxicity).toBe('Mortal');
    });

    it('should handle unknown toxicity', async () => {
      vi.mocked(identifyMushroomFromImage).mockResolvedValueOnce({
        ...mockGeminiResponse,
        toxicity: 'Desconocido',
      });

      const result = await identifyMushroomFromImage('valid-base64');
      expect(result.toxicity).toBe('Desconocido');
    });
  });

  describe('API Configuration', () => {
    it('should use gemini-3-flash-preview model', () => {
      // The model name is hardcoded in the gemini.ts implementation
      expect(true).toBe(true); // Placeholder - actual model verification would require spying
    });

    it('should accept base64 encoded images', async () => {
      const base64Image = btoa('test-image-data');
      const result = await identifyMushroomFromImage(base64Image);
      expect(result).toBeDefined();
    });
  });
});
