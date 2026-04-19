import type { Entity, PiiCategory } from "./types";

export class PseudoMap {
  private byText = new Map<string, string>();
  private originals = new Map<string, string>();
  private counters: Record<PiiCategory, number> = {
    PERSONNE: 0,
    PERSONNE_MORALE: 0,
    AVOCAT: 0,
    MAGISTRAT: 0,
    JURIDICTION: 0,
    NUM_DOSSIER: 0,
    EMAIL: 0,
    TEL: 0,
    ADRESSE: 0,
    NIR: 0,
    IBAN: 0,
    SIREN: 0,
    DATE: 0,
    DATE_NAISSANCE: 0,
    PLAQUE: 0,
    LIEU: 0,
  };

  assign(text: string, category: PiiCategory): string {
    const key = `${category}::${normalize(text)}`;
    const existing = this.byText.get(key);
    if (existing) return existing;
    this.counters[category] += 1;
    const pseudonym = `${category}_${String(this.counters[category]).padStart(3, "0")}`;
    this.byText.set(key, pseudonym);
    this.originals.set(pseudonym, text);
    return pseudonym;
  }

  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [pseudo, original] of this.originals) {
      out[pseudo] = original;
    }
    return out;
  }

  static fromJSON(entries: Record<string, string>): PseudoMap {
    const map = new PseudoMap();
    for (const [pseudo, original] of Object.entries(entries)) {
      // Parse "CATEGORY_NNN" → category + counter
      const match = pseudo.match(/^([A-Z_]+)_(\d+)$/);
      if (!match) continue;
      const category = match[1] as PiiCategory;
      const counter = parseInt(match[2], 10);
      if (!(category in map.counters)) continue;
      map.byText.set(`${category}::${normalize(original)}`, pseudo);
      map.originals.set(pseudo, original);
      if (counter > map.counters[category]) {
        map.counters[category] = counter;
      }
    }
    return map;
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function applyPseudonyms(text: string, entities: Entity[]): string {
  const enabled = entities.filter((e) => e.enabled).sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const e of enabled) {
    if (e.start < cursor) continue;
    out += text.slice(cursor, e.start);
    out += e.pseudonym;
    cursor = e.end;
  }
  out += text.slice(cursor);
  return out;
}
