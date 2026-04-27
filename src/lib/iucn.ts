// iucn.ts — IUCN Red List v4 API integration for FungiMap
// Free for non-commercial/research use
// API key required: https://api.iucnredlist.org/users/sign_up

const IUCN_BASE = "https://api.iucnredlist.org/api/v4";
const IUCN_KEY = "NxyAFxGkRNLBPyvacQioMYstJqY7HBZwFGev";

export interface IUCNAssessment {
  assessment_id: number;
  red_list_category_code: string;
  year_published: string;
  latest: boolean;
  url: string;
  scopes: { code: string; description: { en: string } }[];
}

export interface IUCNResult {
  scientific_name: string;
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  genus: string;
  species: string;
  authority: string;
  assessments: IUCNAssessment[];
  latest_category: string | null;
  latest_url: string | null;
}

// IUCN category codes to Spanish + emoji
export function iucnCategoryText(code: string): { label: string; emoji: string; color: string } {
  const categories: Record<string, { label: string; emoji: string; color: string }> = {
    "EX":  { label: "Extinto", emoji: "💀", color: "#000000" },
    "EW":  { label: "Extinto en estado silvestre", emoji: "💀", color: "#5B2422" },
    "CR":  { label: "En peligro crítico", emoji: "🔴", color: "#D63384" },
    "EN":  { label: "En peligro", emoji: "🟠", color: "#E85D2A" },
    "VU":  { label: "Vulnerable", emoji: "🟡", color: "#E8A62A" },
    "NT":  { label: "Casi amenazado", emoji: "🟤", color: "#8B6914" },
    "LC":  { label: "Preocupación menor", emoji: "🟢", color: "#2A8E2A" },
    "DD":  { label: "Datos insuficientes", emoji: "⚪", color: "#888888" },
    "NE":  { label: "No evaluado", emoji: "⚫", color: "#CCCCCC" },
  };
  return categories[code] || { label: code, emoji: "❓", color: "#999" };
}

export async function fetchIUCNStatus(
  genusName: string,
  speciesName: string
): Promise<IUCNResult | null> {
  try {
    const params = new URLSearchParams({
      genus_name: genusName,
      species_name: speciesName,
    });

    const res = await fetch(`${IUCN_BASE}/taxa/scientific_name?${params}`, {
      headers: { Authorization: `Bearer ${IUCN_KEY}` },
    });

    if (!res.ok) {
      if (res.status === 404) return null; // Species not in IUCN
      console.error("IUCN fetch failed:", res.status);
      return null;
    }

    const data = await res.json();
    const taxon = data.taxon;
    const assessments: IUCNAssessment[] = data.assessments || [];

    // Find latest global assessment
    const latestGlobal = assessments.find(
      (a: IUCNAssessment) => a.latest && a.scopes?.some((s: any) => s.code === "1")
    ) || assessments.find((a: IUCNAssessment) => a.latest) || null;

    return {
      scientific_name: taxon.scientific_name,
      kingdom: taxon.kingdom_name,
      phylum: taxon.phylum_name,
      class: taxon.class_name,
      order: taxon.order_name,
      family: taxon.family_name,
      genus: taxon.genus_name,
      species: taxon.species_name,
      authority: taxon.authority,
      assessments,
      latest_category: latestGlobal?.red_list_category_code || null,
      latest_url: latestGlobal?.url || null,
    };
  } catch (err) {
    console.error("IUCN error:", err);
    return null;
  }
}

// Parse "Genus species" from full name string
export function parseBinomial(name: string): { genus: string; species: string } | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { genus: parts[0], species: parts[1] };
}
