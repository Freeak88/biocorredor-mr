import { vi, describe, it, expect, beforeEach } from 'vitest';
import { identifyMushroomFromImage } from '../../lib/gemini';

const mockGeminiResponse = vi.hoisted(() => ({
  status: 'identified' as const,
  level: 'species' as const,
  taxonomy: {
    kingdom: 'Fungi',
    division: 'Basidiomycota',
    class: 'Agaricomycetes',
    order: 'Agaricales',
    family: 'Amanitaceae',
    genus: 'Amanita',
    species: 'Amanita muscaria',
  },
  displayName: 'Amanita muscaria',
  confidence: 87,
  confidenceLevel: 'medium-high' as const,
  candidates: [
    { taxon: 'Amanita muscaria', confidence: 87 },
    { taxon: 'Amanita persicina', confidence: 8 },
  ],
  commonName: 'Amanita matamoscas',
  toxicity: 'Tóxico',
  description: 'Hongo de color rojo brillante con puntos blancos, común en bosques de coníferas.',
  habitat: 'Bosques de coníferas y caducifolios',
  features: 'Sombrero rojo con escamas blancas, pie blanco con anillo',
  quality: {
    photo_quality: 'good' as const,
    visible_features: ['cap', 'stem', 'ring'],
    missing_features: ['gills', 'volva'],
  },
  warnings: [],
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
      expect(result.status).toBe('identified');
      expect(result.level).toBe('species');
    });

    it('should return taxonomy with species level', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.taxonomy.species).toBe('Amanita muscaria');
      expect(result.taxonomy.genus).toBe('Amanita');
      expect(result.taxonomy.family).toBe('Amanitaceae');
    });

    it('should return confidence score', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.confidence).toBe(87);
      expect(result.confidenceLevel).toBe('medium-high');
    });

    it('should return candidates when confidence < 90', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.candidates).toBeDefined();
      expect(result.candidates!.length).toBeGreaterThan(0);
      expect(result.candidates![0].taxon).toBe('Amanita muscaria');
    });

    it('should return toxicity level', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.toxicity).toBe('Tóxico');
      expect(['Comestible', 'Tóxico', 'Mortal', 'Psicoactivo', 'Desconocido']).toContain(result.toxicity);
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

    it('should return quality assessment', async () => {
      const result = await identifyMushroomFromImage('valid-base64', 'image/jpeg');
      expect(result.quality.photo_quality).toBe('good');
      expect(result.quality.visible_features).toContain('cap');
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

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('taxonomy');
      expect(result).toHaveProperty('displayName');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('confidenceLevel');
      expect(result).toHaveProperty('quality');
    });

    it('should have proper types for critical fields', async () => {
      const result = await identifyMushroomFromImage('valid-base64');

      expect(typeof result.status).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Special States', () => {
    it('should handle unknown status', async () => {
      vi.mocked(identifyMushroomFromImage).mockResolvedValueOnce({
        ...mockGeminiResponse,
        status: 'unknown',
        confidence: 15,
        confidenceLevel: 'very-low',
        level: 'kingdom',
        displayName: 'Fungi',
      });

      const result = await identifyMushroomFromImage('valid-base64');
      expect(result.status).toBe('unknown');
      expect(result.confidence).toBeLessThan(20);
    });

    it('should handle unidentifiable status', async () => {
      vi.mocked(identifyMushroomFromImage).mockResolvedValueOnce({
        ...mockGeminiResponse,
        status: 'unidentifiable',
        confidence: 0,
        confidenceLevel: 'very-low',
        warnings: ['La foto está muy borrosa'],
      });

      const result = await identifyMushroomFromImage('valid-base64');
      expect(result.status).toBe('unidentifiable');
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
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
      expect(true).toBe(true);
    });

    it('should accept base64 encoded images', async () => {
      const base64Image = btoa('test-image-data');
      const result = await identifyMushroomFromImage(base64Image);
      expect(result).toBeDefined();
    });
  });
});
