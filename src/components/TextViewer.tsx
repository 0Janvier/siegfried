import { useCallback, useRef, useState } from "react";
import { useStore } from "../store";
import { CATEGORY_COLORS, CATEGORY_LABELS, type PiiCategory } from "../lib/types";
import { applyPseudonyms } from "../lib/pseudo-map";
import { SearchBar } from "./SearchBar";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as PiiCategory[];

interface PendingSelection {
  start: number;
  end: number;
  selectedText: string;
  x: number;
  y: number;
}

export function TextViewer() {
  const text = useStore((s) => s.text);
  const entities = useStore((s) => s.entities);
  const addEntity = useStore((s) => s.addEntity);
  const removeEntity = useStore((s) => s.removeEntity);
  const toggleEntity = useStore((s) => s.toggleEntity);
  const previewMode = useStore((s) => s.previewMode);
  const setPreviewMode = useStore((s) => s.setPreviewMode);
  const selectedIndices = useStore((s) => s.selectedIndices);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [entityPopover, setEntityPopover] = useState<{ index: number; x: number; y: number } | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const handleMouseUp = useCallback(() => {
    if (previewMode) return;
    if (!preRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    if (!preRef.current.contains(range.commonAncestorContainer)) return;

    const selectedText = sel.toString();
    if (selectedText.trim().length === 0) return;

    const startOffset = getTextOffsetFromDataAttr(range.startContainer, range.startOffset);
    const endOffset = getTextOffsetFromDataAttr(range.endContainer, range.endOffset);
    if (startOffset === -1 || endOffset === -1 || startOffset >= endOffset) return;

    const rect = range.getBoundingClientRect();
    // Clamp popover within viewport
    const popW = 200;
    const popH = 320;
    let x = rect.left + rect.width / 2;
    let y = rect.bottom + 6;
    if (x - popW / 2 < 8) x = popW / 2 + 8;
    if (x + popW / 2 > window.innerWidth - 8) x = window.innerWidth - popW / 2 - 8;
    if (y + popH > window.innerHeight - 8) y = rect.top - popH - 6;

    setPending({ start: startOffset, end: endOffset, selectedText, x, y });
  }, [previewMode]);

  function pickCategory(category: PiiCategory) {
    if (!pending) return;
    addEntity(pending.start, pending.end, pending.selectedText, category);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  function dismiss() {
    setPending(null);
    setEntityPopover(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleMarkClick(e: React.MouseEvent, entityIndex: number) {
    e.stopPropagation();
    // Don't show entity popover if user is selecting text
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setEntityPopover({
      index: entityIndex,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
    });
    setPending(null);
  }

  if (!text) {
    return <div className="text-viewer empty">Le texte extrait apparaitra ici.</div>;
  }

  const showSearch = text.length > 0;
  const hasEntities = entities.length > 0;

  if (previewMode) {
    const anonymized = applyPseudonyms(text, entities);
    return (
      <div className="text-viewer-wrapper">
        {showSearch && <SearchBar />}
        <div className="viewer-toolbar">
          <button className={`viewer-tab${!previewMode ? " active" : ""}`} onClick={() => setPreviewMode(false)}>Original</button>
          <button className={`viewer-tab${previewMode ? " active" : ""}`} onClick={() => setPreviewMode(true)}>Anonymise</button>
        </div>
        <pre className="text-viewer preview">{anonymized}</pre>
      </div>
    );
  }

  // Build chunks with data-offset attributes for reliable offset calculation
  const enabled = entities.filter((e) => e.enabled).sort((a, b) => a.start - b.start);
  const chunks: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const e of enabled) {
    if (e.start < cursor) continue;
    if (e.start > cursor) {
      chunks.push(<span key={key++} data-offset={cursor}>{text.slice(cursor, e.start)}</span>);
    }
    const entityIndex = entities.indexOf(e);
    const isSelected = selectedIndices.has(entityIndex);
    chunks.push(
      <mark
        key={key++}
        data-offset={e.start}
        className={`pii${isSelected ? " pii-selected" : ""}`}
        style={{ background: CATEGORY_COLORS[e.category], cursor: "pointer" }}
        title={`${e.category} → ${e.pseudonym}`}
        onClick={(ev) => handleMarkClick(ev, entityIndex)}
      >
        {text.slice(e.start, e.end)}
      </mark>
    );
    cursor = e.end;
  }
  if (cursor < text.length) {
    chunks.push(<span key={key++} data-offset={cursor}>{text.slice(cursor)}</span>);
  }

  return (
    <div className="text-viewer-wrapper">
      {showSearch && <SearchBar />}
      {hasEntities && (
        <div className="viewer-toolbar">
          <button className={`viewer-tab${!previewMode ? " active" : ""}`} onClick={() => setPreviewMode(false)}>Original</button>
          <button className={`viewer-tab${previewMode ? " active" : ""}`} onClick={() => setPreviewMode(true)}>Anonymise</button>
        </div>
      )}
      <pre className="text-viewer" ref={preRef} onMouseUp={handleMouseUp}>
        {chunks}
      </pre>
      {pending && (
        <>
          <div className="popover-backdrop" onClick={dismiss} />
          <div className="category-popover" style={{ left: pending.x, top: pending.y }}>
            <div className="popover-header">Qualifier : "{truncate(pending.selectedText, 30)}"</div>
            {CATEGORIES.map((cat) => (
              <button key={cat} className="popover-item" onClick={() => pickCategory(cat)}>
                <span className="popover-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </>
      )}
      {entityPopover && !pending && (() => {
        const ent = entities[entityPopover.index];
        if (!ent) return null;
        return (
          <>
            <div className="popover-backdrop" onClick={dismiss} />
            <div className="category-popover entity-actions" style={{ left: entityPopover.x, top: entityPopover.y }}>
              <div className="popover-header">
                <span className="popover-dot" style={{ background: CATEGORY_COLORS[ent.category] }} />
                {truncate(ent.text, 25)} — {CATEGORY_LABELS[ent.category]}
              </div>
              <button className="popover-item" onClick={() => { toggleEntity(entityPopover.index); setEntityPopover(null); }}>
                {ent.enabled ? "Desactiver" : "Reactiver"}
              </button>
              <button className="popover-item popover-item-danger" onClick={() => { removeEntity(entityPopover.index); setEntityPopover(null); }}>
                Supprimer
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Resolve text offset using data-offset attributes on parent elements */
function getTextOffsetFromDataAttr(node: Node, localOffset: number): number {
  // Find the closest element with data-offset
  let el: Node | null = node;
  while (el && !(el instanceof HTMLElement && el.dataset.offset !== undefined)) {
    el = el.parentElement;
  }
  if (!el || !(el instanceof HTMLElement)) return -1;

  const baseOffset = parseInt(el.dataset.offset!, 10);
  if (isNaN(baseOffset)) return -1;

  // If the node is the element itself (not a text child), return base
  if (node === el) return baseOffset + localOffset;

  // Walk text nodes within this element to find the offset
  let charCount = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode === node) {
      return baseOffset + charCount + localOffset;
    }
    charCount += walker.currentNode.textContent?.length ?? 0;
  }
  return -1;
}
