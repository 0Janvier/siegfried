import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Dropzone } from "./components/Dropzone";
import { FileList } from "./components/FileList";
import { TextViewer } from "./components/TextViewer";
import { EntityPanel } from "./components/EntityPanel";
import { ExportPanel } from "./components/ExportPanel";
import { AboutModal } from "./components/AboutModal";
import { useStore } from "./store";
import { analyze } from "./lib/anonymizer";
import { applyPseudonyms } from "./lib/pseudo-map";
import type { ExtractedPage } from "./lib/types";
import "./App.css";

export default function App() {
  const files = useStore((s) => s.files);
  const text = useStore((s) => s.text);
  const busy = useStore((s) => s.busy);
  const status = useStore((s) => s.status);
  const entities = useStore((s) => s.entities);
  const toolWarnings = useStore((s) => s.toolWarnings);
  const setBusy = useStore((s) => s.setBusy);
  const setPages = useStore((s) => s.setPages);
  const setEntities = useStore((s) => s.setEntities);
  const setToolWarnings = useStore((s) => s.setToolWarnings);
  const toggleEntity = useStore((s) => s.toggleEntity);
  const selectedIndices = useStore((s) => s.selectedIndices);
  const selectEntity = useStore((s) => s.selectEntity);
  const pendingReplace = useStore((s) => s.pendingReplace);
  const applyReplace = useStore((s) => s.applyReplace);
  const dismissReplace = useStore((s) => s.dismissReplace);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    invoke<[string, boolean][]>("check_tools").then((results) => {
      const missing = results.filter(([, ok]) => !ok).map(([name]) => name);
      if (missing.length > 0) setToolWarnings(missing);
    });
  }, [setToolWarnings]);

  // Redaction progress listener (installed once for the whole session)
  useEffect(() => {
    const unlisten = listen<{ file: string; page: number; total_pages: number }>(
      "redact:progress",
      (ev) => {
        const { file, page, total_pages } = ev.payload;
        const name = file.split("/").pop() ?? file;
        useStore.getState().setBusy(true, `Caviardage — ${name} p.${page}/${total_pages}`);
      }
    );
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (entities.length === 0) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const arr = Array.from(selectedIndices);
        const current = arr.length > 0 ? Math.max(...arr) : -1;
        let next = current + dir;
        if (next < 0) next = entities.length - 1;
        if (next >= entities.length) next = 0;
        selectEntity(next, false);
      }

      if (e.key === " " && selectedIndices.size === 1) {
        e.preventDefault();
        toggleEntity(Array.from(selectedIndices)[0]);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c" && !window.getSelection()?.toString()) {
        e.preventDefault();
        const anonymized = applyPseudonyms(text, entities);
        navigator.clipboard.writeText(anonymized);
        useStore.getState().setBusy(false, "Texte anonymise copie");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entities, selectedIndices, text, toggleEntity, selectEntity]);

  async function doExtract() {
    setBusy(true, "Extraction en cours…");
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<{ file: string; page: number; total_pages: number; file_index: number; file_count: number; used_ocr: boolean }>(
        "extract:progress",
        (ev) => {
          const { file, page, total_pages, file_index, file_count, used_ocr } = ev.payload;
          const name = file.split("/").pop() ?? file;
          const ocrTag = used_ocr ? " (OCR)" : "";
          useStore.getState().setBusy(true, `Fichier ${file_index + 1}/${file_count} — ${name} p.${page}/${total_pages}${ocrTag}`);
        }
      );
      const paths = files.map((f) => f.path);
      const pages = await invoke<ExtractedPage[]>("extract_files", { paths });
      setPages(pages);
      setBusy(false, `${pages.length} page(s) extraite(s)`);
    } catch (e) {
      setBusy(false, `Erreur extraction : ${e}`);
    } finally {
      unlisten?.();
    }
  }

  async function doCancel() {
    try {
      await invoke("cancel_extraction");
      setBusy(false, "Annulation demandee…");
    } catch {}
  }

  function doAnalyze() {
    setBusy(true, "Detection des donnees personnelles…");
    try {
      const result = analyze(text);
      setEntities(result.entities, result.pseudoMap);
      const s = result.stats;
      const parts = [`${s.total} entite(s)`];
      if (s.propagated > 0) parts.push(`${s.propagated} propagee(s)`);
      if (s.variants > 0) parts.push(`${s.variants} variante(s)`);
      if (s.procedural > 0) parts.push(`${s.procedural} date(s) procedure exclue(s)`);
      setBusy(false, parts.join(" | "));
    } catch (e) {
      setBusy(false, `Erreur analyse : ${e}`);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Siegfried</h1>
        <span className="subtitle">Anonymiseur de documents</span>
        {status && <span className="status">{status}</span>}
        <button
          className="btn-about"
          onClick={() => setAboutOpen(true)}
          aria-label="À propos"
          title="À propos"
        >
          ⓘ
        </button>
      </header>
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {busy && (
        <div className="progress-wrapper">
          <div className="progress-bar"><div className="progress-bar-fill" /></div>
          <button className="btn-ghost btn-cancel" onClick={doCancel}>Annuler</button>
        </div>
      )}

      {pendingReplace && (
        <div className="replace-bar">
          <span>
            "{pendingReplace.needle}" : {pendingReplace.count} occurrence{pendingReplace.count > 1 ? "s" : ""} chevauchent des entites existantes
          </span>
          <button className="btn-replace" onClick={applyReplace}>
            Remplacer
          </button>
          <button className="btn-ghost" onClick={dismissReplace}>
            Ignorer
          </button>
        </div>
      )}

      {toolWarnings.length > 0 && (
        <div className="tool-warning">
          Outils manquants : {toolWarnings.join(", ")}. Installez-les avec <code>brew install poppler tesseract tesseract-lang</code>
        </div>
      )}

      <div className="app-body">
        <aside className="sidebar-left">
          <Dropzone />
          <FileList />
          <div className="actions">
            <button
              className="btn-primary"
              disabled={busy || files.length === 0}
              onClick={doExtract}
            >
              1. Extraire le texte
            </button>
            <button
              className="btn-primary"
              disabled={busy || text.length === 0}
              onClick={doAnalyze}
            >
              2. Analyser PII
            </button>
            <ExportPanel />
          </div>
        </aside>

        <main className="main">
          <TextViewer />
        </main>

        <aside className="sidebar-right">
          <EntityPanel />
        </aside>
      </div>
    </div>
  );
}
