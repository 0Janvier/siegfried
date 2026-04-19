import {
  findStructuredPii,
  findPersonNames,
  findAvocats,
  findMagistrats,
  findJuridictions,
  findSocietes,
  findLieux,
  type RawMatch,
} from "./regex-fr";
import {
  propagateMultiOccurrences,
  crossReferencePhysicoMorale,
  findOrthographicVariants,
  reclassifyDates,
  flagDoubtfulEntities,
  markProfessionalsDisabled,
  trimParticles,
} from "./juritools";
import { PseudoMap } from "./pseudo-map";
import type { Entity } from "./types";

export interface AnalysisResult {
  entities: Entity[];
  pseudoMap: PseudoMap;
  stats: AnalysisStats;
}

export interface AnalysisStats {
  byCategory: Record<string, number>;
  total: number;
  propagated: number;
  variants: number;
  procedural: number;
}

export function analyze(text: string): AnalysisResult {
  // ── Pass 1: Regex detection ──
  let raw: RawMatch[] = [
    ...findStructuredPii(text),
    ...findJuridictions(text),
    ...findSocietes(text),
    ...findAvocats(text),
    ...findMagistrats(text),
    ...findPersonNames(text),
    ...findLieux(text),
  ];

  const initialCount = raw.length;

  // ── Pass 2: juritools post-processing ──

  // 2a. Reclassify dates (birth/death/procedural) BEFORE dedup
  raw = reclassifyDates(text, raw);
  const proceduralRemoved = initialCount - raw.length;

  // 2b. Remove doubtful entities (very short names)
  raw = flagDoubtfulEntities(raw);

  // 2c. Cross-reference person names ↔ company names
  const physicoMorale = crossReferencePhysicoMorale(raw);
  raw = [...raw, ...physicoMorale];

  // 2d. Propagate multi-occurrences (all detected texts → all positions)
  const propagated = propagateMultiOccurrences(text, raw);
  raw = [...raw, ...propagated];

  // 2e. Find orthographic variants (Levenshtein ≤ 2)
  const variants = findOrthographicVariants(text, raw);
  raw = [...raw, ...variants];

  // 2f. Trim leading/trailing particles (de, le, la, du, à, et, pronoms…)
  //     et drop les matches réduits à une simple particule.
  raw = trimParticles(text, raw);

  // ── Pass 3: Deduplicate ──
  const deduped = dedupeByRange(raw);

  // ── Pass 4: Assign pseudonyms with professional distinction ──
  const withStatus = markProfessionalsDisabled(deduped);
  const pseudoMap = new PseudoMap();
  const entities: Entity[] = withStatus.map(({ match: r, enabled }) => ({
    start: r.start,
    end: r.end,
    text: r.text,
    category: r.category,
    pseudonym: pseudoMap.assign(r.text, r.category),
    enabled,
  }));
  entities.sort((a, b) => a.start - b.start);

  // ── Stats ──
  const byCategory: Record<string, number> = {};
  for (const e of entities) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }

  return {
    entities,
    pseudoMap,
    stats: {
      byCategory,
      total: entities.length,
      propagated: propagated.length,
      variants: variants.length,
      procedural: proceduralRemoved,
    },
  };
}

function dedupeByRange(matches: RawMatch[]): RawMatch[] {
  const priority: Record<string, number> = {
    DATE_NAISSANCE: 10,
    AVOCAT: 9,
    MAGISTRAT: 9,
    JURIDICTION: 8,
    PERSONNE_MORALE: 7,
    NUM_DOSSIER: 7,
    NIR: 6,
    IBAN: 6,
    SIREN: 6,
    PLAQUE: 6,
    EMAIL: 5,
    TEL: 5,
    ADRESSE: 4,
    LIEU: 4,
    PERSONNE: 3,
    DATE: 2,
  };

  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const pa = priority[a.category] ?? 0;
    const pb = priority[b.category] ?? 0;
    if (pa !== pb) return pb - pa;
    return (b.end - b.start) - (a.end - a.start);
  });

  const result: RawMatch[] = [];
  let lastEnd = -1;
  for (const m of sorted) {
    if (m.start >= lastEnd) {
      result.push(m);
      lastEnd = m.end;
    }
  }
  return result;
}
