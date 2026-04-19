import { useRef, useState } from "react";
import { useStore } from "../store";
import { CATEGORY_COLORS, CATEGORY_LABELS, type PiiCategory } from "../lib/types";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as PiiCategory[];

export function SearchBar() {
  const text = useStore((s) => s.text);
  const addEntity = useStore((s) => s.addEntity);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const occurrences = trimmed.length >= 2 ? findOccurrences(text, trimmed, caseSensitive) : [];

  function findOccurrences(haystack: string, needle: string, cs: boolean): { start: number; text: string }[] {
    const results: { start: number; text: string }[] = [];
    if (cs) {
      let pos = 0;
      while ((pos = haystack.indexOf(needle, pos)) !== -1) {
        results.push({ start: pos, text: haystack.slice(pos, pos + needle.length) });
        pos += 1;
      }
    } else {
      const lower = haystack.toLowerCase();
      const needleLower = needle.toLowerCase();
      let pos = 0;
      while ((pos = lower.indexOf(needleLower, pos)) !== -1) {
        // Keep original case from the document
        results.push({ start: pos, text: haystack.slice(pos, pos + needle.length) });
        pos += 1;
      }
    }
    return results;
  }

  function pickCategory(category: PiiCategory) {
    if (occurrences.length === 0) return;
    const first = occurrences[0];
    addEntity(first.start, first.start + trimmed.length, first.text, category);
    setQuery("");
    setShowPicker(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setQuery("");
      setShowPicker(false);
    }
    if (e.key === "Enter" && occurrences.length > 0) {
      setShowPicker(true);
    }
  }

  return (
    <div className="search-bar">
      <div className="search-input-row">
        <span className="search-icon">&#x2315;</span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Rechercher pour anonymiser..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowPicker(false); }}
          onKeyDown={onKeyDown}
        />
        <button
          className={`btn-case${caseSensitive ? " active" : ""}`}
          onClick={() => setCaseSensitive(!caseSensitive)}
          title={caseSensitive ? "Sensible a la casse" : "Insensible a la casse"}
        >
          Aa
        </button>
        {trimmed.length >= 2 && (
          <span className={`search-count${occurrences.length === 0 ? " none" : ""}`}>
            {occurrences.length} occurrence{occurrences.length !== 1 ? "s" : ""}
          </span>
        )}
        {occurrences.length > 0 && (
          <button className="btn-search-add" onClick={() => setShowPicker(!showPicker)}>
            Anonymiser
          </button>
        )}
      </div>
      {showPicker && occurrences.length > 0 && (
        <div className="search-picker">
          {CATEGORIES.map((cat) => (
            <button key={cat} className="popover-item" onClick={() => pickCategory(cat)}>
              <span className="popover-dot" style={{ background: CATEGORY_COLORS[cat] }} />
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
