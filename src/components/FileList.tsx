import { useStore } from "../store";

export function FileList() {
  const files = useStore((s) => s.files);
  const removeFile = useStore((s) => s.removeFile);
  const moveFile = useStore((s) => s.moveFile);
  const clearFiles = useStore((s) => s.clearFiles);

  if (files.length === 0) return null;

  return (
    <div className="file-list">
      <div className="file-list-header">
        <span>{files.length} fichier(s)</span>
        <button className="btn-ghost" onClick={clearFiles}>Tout effacer</button>
      </div>
      {files.map((f, i) => (
        <div key={f.path} className="file-item">
          <div className="file-order">
            <button disabled={i === 0} onClick={() => moveFile(i, i - 1)}>↑</button>
            <button disabled={i === files.length - 1} onClick={() => moveFile(i, i + 1)}>↓</button>
          </div>
          <div className="file-name" title={f.path}>{f.name}</div>
          <button className="btn-ghost" onClick={() => removeFile(f.path)}>✕</button>
        </div>
      ))}
    </div>
  );
}
