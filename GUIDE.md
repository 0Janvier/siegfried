# Guide de l'utilisateur — Siegfried

**Anonymiseur PDF 100 % local pour avocats.**

Ce guide s'adresse à un utilisateur sans connaissance technique. Il vous
accompagne, en quelques minutes, du premier lancement à l'export d'un
document prêt à être transmis à une IA générative dans le respect du secret
professionnel.

---

## Sommaire

1. [À qui s'adresse ce guide](#1-à-qui-sadresse-ce-guide)
2. [Installation](#2-installation)
3. [Premier lancement](#3-premier-lancement)
4. [Le workflow en 5 étapes](#4-le-workflow-en-5-étapes)
5. [Utiliser le texte avec une IA](#5-utiliser-le-texte-avec-une-ia)
6. [Ré-identifier la réponse de l'IA](#6-ré-identifier-la-réponse-de-lia)
7. [Raccourcis clavier](#7-raccourcis-clavier)
8. [Questions fréquentes](#8-questions-fréquentes)
9. [Rappels déontologiques](#9-rappels-déontologiques)

---

## 1. À qui s'adresse ce guide

Vous êtes avocat ou juriste. Vous souhaitez utiliser un outil d'IA générative
(ChatGPT, Claude, Mistral, etc.) pour gagner du temps sur la rédaction, la
recherche ou la relecture, **sans transmettre à un serveur tiers les données
couvertes par le secret professionnel**.

Siegfried pseudonymise vos documents localement (sur votre Mac) avant que
vous les copiez vers l'IA, et vous permet de **ré-identifier** la réponse une
fois celle-ci revenue. Rien ne quitte votre machine à aucun moment.

---

## 2. Installation

### Prérequis

- Un Mac sous **macOS 11 (Big Sur) ou supérieur**
- Accès à un Terminal (Applications → Utilitaires → Terminal)

### Étape 1 — Installer les outils nécessaires

Dans le Terminal, coller la ligne suivante et valider :

```bash
brew install poppler tesseract tesseract-lang
```

Si `brew` n'est pas reconnu, installer d'abord Homebrew :

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Étape 2 — Installer Siegfried

Deux chemins possibles :

**A. Fichier `.app` distribué**  
Si vous avez reçu un fichier `siegfried.app`, glissez-le dans votre dossier
*Applications*. Au premier lancement, macOS peut afficher un avertissement
(*« développeur non vérifié »*). Clic droit sur l'icône → **Ouvrir** →
**Ouvrir** à nouveau. Cette étape n'est à faire qu'une seule fois.

**B. Version développeur (pour les technophiles)**  
Cloner le dépôt et lancer en mode développement :

```bash
git clone https://github.com/0Janvier/siegfried.git
cd siegfried
bun install
bun run tauri dev
```

---

## 3. Premier lancement

Au lancement, Siegfried affiche une interface en trois colonnes :

| Colonne gauche | Colonne centrale | Colonne droite |
| --- | --- | --- |
| Vos documents + actions | Le texte extrait | Les entités détectées |

Si le bandeau en haut affiche *« Outils manquants »*, c'est que l'étape
`brew install` ci-dessus n'a pas été exécutée. Revenez à la section 2.

---

## 4. Le workflow en 5 étapes

### Étape 1 — Ajouter vos documents

Deux façons :

- **Glisser-déposer** depuis le Finder dans la zone prévue.
- Ou cliquer sur la zone pour ouvrir le sélecteur de fichiers.

Formats acceptés : **PDF, DOCX, RTF, TXT, MD, CSV**. Vous pouvez ajouter
plusieurs fichiers en une seule opération.

Dans la liste qui apparaît, vous pouvez :
- Réordonner (flèches ↑ ↓) — l'ordre détermine la concaténation du texte final
- Supprimer un fichier (×)
- Tout effacer

### Étape 2 — Extraire le texte

Cliquer sur le bouton **« 1. Extraire le texte »**.

Siegfried extrait le texte page par page. Pour les pages scannées (images),
un moteur OCR français bascule automatiquement en relais. Une barre de
progression indique l'avancement (*Fichier 1/3 — contrat.pdf p.5/28*).
Vous pouvez **Annuler** à tout moment.

Une fois terminé, le texte apparaît dans la colonne centrale, précédé de
séparateurs qui indiquent le fichier et la page d'origine :

```
=== contrat.pdf — page 1 ===

Entre :
Monsieur Jean DUPONT, né le 15/03/1978,
demeurant 12 rue de la République 75011 PARIS...
```

### Étape 3 — Analyser les données personnelles

Cliquer sur **« 2. Analyser PII »** (Personal Identifiable Information).

Siegfried détecte automatiquement, avec validation cryptographique des
checksums (Luhn, MOD-97, clé NIR) :

- Noms de personnes
- Emails, téléphones, adresses postales
- NIR (numéros de sécurité sociale)
- IBAN, SIREN / SIRET
- Dates de naissance
- Juridictions, numéros de dossier / RG
- Plaques d'immatriculation

Les entités détectées apparaissent **surlignées** dans le texte (chaque
catégorie a sa couleur), et listées dans le panneau de droite.

> **Note importante.** Les avocats et magistrats détectés sont
> **désactivés par défaut** conformément à la délibération CNIL 01-057
> (les professionnels du droit ne sont pas des parties à anonymiser).

### Étape 4 — Valider et ajuster

C'est l'étape la plus importante. Siegfried fait une première passe, mais
**la décision finale vous appartient**.

Dans le panneau de droite :
- **Décocher** une entité la laisse en clair dans l'export
- **Cocher une catégorie entière** active/désactive tout le groupe
- **Supprimer** (×) retire l'entité de la pseudonymisation

Dans le texte central :
- **Clic** sur un surlignage → menu pour désactiver ou supprimer
- **Sélection** d'un texte non détecté → menu pour qualifier manuellement
  (*Personne*, *Adresse*, etc.) et l'ajouter
- **Barre de recherche** en haut : cherchez un terme précis, puis
  « Anonymiser » pour l'ajouter en lot
- **Fusionner** deux entités adjacentes : Cmd+clic sur les deux, puis
  *Fusionner* dans le panneau droit

Vous pouvez **basculer en mode aperçu** (onglet « Anonymisé ») pour voir
le rendu final à tout moment.

### Étape 5 — Exporter

Deux options :

**A. Copier dans le presse-papier**  
Bouton *« Copier le texte anonymisé »*. Prêt à coller dans ChatGPT ou une
autre IA.

**B. Exporter trois fichiers**  
Bouton *« Exporter »*. Siegfried propose un chemin et crée :

1. `texte_anonymise.txt` — le texte avec les pseudonymes (*PERSONNE_001*,
   *IBAN_001*…)
2. `texte_anonymise.mapping.json` — la table de correspondance
   pseudonyme → original
3. `texte_anonymise.original.txt` — le texte brut d'origine pour archive

**Chiffrement recommandé du mapping**  
La case *« Chiffrer le mapping »* est activée par défaut. À l'export,
Siegfried vous demande une **passphrase** (minimum 8 caractères,
confirmation). Le fichier produit porte l'extension `.mapping.enc.json`
et est chiffré en AES-GCM avec dérivation PBKDF2-SHA256 (200 000 itérations).

Conservez la passphrase : sans elle, le mapping est irrécupérable.

---

## 5. Utiliser le texte avec une IA

Une fois le texte anonymisé copié ou exporté :

1. Ouvrir votre IA préférée dans un navigateur (ChatGPT, Claude, Mistral…)
2. Coller le texte (`Cmd+V`)
3. Formuler votre demande comme d'habitude
4. L'IA vous répond — sa réponse contient les pseudonymes
   (*PERSONNE_001*, *IBAN_001*…)

**Important.** Ne mentionnez jamais, dans votre prompt ou votre
conversation avec l'IA, les noms ou données réelles. Traitez-les
intégralement comme des pseudonymes.

> Exemple de prompt :  
> *« Rédige une mise en demeure à partir de ces éléments :
> PERSONNE_001 réclame à PERSONNE_MORALE_001 le paiement de 12 000 €
> pour la facture DATE_001… »*

---

## 6. Ré-identifier la réponse de l'IA

Une fois la réponse de l'IA reçue :

1. **Copier** la réponse de l'IA dans un éditeur de texte (TextEdit, Notes…)
2. Ouvrir le fichier `texte_anonymise.mapping.json` (ou sa version chiffrée
   avec la passphrase — un outil tiers sera nécessaire pour la v0.1, ou
   bien la version non chiffrée si vous l'avez conservée en local)
3. **Remplacer** chaque pseudonyme par sa valeur originale, via la fonction
   *Rechercher-Remplacer* (`Cmd+F` puis *Remplacer*) :
   - `PERSONNE_001` → `Jean DUPONT`
   - `IBAN_001` → `FR14 2004 1010 0505 0001 3M02 606`
   - etc.

Le texte devient alors à nouveau identifiable et utilisable.

> **À venir.** Une fonction de ré-identification automatique directement
> dans Siegfried est envisagée pour une version ultérieure.

---

## 7. Raccourcis clavier

| Raccourci | Action |
| --- | --- |
| **Tab** | Passer à l'entité suivante |
| **Shift + Tab** | Revenir à l'entité précédente |
| **Espace** | Activer / désactiver l'entité sélectionnée |
| **Cmd + C** | Copier le texte anonymisé (si aucune sélection) |
| **Cmd + clic** | Sélection multiple d'entités (pour fusionner) |
| **Échap** | Fermer un menu contextuel ou la boîte de recherche |

---

## 8. Questions fréquentes

### Mes données partent-elles sur Internet ?

**Non.** Siegfried n'effectue aucun appel réseau. Tout se passe dans la
mémoire de votre Mac. Vous pouvez couper votre Wi-Fi avant utilisation si
vous voulez en être absolument certain — l'application continuera de
fonctionner normalement.

### Que se passe-t-il si je ferme l'application sans exporter ?

Les documents ajoutés, le texte extrait et les entités validées sont
**conservés localement** dans votre navigateur d'application. Au prochain
lancement, vous retrouvez votre travail en l'état. Utilisez le bouton
*« Tout effacer »* dans la liste de fichiers pour repartir de zéro.

### Siegfried détecte-t-il 100 % des données personnelles ?

**Non, et aucun outil ne peut le garantir.** Siegfried utilise des règles
(regex + heuristiques) très complètes pour le français juridique, mais :
- Des noms rares ou des formats atypiques peuvent passer à travers
- Inversement, des faux positifs sont possibles (un mot en majuscules
  qui n'est pas un nom)

**C'est pour cette raison que l'étape 4 (validation humaine) est cruciale.**
Vous devez passer en revue la liste d'entités, ajouter manuellement ce qui
manque (sélection + qualification), et désactiver les faux positifs. Une
relecture finale du texte anonymisé avant copie est recommandée.

### Puis-je utiliser Siegfried pour un dossier volumineux ?

Oui. L'extraction gère plusieurs centaines de pages. La barre de
progression affiche l'avancement page par page, et vous pouvez annuler à
tout moment sans perte.

Pour les très gros dossiers (> 500 pages), prévoyez quelques minutes pour
l'extraction initiale avec OCR.

### Le mapping chiffré, comment le lire ?

Pour la version 0.1, le chiffrement est conçu comme une **protection
au repos** — si le fichier tombe entre de mauvaises mains, il est illisible
sans la passphrase. La ré-identification de la réponse IA se fait
actuellement manuellement via la version non chiffrée que vous conservez
en local. Une fonction de déchiffrement dans l'application est prévue.

### Que faire si les outils externes sont signalés manquants ?

Siegfried s'appuie sur `poppler` (extraction PDF) et `tesseract` (OCR). Si
vous installez Siegfried via un `.app` distribué, ces outils sont inclus.
Si vous êtes en mode développeur ou si le message apparaît quand même :

```bash
brew install poppler tesseract tesseract-lang
```

Puis relancer Siegfried.

---

## 9. Rappels déontologiques

Le Conseil national des barreaux a adopté, lors de son assemblée générale
du 13 mars 2026, un **Guide sur la déontologie et l'intelligence
artificielle**, qui complète son *Guide pratique sur l'IA générative* de
septembre 2024. Ces deux textes posent une règle ferme :

> L'avocat ne transmet jamais à un système d'IA générative des données
> couvertes par le secret professionnel. Toute donnée sensible doit être
> pseudonymisée ou anonymisée avant transmission, sous peine de sanctions
> disciplinaires.

Siegfried est conçu pour vous aider à respecter cette obligation, mais
ne vous en décharge pas. Trois rappels :

1. **La responsabilité finale vous appartient.** Vérifiez manuellement le
   texte avant de le coller dans une IA.
2. **Aucun outil de pseudonymisation n'est parfait.** La revue humaine
   (étape 4) est la garantie essentielle.
3. **Conservez une trace des échanges.** Le fichier `original.txt`
   archivé sert aussi à prouver la diligence en cas de contrôle.

**Disclaimer légal.** Siegfried est fourni « tel quel », sous licence
Apache 2.0. L'auteur n'est pas responsable des conséquences d'un usage
du logiciel, y compris en cas de défaut d'anonymisation. Voir les
sections 7 et 8 de la [licence](LICENSE).

---

## Ressources complémentaires

- **Guide pratique CNB sur l'IA générative** (septembre 2024)
- **Guide CNB sur la déontologie et l'IA** (assemblée générale du
  13 mars 2026)
- Délibération **CNIL n° 01-057** sur l'anonymisation en matière juridique
- Dépôt du projet : <https://github.com/0Janvier/siegfried>
- Signaler un problème de sécurité : [SECURITY.md](SECURITY.md) — ne
  **jamais** ouvrir d'issue publique pour une vulnérabilité

---

*Marc Sztulman · Développeur amateur, avocat par ailleurs. © 2026.*
