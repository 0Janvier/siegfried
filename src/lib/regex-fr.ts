import type { PiiCategory } from "./types";

export interface RawMatch {
  start: number;
  end: number;
  text: string;
  category: PiiCategory;
}

// ─── Structured patterns (high precision) ───

const PATTERNS: { category: PiiCategory; re: RegExp; group?: number; validate?: (s: string) => boolean }[] = [
  // Email
  {
    category: "EMAIL",
    re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  // Telephone FR
  {
    category: "TEL",
    re: /(?:(?:\+33|0033)\s?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}/g,
  },
  // NIR (n° securite sociale)
  {
    category: "NIR",
    re: /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g,
    validate: validateNir,
  },
  // IBAN (FR + international)
  {
    category: "IBAN",
    re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/g,
    validate: validateIban,
  },
  // SIREN/SIRET — with context to avoid matching dates, phone numbers, postal codes
  {
    category: "SIREN",
    re: /(?<!\d[-\/.])\b\d{3}\s?\d{3}\s?\d{3}(?:\s?\d{5})?\b(?![-\/.]?\d)/g,
    validate: validateSiren,
  },
  // Plaque d'immatriculation FR (SIV + FNI)
  {
    category: "PLAQUE",
    re: /\b[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}\b/g,
  },
  {
    category: "PLAQUE",
    re: /\b\d{1,4}[-\s]?[A-Z]{2,3}[-\s]?\d{2}\b/g,
  },
  // Numero de dossier / RG
  {
    category: "NUM_DOSSIER",
    re: /\bRG\s*(?:n°?\s*)?\d{2}[/-]\d{3,6}\b/gi,
  },
  {
    category: "NUM_DOSSIER",
    re: /\bn°?\s?\d{2}[/-]\d{3,6}\b/g,
  },
  {
    category: "NUM_DOSSIER",
    re: /\b(?:MINUTE|PARQUET)\s*(?:n°?\s*)?\d{2}[/-]\d{3,8}\b/gi,
  },
  // Date de naissance (contexte explicite)
  {
    category: "DATE_NAISSANCE",
    re: /(?:n[ée]{1,2}\s+le\s+)(\d{1,2}[\/\s.-]\d{1,2}[\/\s.-]\d{2,4})/gi,
    group: 1,
  },
  {
    category: "DATE_NAISSANCE",
    re: /(?:n[ée]{1,2}\s+le\s+)(\d{1,2}\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+\d{2,4})/gi,
    group: 1,
  },
  // Dates generiques
  {
    category: "DATE",
    re: /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g,
  },
  {
    category: "DATE",
    re: /\b\d{1,2}\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+\d{2,4}\b/gi,
  },
  // Adresse (rue/avenue/etc.)
  {
    category: "ADRESSE",
    re: /\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd\.|bd|place|pl\.|impasse|imp\.|all[ée]e|chemin|route|quai|cours|passage|voie|r[ée]sidence|lot|lotissement|hameau|lieudit|lieu-dit|square|parvis|esplanade|promenade|sentier|traverse|mont[ée]e)\s+[^,\n]{3,60}?(?=[,\n]|$)/gi,
  },
  // Code postal + ville
  {
    category: "ADRESSE",
    re: /\b\d{5}\s+[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ'\- ]{2,40}/g,
  },
];

// ─── Juridictions françaises ───

const JURIDICTIONS = [
  // Cours
  "Cour de cassation",
  "Cour d'appel",
  "cour d'appel",
  "Cour d'assises",
  // Tribunaux
  "Tribunal judiciaire",
  "tribunal judiciaire",
  "Tribunal de commerce",
  "tribunal de commerce",
  "Tribunal administratif",
  "tribunal administratif",
  "Tribunal correctionnel",
  "tribunal correctionnel",
  "Tribunal de police",
  "Tribunal des affaires de s[ée]curit[ée] sociale",
  "Tribunal paritaire des baux ruraux",
  "Tribunal de proximit[ée]",
  // Conseils
  "Conseil de prud'hommes",
  "conseil de prud'hommes",
  "Conseil d'[EÉeé]tat",
  "Conseil constitutionnel",
  // Juridictions specialisees
  "Juge de l'ex[ée]cution",
  "Juge aux affaires familiales",
  "Juge des enfants",
  "Juge d'instruction",
  "Juge de la mise en [ée]tat",
  "Juge des libert[ée]s et de la d[ée]tention",
  "Juge des contentieux de la protection",
  "Juge commissaire",
  // Cour administrative
  "Cour administrative d'appel",
  // Chambres
  "Chambre de l'instruction",
  "Chambre des appels correctionnels",
];

// Suffixe ville : mot commençant par majuscule, peut être composé avec hyphens
// ou "-sur-Mer". Pas d'espaces pour éviter "Paris statuant en référé".
const JURIDICTION_RE = new RegExp(
  `(?:${JURIDICTIONS.join("|")})(?:\\s+(?:de|d'|du|des)\\s+[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ']+(?:-[A-Za-zÀ-ÿ']+){0,4})?`,
  "g"
);

// ─── Formes juridiques (societes) ───

const FORMES_JURIDIQUES = [
  "SAS", "SASU", "SARL", "EURL", "SA", "SCI", "SCP", "SCM",
  "SNC", "GIE", "SELARL", "SELAS", "SEL", "SELAFA", "SELCA",
  "GAEC", "EARL", "SCA", "SCIC", "SCOP",
];

const FORMES_RE_STR = FORMES_JURIDIQUES.join("|");

// Nom de société : capture 1 à 4 mots commençant par MAJ, séparés par espace/hyphen/apostrophe.
// Pas d'espaces trailing, pas de backtrack massif.
const SOCIETE_NAME = `[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ&'-]{1,40}(?:[ '-][A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ&'-]{0,40}){0,3}`;

const SOCIETE_PATTERNS: RegExp[] = [
  // Forme juridique en prefix : "SAS Dupont Construction"
  new RegExp(`\\b(?:${FORMES_RE_STR})\\s+(${SOCIETE_NAME})`, "g"),
  // Forme juridique en suffix : "Dupont Construction SAS"
  new RegExp(`\\b(${SOCIETE_NAME})\\s+(?:${FORMES_RE_STR})\\b`, "g"),
  // "la societe X" / "la Societe X"
  new RegExp(
    `(?:[Ll]a\\s+)?(?:[Ss]oci[ée]t[ée]|[Ll]'(?:entreprise|association|fondation|mutuelle|caisse|banque|compagnie))\\s+(${SOCIETE_NAME})`,
    "g"
  ),
  // Cabinet / Etude / Office
  new RegExp(`(?:Cabinet|[EÉ]tude|Office)\\s+(${SOCIETE_NAME})`, "g"),
];

// ─── Noms de personnes (heuristiques multiples) ───

// Civilites classiques
const CIVILITES = "Monsieur|Madame|Mme|Mlle|M\\.|Me|Ma[iî]tre|Dr|Docteur|Pr|Professeur";

// Contextes juridiques qui precedent un nom
const CONTEXTES_NOM = [
  `(?:${CIVILITES})`,
  // Roles proceduraux
  "(?:le|la|les)\\s+(?:requ[ée]rant(?:e)?|d[ée]fendeur(?:esse)?|demandeur(?:esse)?|appelant(?:e)?|intim[ée](?:e)?|pr[ée]venu(?:e)?|accus[ée](?:e)?|partie\\s+civile|partie\\s+intervenante|assignant(?:e)?|assign[ée](?:e)?)",
  // Consorts / Epoux
  "(?:consorts|[ée]poux|[ée]pouse|veuve|h[ée]ritiers\\s+de|aux\\s+droits\\s+de|repr[ée]sent[ée](?:e)?\\s+par|assist[ée](?:e)?\\s+de)",
  // "de M./Mme" dans un contexte
  "(?:repr[ée]sent[ée]e?\\s+par\\s+(?:Me|Ma[iî]tre))",
];

// Nom = Prenom (Maj+min) + NOM (MAJUSCULES) ou sequence capitalisee
const NOM_PART = "(?:[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+(?:\\s+|-))*[A-ZÀ-ÖØ-ÞŸ][A-ZÀ-ÖØ-ÞŸ'-]{1,}|(?:[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+(?:\\s+)){1,3}[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+";

const NAME_PATTERNS: RegExp[] = CONTEXTES_NOM.map(
  (ctx) => new RegExp(`(?:${ctx})\\s+(${NOM_PART})`, "g")
);

// "entre X, ... et Y, ..." pattern (clauses d'identification dans les jugements)
const ENTRE_PATTERN = /\b(?:ENTRE|Entre)\s*:?\s*\n?\s*((?:[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+\s+)*[A-ZÀ-ÖØ-ÞŸ][A-ZÀ-ÖØ-ÞŸ'-]+)/g;

// Noms en FULL CAPS : Prénom (Capit) + NOM (MAJ) — contrainte stricte
// Le prénom doit être >= 2 chars pour éviter les initiales isolées / codes
const FULLCAPS_NAME = /\b([A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]{1,}(?:\s+[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+)?\s+[A-ZÀ-ÖØ-ÞŸ]{2,}(?:[-\s][A-ZÀ-ÖØ-ÞŸ]{2,})*)\b/g;

// Mots en capitalisation simple (PascalCase) qui ne sont PAS des prénoms
// — évite de capturer "Code Civil DUPONT" → "Code Civil DUPONT"
const NOT_A_FIRSTNAME = new Set([
  "Code", "Article", "Loi", "Decret", "Arrete", "Ordonnance", "Jugement",
  "Arret", "Decision", "Audience", "Tribunal", "Cour", "Chambre", "Section",
  "Titre", "Chapitre", "Livre", "Partie", "Annexe", "Alinea", "Paragraphe",
  "Monsieur", "Madame", "Maitre", "Docteur", "Professeur",
  "Vu", "Attendu", "Considerant", "Statuant", "Ordonne", "Condamne", "Rejette",
  "Republique", "Francaise", "Etat", "Ministre", "Prefet", "Maire",
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
  "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche",
  "Paris", "Lyon", "Marseille", "Bordeaux", "Lille", "Nice", "Toulouse",
  "Nantes", "Strasbourg", "Rennes", "Montpellier",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ─── Avocats ───

const AVOCAT_PATTERNS: RegExp[] = [
  /(?:Ma[iî]tre|Me)\s+((?:[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+\s+)*[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ'-]+)/g,
  /(?:avocat|avocate|conseil)\s*:?\s*((?:[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+\s+)*[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ'-]+)/gi,
  /(?:repr[ée]sent[ée]e?\s+par\s+)(?:Me|Ma[iî]tre)\s+((?:[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+\s+)*[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ'-]+)/gi,
  // Barreau de X
  /(?:inscrite?\s+au\s+)?[Bb]arreau\s+d[e']\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿ\-' ]{1,30})/g,
];

// ─── Magistrats ───

const MAGISTRAT_PATTERNS: RegExp[] = [
  /(?:Pr[ée]sident(?:e)?|Conseiller(?:[eè]re)?|Juge|Vice-[Pp]r[ée]sident(?:e)?|Procureur(?:e)?|Substitut|Greffier(?:[eè]re)?|Premier(?:e)?\s+Pr[ée]sident(?:e)?)\s*:?\s*((?:[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+\s+)*[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ'-]+)/g,
  /(?:compos[ée]e?\s+de\s+)(?:(?:Mmes?|Mrs?|MM\.)\s+)?((?:[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ'-]+\s+)*[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ'-]+)/g,
];

// ─── Lieux (naissance, domicile) ───

const LIEU_PATTERNS: RegExp[] = [
  /(?:n[ée]{1,2}\s+[àa]\s+)((?:[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ\-' ]+)(?:\s+\(\d{2,5}\))?)/gi,
  /(?:demeurant\s+[àa]\s+|domicili[ée]e?\s+[àa]\s+|r[ée]sidant\s+[àa]\s+)((?:[A-ZÀ-ÖØ-ÞŸ][A-Za-zÀ-ÿ\-' ]+)(?:\s+\(\d{2,5}\))?)/gi,
  /(?:de\s+nationalit[ée]\s+)([A-Za-zÀ-ÿ]+)/gi,
];

// ─── Stopwords pour filtrer les faux positifs noms ───

const NAME_STOPWORDS = new Set([
  // Mots juridiques courants en majuscules
  "ENTRE", "ET", "CONTRE", "SUR", "PAR", "POUR", "DANS", "AVEC",
  "ATTENDU", "QUE", "VU", "CONSIDERANT", "ORDONNE", "CONDAMNE",
  "DEBOUTE", "DIT", "JUGE", "DECLARE", "STATUANT", "REJETTE",
  "CONFIRME", "INFIRME", "ANNULE", "CASSE", "RENVOIE",
  "TRIBUNAL", "COUR", "CHAMBRE", "AUDIENCE", "ARRET", "JUGEMENT",
  "DECISION", "ORDONNANCE", "CONCLUSIONS", "BORDEREAU",
  "REPUBLIQUE", "FRANCAISE", "FRANCAIS",
  "ARTICLE", "CODE", "CIVIL", "PENAL", "PROCEDURE", "TRAVAIL", "COMMERCE",
  "PREMIER", "DEUXIEME", "TROISIEME",
  "TITRE", "CHAPITRE", "SECTION", "ALINEA", "PARAGRAPHE",
  // Formes juridiques (pas des noms)
  ...FORMES_JURIDIQUES,
]);

function isStopword(text: string): boolean {
  const upper = text.toUpperCase().trim();
  if (NAME_STOPWORDS.has(upper)) return true;
  const words = upper.split(/\s+/);
  return words.length > 0 && words.every((w) => NAME_STOPWORDS.has(w));
}

// ─── Public API ───

export function findStructuredPii(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const { category, re, group, validate } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const raw = group !== undefined ? m[group] : m[0];
      if (!raw) continue;
      if (validate && !validate(raw)) continue;
      const offset = group !== undefined ? m.index! + m[0].indexOf(raw) : m.index!;
      out.push({
        start: offset,
        end: offset + raw.length,
        text: raw,
        category,
      });
    }
  }
  return out;
}

export function findPersonNames(text: string): RawMatch[] {
  const out: RawMatch[] = [];

  // 1. Noms avec contexte (civilites, roles proceduraux, etc.)
  for (const re of NAME_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const name = m[1];
      if (!name || name.trim().length < 2 || isStopword(name)) continue;
      const idx = m.index! + m[0].indexOf(name);
      out.push({ start: idx, end: idx + name.length, text: name, category: "PERSONNE" });
    }
  }

  // 2. Pattern "ENTRE: Prenom NOM"
  ENTRE_PATTERN.lastIndex = 0;
  for (const m of text.matchAll(ENTRE_PATTERN)) {
    const name = m[1];
    if (!name || name.trim().length < 3 || isStopword(name)) continue;
    const idx = m.index! + m[0].indexOf(name);
    out.push({ start: idx, end: idx + name.length, text: name, category: "PERSONNE" });
  }

  // 3. Noms "Prenom NOM" (prenom minuscule + nom majuscule)
  FULLCAPS_NAME.lastIndex = 0;
  for (const m of text.matchAll(FULLCAPS_NAME)) {
    const name = m[1];
    if (!name || name.trim().length < 4 || isStopword(name)) continue;
    const words = name.split(/\s+/);
    const firstLower = words.find((w) => /^[A-ZÀ-ÖØ-ÞŸ][a-zà-ÿ]/.test(w));
    const hasUpper = words.some((w) => /^[A-ZÀ-ÖØ-ÞŸ]{2,}(?:-[A-ZÀ-ÖØ-ÞŸ]{2,})*$/.test(w));
    if (!firstLower || !hasUpper) continue;
    // Reject si le mot "prénom" est en fait un mot juridique/commun
    if (NOT_A_FIRSTNAME.has(stripAccents(firstLower))) continue;
    // Reject si toutes les majuscules sont < 2 chars (probable abbreviation)
    const upperWords = words.filter((w) => /^[A-ZÀ-ÖØ-ÞŸ]{2,}/.test(w));
    if (upperWords.every((w) => w.length <= 2)) continue;
    out.push({ start: m.index!, end: m.index! + name.length, text: name, category: "PERSONNE" });
  }

  return out;
}

export function findAvocats(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const re of AVOCAT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const name = m[1];
      if (!name || name.trim().length < 2 || isStopword(name)) continue;
      const idx = m.index! + m[0].indexOf(name);
      out.push({ start: idx, end: idx + name.length, text: name, category: "AVOCAT" });
    }
  }
  return out;
}

export function findMagistrats(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const re of MAGISTRAT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const name = m[1];
      if (!name || name.trim().length < 2 || isStopword(name)) continue;
      const idx = m.index! + m[0].indexOf(name);
      out.push({ start: idx, end: idx + name.length, text: name, category: "MAGISTRAT" });
    }
  }
  return out;
}

export function findJuridictions(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  JURIDICTION_RE.lastIndex = 0;
  for (const m of text.matchAll(JURIDICTION_RE)) {
    out.push({
      start: m.index!,
      end: m.index! + m[0].length,
      text: m[0],
      category: "JURIDICTION",
    });
  }
  return out;
}

export function findSocietes(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const re of SOCIETE_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const name = m[1] || m[0];
      if (!name || name.trim().length < 2 || isStopword(name)) continue;
      const idx = m.index! + m[0].indexOf(name);
      out.push({
        start: idx,
        end: idx + name.length,
        text: name.trim(),
        category: "PERSONNE_MORALE",
      });
    }
  }
  return out;
}

export function findLieux(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const re of LIEU_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const lieu = m[1];
      if (!lieu || lieu.trim().length < 2) continue;
      const idx = m.index! + m[0].indexOf(lieu);
      out.push({ start: idx, end: idx + lieu.length, text: lieu.trim(), category: "LIEU" });
    }
  }
  return out;
}

// ─── Validation helpers ───

function validateLuhn(num: string): boolean {
  if (!/^\d+$/.test(num)) return false;
  if (num.length !== 9 && num.length !== 14) return false;
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validateSiren(s: string): boolean {
  const clean = s.replace(/\s/g, "");
  if (!validateLuhn(clean)) return false;
  // Reject if it looks like a phone number (starts with 0)
  if (clean.startsWith("0")) return false;
  // Reject if all digits are the same (e.g. 111 111 111)
  if (/^(\d)\1+$/.test(clean)) return false;
  return true;
}

function validateNir(s: string): boolean {
  const digits = s.replace(/\s/g, "");
  if (digits.length !== 15) return false;
  const num = digits.slice(0, 13);
  const key = parseInt(digits.slice(13), 10);
  // Handle Corsican departments 2A/2B
  const adjusted = num.replace(/2[Aa]/g, "19").replace(/2[Bb]/g, "18");
  const mod = BigInt(adjusted) % 97n;
  return 97n - mod === BigInt(key);
}

function validateIban(s: string): boolean {
  const clean = s.replace(/\s/g, "").toUpperCase();
  if (clean.length < 15 || clean.length > 34) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((c) => (c >= "A" && c <= "Z" ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let remainder = "";
  for (const c of numeric) {
    remainder += c;
    if (remainder.length >= 9) {
      remainder = String(parseInt(remainder, 10) % 97);
    }
  }
  return parseInt(remainder, 10) % 97 === 1;
}
