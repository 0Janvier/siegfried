export type PiiCategory =
  | "PERSONNE"
  | "PERSONNE_MORALE"
  | "AVOCAT"
  | "MAGISTRAT"
  | "JURIDICTION"
  | "NUM_DOSSIER"
  | "EMAIL"
  | "TEL"
  | "ADRESSE"
  | "NIR"
  | "IBAN"
  | "SIREN"
  | "DATE"
  | "DATE_NAISSANCE"
  | "PLAQUE"
  | "LIEU";

export interface Entity {
  start: number;
  end: number;
  text: string;
  category: PiiCategory;
  pseudonym: string;
  enabled: boolean;
}

export interface ExtractedPage {
  file: string;
  page: number;
  text: string;
  used_ocr: boolean;
}

export interface PseudoMap {
  entries: Record<string, string>;
}

export const CATEGORY_LABELS: Record<PiiCategory, string> = {
  PERSONNE: "Personne physique",
  PERSONNE_MORALE: "Personne morale",
  AVOCAT: "Avocat",
  MAGISTRAT: "Magistrat/Greffier",
  JURIDICTION: "Juridiction",
  NUM_DOSSIER: "N° dossier/RG",
  EMAIL: "Email",
  TEL: "Telephone",
  ADRESSE: "Adresse",
  NIR: "N° secu",
  IBAN: "IBAN",
  SIREN: "SIREN/SIRET",
  DATE: "Date",
  DATE_NAISSANCE: "Date de naissance",
  PLAQUE: "Plaque immat.",
  LIEU: "Lieu",
};

export const CATEGORY_COLORS: Record<PiiCategory, string> = {
  PERSONNE: "#ffb3b3",
  PERSONNE_MORALE: "#ff9999",
  AVOCAT: "#d4a3d4",
  MAGISTRAT: "#c4a3e0",
  JURIDICTION: "#a3c4e0",
  NUM_DOSSIER: "#b3cce6",
  EMAIL: "#b3d9ff",
  TEL: "#c2f0c2",
  ADRESSE: "#ffd9b3",
  NIR: "#e0b3ff",
  IBAN: "#ffe0b3",
  SIREN: "#b3fff0",
  DATE: "#fff0b3",
  DATE_NAISSANCE: "#ffe680",
  PLAQUE: "#d9d9d9",
  LIEU: "#c2e0c2",
};
