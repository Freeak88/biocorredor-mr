import { useState, useEffect } from 'react';
import { searchSpecies, validateSpeciesName } from '../lib/itis-taxonomy';

interface ITISValidation {
  valid: boolean;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  suggestions?: string[];
  error?: string;
}

export function useITISValidation(mushroomName: string, enabled: boolean = true) {
  const [validation, setValidation] = useState<ITISValidation>({
    valid: true, // Valid by default until validated
  });
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (!enabled || !mushroomName || mushroomName.length < 3) {
      setValidation({ valid: true });
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setIsValidating(true);
      const result = await validateSpeciesName(mushroomName);
      setValidation(result);
      setIsValidating(false);
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [mushroomName, enabled]);

  return {
    validation,
    isValidating,
    isValid: validation.valid && !validation.error,
    species: validation.species,
    family: validation.family,
    genus: validation.genus,
    order: validation.order,
    kingdom: validation.kingdom,
    phylum: validation.phylum,
    suggestions: validation.suggestions || [],
    rank: validation.suggestions?.[0]?.split(' ')[0] || '',
    error: validation.error,
    validate: () => {
      setIsValidating(true);
      validateSpeciesName(mushroomName).then(setValidation);
    }
  };
}
