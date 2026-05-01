#!/usr/bin/env node
// itis-taxonomy.ts — ITIS Integration for species name validation
// Free API, no authentication required
// Usage: const species = await validateSpeciesName("Agaricus bisporus");

const ITIS_BASE = "https://www.itis.gov/ITISWebService/jsonservice";
const SEARCH_ENDPOINT = "ITISService/search";
const DETAILS_ENDPOINT = "ITISService/getFullRecordFromTSN";

interface ITISResult {
  kingdom: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus: string;
  species?: string;
  acceptedNameUsage: string;
  taxonAuthor: string;
  rank: string;
  tsn: string;
}

export interface ITISSuggestion {
  genus?: string;
  species?: string;
  full?: string;
  acceptedNameUsage?: string;
}

export interface ITISValidation {
  valid: boolean;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  taxonAuthor?: string;
  rank?: string;
  suggestions?: ITISSuggestion[];
  error?: string;
}

export async function searchSpecies(query: string): Promise<ITISResult[]> {
  try {
    const params = new URLSearchParams({
      srchKey: query.toLowerCase(),
      pageSize: "5",
    });
    const res = await fetch(`${ITIS_BASE}/${SEARCH_ENDPOINT}?${params}`);
    if (!res.ok) throw new Error(`ITIS search failed: ${res.status}`);
    const data = await res.json();
    return data || [];
  } catch (e) {
    console.error('ITIS search error:', e);
    return [];
  }
}

export async function getSpeciesDetails(tsn: string): Promise<ITISResult | null> {
  try {
    const res = await fetch(`${ITIS_BASE}/${DETAILS_ENDPOINT}?tsn=${tsn}`);
    if (!res.ok) throw new Error(`ITIS details failed: ${res.status}`);
    const data = await res.json();
    return data || null;
  } catch (e) {
    console.error('ITIS details error:', e);
    return null;
  }
}

export async function validateSpeciesName(speciesName: string): Promise<ITISValidation> {
  try {
    const results = await searchSpecies(speciesName);
    
    if (results.length === 0) {
      return {
        valid: false,
        error: "No se encontró en ITIS",
        suggestions: []
      };
    }

    const bestMatch = results[0];
    
    return {
      valid: true,
      kingdom: bestMatch.kingdom,
      phylum: bestMatch.phylum,
      class: bestMatch.class,
      order: bestMatch.order,
      family: bestMatch.family,
      genus: bestMatch.genus,
      species: bestMatch.species,
      taxonAuthor: bestMatch.taxonAuthor,
      rank: bestMatch.rank,
      suggestions: results.map(r => ({
        genus: r.genus,
        species: r.species,
        full: r.acceptedNameUsage
      }))
    };
  } catch (e) {
    console.error('ITIS validation error:', e);
    return {
      valid: false,
      error: "Error al validar con ITIS",
      suggestions: []
    };
  }
}

export function normalizeITISRank(rank: string): string {
  // ITIS ranks: "kingdom", "phylum", "class", "order", "family", "genus", "species"
  // Map to Spanish
  const translations: Record<string, string> = {
    "kingdom": "Reino",
    "phylum": "Filo",
    "class": "Clase",
    "order": "Orden",
    "family": "Familia",
    "genus": "Género",
    "species": "Especie",
  };
  return translations[rank] || rank;
}
