import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";

const SUPPORTED_EXTENSIONS = ["pdf", "docx", "rtf", "txt", "text", "md", "csv"];

function isSupportedFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.includes(ext);
}

export function Dropzone() {
  const addFiles = useStore((s) => s.addFiles);
  const [dragging, setDragging] = useState(false);

  async function pick() {
    const selected = await open({
      multiple: true,
      filters: [
        { name: "Documents", extensions: SUPPORTED_EXTENSIONS },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    addFiles(paths);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const paths = files
      .filter((f) => isSupportedFile(f.name))
      .map((f) => (f as unknown as { path: string }).path)
      .filter(Boolean);
    if (paths.length > 0) addFiles(paths);
  }

  return (
    <div
      className={`dropzone${dragging ? " dragging" : ""}`}
      onClick={pick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dropzone-icon">📄</div>
      <div className="dropzone-text">
        {dragging ? "Relacher pour ajouter" : "Cliquer ou glisser des documents"}
      </div>
      <div className="dropzone-hint">PDF, Word, RTF, TXT — 100% local</div>
    </div>
  );
}
