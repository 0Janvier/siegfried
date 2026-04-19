import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";
import { applyPseudonyms } from "../lib/pseudo-map";
import { encryptJson } from "../lib/crypto";

export function ExportPanel() {
  const text = useStore((s) => s.text);
  const entities = useStore((s) => s.entities);
  const pseudoMap = useStore((s) => s.pseudoMap);
  const setBusy = useStore((s) => s.setBusy);
  const [encrypt, setEncrypt] = useState(true);

  const canExport = text.length > 0 && entities.length > 0 && pseudoMap !== null;

  async function doExport() {
    if (!pseudoMap) return;
    const target = await save({
      defaultPath: "texte_anonymise.txt",
      filters: [{ name: "Texte", extensions: ["txt"] }],
    });
    if (!target) return;

    // Demande passphrase AVANT toute écriture si chiffrement activé
    let passphrase: string | null = null;
    if (encrypt) {
      passphrase = prompt(
        "Passphrase pour chiffrer le mapping (min. 8 caracteres) :"
      );
      if (!passphrase) {
        setBusy(false, "Export annule : passphrase manquante");
        return;
      }
      if (passphrase.length < 8) {
        setBusy(false, "Passphrase trop courte (min. 8 caracteres)");
        return;
      }
      const confirm = prompt("Confirmer la passphrase :");
      if (confirm !== passphrase) {
        setBusy(false, "Les passphrases ne correspondent pas");
        return;
      }
    }

    setBusy(true, "Export en cours…");
    try {
      const anonymized = applyPseudonyms(text, entities);
      await writeTextFile(target, anonymized);

      const base = target.replace(/\.txt$/, "");
      const mappingContent = {
        generated_at: new Date().toISOString(),
        app: "siegfried",
        entries: pseudoMap.toJSON(),
      };

      if (passphrase) {
        const encrypted = await encryptJson(mappingContent, passphrase);
        await writeTextFile(
          `${base}.mapping.enc.json`,
          JSON.stringify(encrypted, null, 2)
        );
      } else {
        await writeTextFile(
          `${base}.mapping.json`,
          JSON.stringify(mappingContent, null, 2)
        );
      }

      await writeTextFile(`${base}.original.txt`, text);

      const name = target.split("/").pop() || target;
      const mappingLabel = passphrase ? "mapping.enc.json" : "mapping.json";
      setBusy(false, `Export : ${name} + ${mappingLabel} + original`);
    } catch (e) {
      setBusy(false, `Erreur export : ${e}`);
    }
  }

  async function doCopy() {
    const anonymized = applyPseudonyms(text, entities);
    await navigator.clipboard.writeText(anonymized);
    setBusy(false, "Texte anonymise copie");
  }

  return (
    <>
      <label className="export-option">
        <input
          type="checkbox"
          checked={encrypt}
          onChange={(e) => setEncrypt(e.target.checked)}
        />
        Chiffrer le mapping (AES-GCM)
      </label>
      <button className="btn-secondary" disabled={!canExport} onClick={doCopy}>
        Copier le texte anonymise
      </button>
      <button className="btn-primary" disabled={!canExport} onClick={doExport}>
        Exporter (.txt + mapping)
      </button>
    </>
  );
}
