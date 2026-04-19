<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="Siegfried2" width="128" />
</p>

# Siegfried2

**Anonymiseur PDF 100 % local, adapté aux données juridiques françaises.**

*Concatène. Extrait. Pseudonymise. Rien ne quitte la machine.*

> Projet personnel partagé librement.
> Pas un produit SaaS, pas une plateforme. Un petit utilitaire qui tourne
> sur votre Mac, de bout en bout sous votre contrôle.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/0Janvier/siegfried/actions/workflows/ci.yml/badge.svg)](https://github.com/0Janvier/siegfried/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/platform-macOS%2011%2B-lightgrey.svg)](#installation)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-stable-B7410E)](https://www.rust-lang.org/)
[![Offline First](https://img.shields.io/badge/offline-first-success)](#securite--confidentialite)

---

## Pourquoi Siegfried2

Avocat, la protection des données me préoccupe depuis toujours. Le secret professionnel structure l'exercice, et chaque dossier transporte son lot de noms, d'adresses, d'IBAN ou de numéros de sécurité sociale à manier avec précaution.

Avec l'essor des IA génératives, le Conseil national des barreaux a précisé les lignes. Son **Guide pratique sur l'IA générative** (septembre 2024), puis son **Guide sur la déontologie et l'intelligence artificielle** adopté en assemblée générale le 13 mars 2026, fixent une règle ferme : l'avocat ne transmet jamais à un système d'IA générative des données couvertes par le secret professionnel, sous peine de sanctions. Avant toute requête, les informations sensibles doivent être pseudonymisées ou anonymisées.

Le problème pratique est connu : la plupart des outils de pseudonymisation disponibles sur le marché supposent que le document parte sur un serveur tiers. Soit précisément le travers que la règle entend prévenir.

Siegfried2 propose une réponse simple. L'extraction du texte, la détection des données personnelles et leur pseudonymisation s'effectuent **intégralement sur la machine locale**. Aucun appel réseau, aucun serveur, aucune télémétrie. La table de correspondance générée permet ensuite de ré-identifier la réponse de l'IA une fois celle-ci revenue.

> **Règle CNB.** L'avocat ne transmet jamais à une IA générative des données
> couvertes par le secret professionnel. Les données sensibles doivent être
> pseudonymisées avant toute requête.
>
> *Sources : Guide pratique CNB sur l'IA générative (2024) ; Guide CNB sur la*
> *déontologie et l'intelligence artificielle (assemblée générale du 13 mars 2026).*

> ⚠️ **Disclaimer.** Fourni « tel quel », sans garantie. Vérifiez toujours
> l'anonymisation avant transmission à un tiers (y compris une IA).
> Voir [LICENSE](LICENSE), sections 7 et 8.

---

## L'esprit du projet

Siegfried2 est un projet amateur, écrit au fil des soirs et des week-ends, avec davantage de curiosité que de formation formelle en développement. L'outil fonctionne, il rend service, mais il reste perfectible.

Rien n'est vendu, rien n'est monétisé. Le code est librement réutilisable sous Apache 2.0. Les suggestions, issues et pull requests sont accueillies avec plaisir (voir [CONTRIBUTING.md](CONTRIBUTING.md)).

L'objectif tient en une phrase : mettre à disposition un petit outil local, sans prétention, qui facilite le travail avec une IA dans le respect des règles déontologiques sur le traitement des données sensibles.

---

## Fonctionnalités

* **Import multi-formats** : PDF, DOCX, RTF, TXT, avec OCR `tesseract -l fra` en fallback pour les pages scannées.
* **Détection PII avec validation checksum** : 16 catégories reconnues, IBAN (MOD-97), SIREN (Luhn), NIR (clé 97), emails, téléphones, adresses FR.
* **Pseudonymisation réversible cohérente** : « Dupont » reçoit le même pseudonyme dans tous les documents du corpus, pour que l'IA puisse raisonner sur les relations.
* **Post-traitement inspiré des *juritools* de la Cour de cassation** : propagation multi-occurrences, détection de variantes orthographiques (Levenshtein ≤ 2), reclassification date procédurale / date de naissance, recoupement personne physique / morale.
* **Ajout manuel d'entités** : sélection de texte, barre de recherche, fusion d'entités adjacentes.
* **Export chiffré optionnel** : la table de correspondance peut être chiffrée AES-GCM (PBKDF2-SHA256, 200k itérations) avant export.
* **Outils externes bundlés** : poppler et tesseract embarqués, builds universels (arm64 + x86_64) auto-portants.
* **Progrès par page, annulation à chaud** : pipeline d'extraction asynchrone avec événements de progression.

---

## Pipeline

```
 ┌──────────┐    ┌──────────────┐    ┌───────────────┐    ┌────────────┐    ┌──────────┐
 │  PDF(s)  │──▶ │  pdftotext   │──▶ │  Analyse PII  │──▶ │ Validation │──▶ │  Export  │
 │  DOCX    │    │   + OCR fr   │    │  regex + NER  │    │  humaine   │    │  3 files │
 │  RTF/TXT │    │   (300 dpi)  │    │  + checksums  │    │            │    │          │
 └──────────┘    └──────────────┘    └───────────────┘    └────────────┘    └──────────┘
                                                                                  │
                                                                                  ▼
                                                           texte_anonymise.txt
                                                           texte_anonymise.mapping.json   (chiffrable)
                                                           texte_anonymise.original.txt
```

1. **Import** : sélection via fenêtre native (drag depuis le Finder supporté).
2. **Extraction** : `pdftotext -layout` par page ; si le texte est vide ou < 20 caractères, rendu PNG 300dpi puis `tesseract -l fra`.
3. **Analyse PII** : regex FR + checksums (Luhn / MOD-97 / clé NIR) + heuristique noms (civilités + séquences capitalisées Unicode).
4. **Validation** : l'utilisateur valide ou décoche chaque entité dans le panneau latéral.
5. **Export** : trois fichiers côte à côte :
   * `texte_anonymise.txt` : texte avec pseudonymes
   * `texte_anonymise.mapping.json` : table pseudonyme → original, pour ré-identifier la réponse de l'IA
   * `texte_anonymise.original.txt` : archivage du texte brut concaténé

---

## Catégories PII détectées

| Catégorie | Méthode | Validation |
| --- | --- | --- |
| `PERSONNE` | Civilités + séquences capitalisées Unicode | Particules grammaticales filtrées |
| `EMAIL` | Regex RFC simplifiée | (pas de checksum) |
| `TEL` | Formats FR + internationaux | (pas de checksum) |
| `ADRESSE` | Numéro + voie + code postal | (pas de checksum) |
| `NIR` | 15 chiffres | Clé `97 − (num mod 97)` |
| `IBAN` | 27 caractères FR | MOD-97 |
| `SIREN` | 9 / 14 chiffres | Luhn |
| `DATE` | Formats FR (JJ/MM/AAAA, littéraux) | Reclassement procédural / naissance |

Les catégories *avocat* et *magistrat* sont détectées mais **désactivées par défaut** conformément à la délibération CNIL 01-057.

**Cohérence cross-corpus** : toute occurrence d'une même entité reçoit le même pseudonyme dans tout le corpus, pour que l'IA puisse raisonner sur les relations.

---

## Installation

### Prérequis (macOS)

```
brew install poppler tesseract tesseract-lang
```

* **poppler** : `pdfinfo`, `pdftotext`, `pdftoppm`
* **tesseract** + **tesseract-lang** : OCR français (`fra`)

### Développement

```
bun install
bun run tauri dev
```

### Build (`.app` macOS universel)

```
bun run tauri build
```

Binaire généré dans `src-tauri/target/release/bundle/macos/`.

---

## Architecture

```
siegfried/
├── src-tauri/                 Backend Rust
│   └── src/
│       ├── lib.rs             commandes Tauri (extract_pdfs, check_tools)
│       └── pdf_extract.rs     pdftotext + pdftoppm + tesseract
└── src/                       Frontend React + TypeScript
    ├── App.tsx
    ├── store.ts               Zustand persistant
    ├── components/            Dropzone, FileList, TextViewer, EntityPanel, ExportPanel, SearchBar
    └── lib/
        ├── regex-fr.ts        patterns FR + checksums
        ├── anonymizer.ts      orchestration regex + heuristique noms + dédup
        ├── pseudo-map.ts      table de correspondance cohérente
        └── types.ts
```

**Stack** : Tauri 2, Rust stable, React 19, TypeScript 5.8, Zustand 5, Vite 7, Bun.

---

## Tests

```
bun run test                          # régression moteur d'anonymisation
cd src-tauri && cargo test --lib      # backend Rust (extraction + OCR)
bunx tsc --noEmit                     # typecheck strict
```

Pour générer les fixtures PDF nécessaires aux tests Rust :

```
mkdir -p /tmp/siegfried-test && cd /tmp/siegfried-test
cat > sample.txt <<'EOF'
Monsieur Jean DUPONT
IBAN FR14 2004 1010 0505 0001 3M02 606
SIREN 123 456 782
EOF
cupsfilter sample.txt > sample.pdf
pdftoppm -r 200 -png sample.pdf scan && sips -s format pdf scan-1.png --out scanned.pdf
```

---

## Sécurité et confidentialité

* **Aucun appel réseau.** Le binaire ne tente aucune connexion sortante.
* **Aucune télémétrie.** Pas d'analytics, pas de crash reports, pas d'identifiant machine.
* **Scope filesystem restreint** : accès limité à `$HOME`, `$DESKTOP`, `$DOCUMENT`.
* **Chiffrement client optionnel** du `mapping.json` : AES-GCM, PBKDF2-SHA256, 200k itérations.
* **État persistant versionné** : invalidation des snapshots incompatibles pour éviter les fuites inter-versions.

Un problème de sécurité ? Voir [SECURITY.md](SECURITY.md). Merci de **ne pas** ouvrir d'issue publique.

---

## Contribuer

Lire [CONTRIBUTING.md](CONTRIBUTING.md). Trois règles d'or :

1. **Rester 100 % local** : zéro appel réseau.
2. **Domaine juridique français d'abord** : NIR, SIREN, civilité, juridictions.
3. **Garder le cœur minimal** : discuter les gros ajouts en issue avant PR.

Les retours sont bienvenus, même (et surtout) pour signaler ce qui paraît bancal dans le code.

---

## Hors scope actuel

* Batch CLI headless.
* Détection de noms via NER ML (transformers.js + CamemBERT), actuellement heuristique.
* Signature et notarisation Apple Developer pour distribution sans Gatekeeper.

---

## Licence

Apache License 2.0, voir [LICENSE](LICENSE). Attributions des dépendances tierces dans [NOTICE](NOTICE).

Les sections 7 (*Disclaimer of Warranty*) et 8 (*Limitation of Liability*) s'appliquent intégralement : l'auteur n'est pas responsable des conséquences d'un usage du logiciel, y compris en cas de défaut d'anonymisation. L'utilisateur doit vérifier manuellement la sortie avant toute transmission à un tiers.

---

**Marc Sztulman** · Développeur amateur. Projet partagé avec plaisir, suggestions et pull requests bienvenues.

*© 2026*
