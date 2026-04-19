import { analyze } from "../src/lib/anonymizer";
import { applyPseudonyms } from "../src/lib/pseudo-map";

const sample = `
Monsieur Jean DUPONT, né le 15/03/1978, domicilié 12 rue de la République 75011 PARIS,
numéro de sécurité sociale 1 80 12 99 999 999 22, IBAN FR14 2004 1010 0505 0001 3M02 606,
tél. 06 39 98 76 54, email jean.dupont@example.fr

Madame Marie Martin, gérante de la société DUPONT SARL (SIREN 123 456 782), IBAN FR14 2004 1010 0505 0001 3M02 606

Le 4 avril 2026, le Tribunal judiciaire de Paris statuant en référé a rendu la décision suivante :
suite à l'assignation de Monsieur DUPONT contre Madame Martin, datée du 02/01/2026,
et considérant la pièce n°3 (courrier du 17 mars 2026), le juge a ordonné...

Me Paul TESTEUR (paul.testeur@example.fr, +33 1 23 45 67 89) représentait la partie adverse.
`;

const result = analyze(sample);

console.log(`\n=== ${result.entities.length} entités détectées ===\n`);
const byCat: Record<string, typeof result.entities> = {};
for (const e of result.entities) {
  (byCat[e.category] ||= []).push(e);
}
for (const [cat, list] of Object.entries(byCat)) {
  console.log(`\n[${cat}] ${list.length}`);
  for (const e of list) {
    console.log(`  "${e.text}" → ${e.pseudonym}`);
  }
}

console.log("\n=== Texte anonymisé ===\n");
console.log(applyPseudonyms(sample, result.entities));

console.log("\n=== Mapping ===\n");
console.log(JSON.stringify(result.pseudoMap.toJSON(), null, 2));
