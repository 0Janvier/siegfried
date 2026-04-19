/**
 * Post-traitement déterministe inspiré du package juritools
 * de la Cour de cassation.
 *
 * Ces passes tournent APRÈS la détection regex/heuristique
 * et ajoutent ou corrigent des entités.
 */

import type { PiiCategory } from "./types";
import type { RawMatch } from "./regex-fr";

// ─── 1. Multi-occurrence ───
// Si un texte est détecté comme entité à un endroit, propager
// à toutes les occurrences identiques dans le document.

export function propagateMultiOccurrences(text: string, matches: RawMatch[]): RawMatch[] {
  const added: RawMatch[] = [];
  const seen = new Set<string>();

  // Collect unique detected texts per category
  const byText = new Map<string, { category: PiiCategory; text: string }>();
  for (const m of matches) {
    const key = `${m.category}::${m.text.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      byText.set(key, { category: m.category, text: m.text });
    }
  }

  const existingPositions = new Set(matches.map((m) => `${m.start}:${m.end}`));
  const textLower = text.toLowerCase();

  for (const { category, text: needle } of byText.values()) {
    const needleLower = needle.toLowerCase();
    let pos = 0;
    while ((pos = textLower.indexOf(needleLower, pos)) !== -1) {
      const key = `${pos}:${pos + needle.length}`;
      if (!existingPositions.has(key)) {
        existingPositions.add(key);
        added.push({
          start: pos,
          end: pos + needle.length,
          text: text.slice(pos, pos + needle.length),
          category,
        });
      }
      pos += 1;
    }
  }

  return added;
}

// ─── 2. Physicomorale ───
// Si un nom de personne physique apparaît dans un nom de personne morale,
// marquer la personne morale comme contenant un nom sensible.
// Inversement, extraire les noms de personnes des sociétés.

export function crossReferencePhysicoMorale(matches: RawMatch[]): RawMatch[] {
  const personNames = matches
    .filter((m) => m.category === "PERSONNE" || m.category === "AVOCAT" || m.category === "MAGISTRAT")
    .map((m) => m.text);

  const societes = matches.filter((m) => m.category === "PERSONNE_MORALE");
  const added: RawMatch[] = [];

  for (const soc of societes) {
    for (const name of personNames) {
      const nameLower = name.toLowerCase();
      const socLower = soc.text.toLowerCase();
      if (socLower.includes(nameLower) && nameLower.length >= 3) {
        // The person name is embedded in the company name — already covered
        // But check if the name appears standalone elsewhere in the document
        // This is handled by propagateMultiOccurrences
        break;
      }
    }
  }

  // Reverse: extract person names from company names
  for (const soc of societes) {
    for (const name of personNames) {
      const idx = soc.text.toLowerCase().indexOf(name.toLowerCase());
      if (idx !== -1 && name.length >= 3) {
        const absStart = soc.start + idx;
        const absEnd = absStart + name.length;
        // Don't add if it's the exact same range as the société itself
        if (absStart !== soc.start || absEnd !== soc.end) {
          added.push({
            start: absStart,
            end: absEnd,
            text: soc.text.slice(idx, idx + name.length),
            category: "PERSONNE",
          });
        }
      }
    }
  }

  return added;
}

// ─── 3. Variantes orthographiques (Levenshtein) ───
// Détecter les variantes proches de noms déjà détectés et les propager.

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  // Quick reject if lengths differ too much
  if (Math.abs(la - lb) > 2) return 3;

  const matrix: number[][] = [];
  for (let i = 0; i <= la; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[la][lb];
}

export function findOrthographicVariants(text: string, matches: RawMatch[]): RawMatch[] {
  const personNames = matches
    .filter((m) => m.category === "PERSONNE")
    .map((m) => m.text);

  if (personNames.length === 0) return [];

  const uniqueNames = [...new Set(personNames.map((n) => n.toLowerCase()))]
    .filter((n) => n.length >= 4); // 3-char names too ambiguous for fuzzy match
  if (uniqueNames.length === 0) return [];

  // Bucket known names by length for O(1) range lookup
  const byLength = new Map<number, string[]>();
  for (const n of uniqueNames) {
    const arr = byLength.get(n.length) ?? [];
    arr.push(n);
    byLength.set(n.length, arr);
  }

  const added: RawMatch[] = [];
  const existingPositions = new Set(matches.map((m) => `${m.start}:${m.end}`));
  const seenCandidates = new Set<string>(); // dedupe identical candidate strings

  const candidateRe = /\b[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+(?:\s+[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+)*\b/g;
  for (const m of text.matchAll(candidateRe)) {
    const candidate = m[0];
    if (candidate.length < 4) continue;
    const candidateLower = candidate.toLowerCase();

    // Only compare against names within ±2 chars (Levenshtein ≤ 2 constraint)
    let matched = false;
    for (let delta = -2; delta <= 2 && !matched; delta++) {
      const bucket = byLength.get(candidateLower.length + delta);
      if (!bucket) continue;
      for (const known of bucket) {
        if (candidateLower === known) { matched = true; break; }
        // Early reject: first char must match or be adjacent (rare edit at position 0)
        if (candidateLower[0] !== known[0] && candidateLower[1] !== known[1]) continue;
        const dist = levenshtein(candidateLower, known);
        if (dist > 0 && dist <= 2) {
          matched = true;
          break;
        }
      }
    }
    if (!matched) continue;
    if (uniqueNames.includes(candidateLower)) continue; // exact match already covered

    const key = `${m.index!}:${m.index! + candidate.length}`;
    if (existingPositions.has(key)) continue;
    const dedupeKey = `${candidateLower}::${m.index}`;
    if (seenCandidates.has(dedupeKey)) continue;
    seenCandidates.add(dedupeKey);
    existingPositions.add(key);

    added.push({
      start: m.index!,
      end: m.index! + candidate.length,
      text: candidate,
      category: "PERSONNE",
    });
  }

  return added;
}

// ─── 4. Dates procédurales vs sensibles ───
// Reclassifier les DATE en DATE_NAISSANCE ou les marquer comme procédurales.

const PROCEDURAL_DATE_CONTEXT = /(?:audience\s+du|arr[eê]t\s+du|rendu\s+le|prononc[ée]\s+le|pourvoi\s+form[ée]\s+le|signifi[ée]\s+le|notifi[ée]\s+le|enregistr[ée]\s+le|d[ée]pos[ée]\s+le|re[çc]u\s+le|dat[ée]\s+du|en\s+date\s+du|du\s+(?:\d{1,2}\s+)?(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre))\s*$/i;

const BIRTH_DATE_CONTEXT = /(?:n[ée]{1,2}\s+le|date\s+de\s+naissance|[âa]g[ée]{1,2}\s+de)\s*$/i;
const DEATH_DATE_CONTEXT = /(?:d[ée]c[ée]d[ée]{1,2}\s+le|date\s+(?:du\s+)?d[ée]c[èe]s)\s*$/i;

export function reclassifyDates(text: string, matches: RawMatch[]): RawMatch[] {
  const result: RawMatch[] = [];

  for (const m of matches) {
    if (m.category !== "DATE") {
      result.push(m);
      continue;
    }

    // Look at context before the date (up to 60 chars)
    const contextBefore = text.slice(Math.max(0, m.start - 60), m.start);

    if (BIRTH_DATE_CONTEXT.test(contextBefore)) {
      result.push({ ...m, category: "DATE_NAISSANCE" });
    } else if (DEATH_DATE_CONTEXT.test(contextBefore)) {
      result.push({ ...m, category: "DATE_NAISSANCE" }); // dates de décès = sensibles aussi
    } else if (PROCEDURAL_DATE_CONTEXT.test(contextBefore)) {
      // Date procédurale : ne pas anonymiser → on la retire
      continue;
    } else {
      result.push(m);
    }
  }

  return result;
}

// ─── 5. Signalement des entités douteuses ───
// Noms très courts (1-2 caractères) ou trop génériques.

export function flagDoubtfulEntities(matches: RawMatch[]): RawMatch[] {
  return matches.filter((m) => {
    if (m.category === "PERSONNE" || m.category === "AVOCAT" || m.category === "MAGISTRAT") {
      // Reject single-word names of 1-2 chars (likely false positives)
      const words = m.text.trim().split(/\s+/);
      if (words.length === 1 && words[0].length <= 2) return false;
    }
    return true;
  });
}

// ─── 6. Distinction professionnels / parties ───
// Les avocats et magistrats ne doivent PAS être anonymisés par défaut
// (principe CNIL 01-057). On les détecte mais on les désactive.

export function markProfessionalsDisabled(matches: RawMatch[]): { match: RawMatch; enabled: boolean }[] {
  return matches.map((m) => ({
    match: m,
    enabled: m.category !== "AVOCAT" && m.category !== "MAGISTRAT",
  }));
}

// ─── 7. Particules grammaticales (articles, prépositions, pronoms) ───
// Ces mots ne doivent JAMAIS devenir des entités isolées ni polluer les bords
// des entités détectées (ex. "de Paris" → "Paris", "le DUPONT" → "DUPONT").
// Conservés au milieu d'un nom composé (ex. "Marie de Villepin").

const PARTICLES_FR = new Set([
  // Articles definis / indefinis
  "le", "la", "les", "l",
  "un", "une", "des",
  // Prepositions courtes
  "de", "du", "d",
  "a", "au", "aux",
  "en", "par", "pour", "sur", "sous", "dans",
  "avec", "sans", "chez", "vers", "depuis", "entre",
  // Conjonctions
  "et", "ou", "mais", "ni", "car", "or", "donc",
  // Pronoms personnels sujets
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  // Pronoms personnels complements
  "me", "te", "se", "lui", "leur", "y",
  // Demonstratifs
  "ce", "cet", "cette", "ces",
  // Possessifs
  "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
  "notre", "votre", "nos", "vos", "leurs",
  // Relatifs
  "que", "qui", "quoi", "dont",
]);

function normalizeWord(w: string): string {
  return w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isParticle(word: string): boolean {
  const cleaned = word.replace(/['’]/g, "").trim();
  if (cleaned.length === 0) return false;
  return PARTICLES_FR.has(normalizeWord(cleaned));
}

/**
 * Rogne les particules en début et fin de chaque match, drop si reste vide ou particule.
 * Ne touche JAMAIS les particules internes (ex. "Marie de Villepin" reste intact).
 * N'applique pas aux catégories structurees (EMAIL, IBAN, NIR, SIREN, TEL, PLAQUE,
 * NUM_DOSSIER, DATE, DATE_NAISSANCE) où les particules sont improbables.
 */
export function trimParticles(text: string, matches: RawMatch[]): RawMatch[] {
  const STRUCTURED = new Set([
    "EMAIL", "IBAN", "NIR", "SIREN", "TEL", "PLAQUE",
    "NUM_DOSSIER", "DATE", "DATE_NAISSANCE",
  ]);
  const result: RawMatch[] = [];

  for (const m of matches) {
    if (STRUCTURED.has(m.category)) {
      result.push(m);
      continue;
    }

    let start = m.start;
    let end = m.end;
    let current = text.slice(start, end);

    // Rogne les particules (+ espace/apostrophe) en tête
    let changed = true;
    while (changed && start < end) {
      changed = false;
      const head = current.match(/^([A-Za-zÀ-ÿ]+['’]?)[\s,]+/);
      if (head && isParticle(head[1])) {
        const advance = head[0].length;
        start += advance;
        current = text.slice(start, end);
        changed = true;
      }
    }

    // Rogne les particules en queue
    changed = true;
    while (changed && start < end) {
      changed = false;
      const tail = current.match(/[\s,]+([A-Za-zÀ-ÿ]+['’]?)$/);
      if (tail && isParticle(tail[1])) {
        end -= tail[0].length;
        current = text.slice(start, end);
        changed = true;
      }
    }

    const trimmed = current.trim();
    if (trimmed.length === 0) continue;
    // Single-word particle (rare — "Le" capturé seul par ex.)
    if (!trimmed.includes(" ") && isParticle(trimmed)) continue;
    // Reject si trop court après trim
    if (trimmed.length < 2) continue;

    // Recalcule start/end pour matcher exactement `trimmed`
    const leadWs = current.length - current.trimStart().length;
    const trailWs = current.length - current.trimEnd().length;
    result.push({
      start: start + leadWs,
      end: end - trailWs,
      text: trimmed,
      category: m.category,
    });
  }

  return result;
}
