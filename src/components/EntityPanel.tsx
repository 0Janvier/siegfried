import { useState } from "react";
import { useStore } from "../store";
import { CATEGORY_COLORS, CATEGORY_LABELS, type PiiCategory } from "../lib/types";

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as PiiCategory[];

export function EntityPanel() {
  const entities = useStore((s) => s.entities);
  const toggle = useStore((s) => s.toggleEntity);
  const toggleCat = useStore((s) => s.toggleCategory);
  const removeEntity = useStore((s) => s.removeEntity);
  const selectedIndices = useStore((s) => s.selectedIndices);
  const selectEntity = useStore((s) => s.selectEntity);
  const clearSelection = useStore((s) => s.clearSelection);
  const mergeSelected = useStore((s) => s.mergeSelected);
  const [mergeOpen, setMergeOpen] = useState(false);

  if (entities.length === 0) {
    return <div className="entity-panel empty">Aucune entite detectee.</div>;
  }

  const grouped = new Map<PiiCategory, { index: number; text: string; pseudonym: string; enabled: boolean }[]>();
  entities.forEach((e, index) => {
    if (!grouped.has(e.category)) grouped.set(e.category, []);
    grouped.get(e.category)!.push({ index, text: e.text, pseudonym: e.pseudonym, enabled: e.enabled });
  });

  const categories = Array.from(grouped.keys()).sort();
  const enabledCount = entities.filter((e) => e.enabled).length;
  const canMerge = selectedIndices.size >= 2;

  function doMerge(category: PiiCategory) {
    mergeSelected(category);
    setMergeOpen(false);
  }

  return (
    <div className="entity-panel">
      <div className="entity-panel-header">
        Entites detectees ({enabledCount}/{entities.length})
      </div>

      {canMerge && (
        <div className="merge-bar">
          <span className="merge-info">{selectedIndices.size} selectionnes</span>
          <button className="btn-merge" onClick={() => setMergeOpen(!mergeOpen)}>
            Fusionner
          </button>
          <button className="btn-ghost" onClick={clearSelection}>Annuler</button>
          {mergeOpen && (
            <div className="merge-picker">
              {ALL_CATEGORIES.map((cat) => (
                <button key={cat} className="popover-item" onClick={() => doMerge(cat)}>
                  <span className="popover-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="entity-hint">
        {!canMerge && selectedIndices.size === 0 && entities.length > 0 && (
          <span>Cmd+clic pour selectionner puis fusionner</span>
        )}
      </div>

      {categories.map((cat) => {
        const items = grouped.get(cat)!;
        const catEnabled = items.filter((i) => i.enabled).length;
        const allEnabled = catEnabled === items.length;
        const seen = new Set<string>();
        return (
          <div key={cat} className="entity-group">
            <div
              className="entity-group-title"
              style={{ borderLeft: `3px solid ${CATEGORY_COLORS[cat]}` }}
            >
              <label className="entity-group-toggle">
                <input
                  type="checkbox"
                  checked={allEnabled}
                  ref={(el) => { if (el) el.indeterminate = catEnabled > 0 && !allEnabled; }}
                  onChange={() => toggleCat(cat)}
                />
                {CATEGORY_LABELS[cat]} ({items.length})
              </label>
            </div>
            {items.map((item) => {
              const key = `${item.text}::${item.pseudonym}`;
              if (seen.has(key)) return null;
              seen.add(key);
              const isSelected = selectedIndices.has(item.index);
              return (
                <div
                  key={item.index}
                  role="button"
                  tabIndex={0}
                  className={`entity-item${isSelected ? " selected" : ""}`}
                  onClick={(e) => selectEntity(item.index, e.metaKey || e.ctrlKey)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectEntity(item.index, e.metaKey || e.ctrlKey); } }}
                >
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(ev) => { ev.stopPropagation(); toggle(item.index); }}
                  />
                  <span className="entity-text">{item.text}</span>
                  <span className="entity-pseudo">{item.pseudonym}</span>
                  <button
                    className="entity-remove"
                    title="Supprimer"
                    onClick={(ev) => { ev.stopPropagation(); removeEntity(item.index); }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
