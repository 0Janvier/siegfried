import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Entity, ExtractedPage, PiiCategory } from "./lib/types";
import { PseudoMap } from "./lib/pseudo-map";
import { trimParticles } from "./lib/juritools";

interface FileEntry {
  path: string;
  name: string;
}

export interface PendingReplace {
  needle: string;
  category: PiiCategory;
  pseudonym: string;
  count: number;
}

interface Store {
  files: FileEntry[];
  pages: ExtractedPage[];
  text: string;
  entities: Entity[];
  pseudoMap: PseudoMap | null;
  busy: boolean;
  status: string;
  selectedIndices: Set<number>;
  previewMode: boolean;
  toolWarnings: string[];
  pendingReplace: PendingReplace | null;

  addFiles: (paths: string[]) => void;
  removeFile: (path: string) => void;
  moveFile: (from: number, to: number) => void;
  clearFiles: () => void;
  setPages: (pages: ExtractedPage[]) => void;
  setEntities: (entities: Entity[], pseudoMap: PseudoMap) => void;
  addEntity: (start: number, end: number, text: string, category: PiiCategory) => void;
  applyReplace: () => void;
  dismissReplace: () => void;
  removeEntity: (index: number) => void;
  toggleEntity: (index: number) => void;
  toggleCategory: (category: PiiCategory) => void;
  selectEntity: (index: number, multi: boolean) => void;
  clearSelection: () => void;
  mergeSelected: (category: PiiCategory) => void;
  setPreviewMode: (on: boolean) => void;
  setToolWarnings: (warnings: string[]) => void;
  setBusy: (busy: boolean, status?: string) => void;
}

export const useStore = create<Store>()(persist((set) => ({
  files: [],
  pages: [],
  text: "",
  entities: [],
  pseudoMap: null,
  busy: false,
  status: "",
  selectedIndices: new Set<number>(),
  previewMode: false,
  toolWarnings: [],
  pendingReplace: null,

  addFiles: (paths) =>
    set((s) => {
      const existing = new Set(s.files.map((f) => f.path));
      const fresh = paths
        .filter((p) => !existing.has(p))
        .map((p) => ({ path: p, name: p.split("/").pop() || p }));
      return { files: [...s.files, ...fresh] };
    }),

  removeFile: (path) =>
    set((s) => ({ files: s.files.filter((f) => f.path !== path) })),

  moveFile: (from, to) =>
    set((s) => {
      const next = [...s.files];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { files: next };
    }),

  clearFiles: () => set({ files: [], pages: [], text: "", entities: [], pseudoMap: null, selectedIndices: new Set(), pendingReplace: null }),

  setPages: (pages) => {
    const text = pages
      .map((p) => `\n\n=== ${p.file} — page ${p.page}${p.used_ocr ? " (OCR)" : ""} ===\n\n${p.text}`)
      .join("");
    set({ pages, text, entities: [], pseudoMap: null, selectedIndices: new Set(), pendingReplace: null });
  },

  setEntities: (entities, pseudoMap) => set({ entities, pseudoMap, selectedIndices: new Set(), pendingReplace: null }),

  addEntity: (start, end, entityText, category) =>
    set((s) => {
      // Defensive trim: block particules (de, le, la…) from being added manually
      const trimmed = trimParticles(s.text, [{ start, end, text: entityText, category }]);
      if (trimmed.length === 0) {
        return { status: `"${entityText}" ignore : particule grammaticale` };
      }
      const cleaned = trimmed[0];
      const map = s.pseudoMap ?? new PseudoMap();
      const pseudonym = map.assign(cleaned.text, category);
      const newEntities: Entity[] = [];
      const needle = cleaned.text;
      const textLower = s.text.toLowerCase();
      const needleLower = needle.toLowerCase();
      const existingRanges = new Set(s.entities.map((e) => `${e.start}:${e.end}`));
      let skippedCount = 0;
      let searchFrom = 0;

      while (searchFrom < s.text.length) {
        const idx = textLower.indexOf(needleLower, searchFrom);
        if (idx === -1) break;
        const matchedText = s.text.slice(idx, idx + needle.length);
        const key = `${idx}:${idx + needle.length}`;
        if (!existingRanges.has(key)) {
          const overlaps = s.entities.some(
            (e) => idx < e.end && idx + needle.length > e.start
          );
          if (!overlaps) {
            newEntities.push({
              start: idx,
              end: idx + needle.length,
              text: matchedText,
              category,
              pseudonym,
              enabled: true,
            });
          } else {
            skippedCount++;
          }
        }
        searchFrom = idx + 1;
      }

      if (newEntities.length === 0) {
        newEntities.push({ start: cleaned.start, end: cleaned.end, text: cleaned.text, category, pseudonym, enabled: true });
      }

      const next = [...s.entities, ...newEntities].sort((a, b) => a.start - b.start);
      const addedCount = newEntities.length;
      let statusMsg = `"${entityText}" : ${addedCount} occurrence${addedCount > 1 ? "s" : ""}`;
      if (skippedCount > 0) {
        statusMsg += ` (${skippedCount} chevauchement${skippedCount > 1 ? "s" : ""})`;
      }

      return {
        entities: next,
        pseudoMap: map,
        status: statusMsg,
        pendingReplace: skippedCount > 0
          ? { needle, category, pseudonym, count: skippedCount }
          : null,
      };
    }),

  applyReplace: () =>
    set((s) => {
      if (!s.pendingReplace) return s;
      const { needle, category, pseudonym } = s.pendingReplace;
      const map = s.pseudoMap ?? new PseudoMap();

      // Find all positions of needle
      const positions: { start: number; end: number }[] = [];
      let searchFrom = 0;
      while (searchFrom < s.text.length) {
        const idx = s.text.indexOf(needle, searchFrom);
        if (idx === -1) break;
        positions.push({ start: idx, end: idx + needle.length });
        searchFrom = idx + 1;
      }

      // Remove existing entities that overlap with any occurrence of needle
      const kept = s.entities.filter((e) =>
        !positions.some((p) => p.start < e.end && p.end > e.start)
      );

      // Add all occurrences as new entities
      const replaced: Entity[] = positions.map((p) => ({
        start: p.start,
        end: p.end,
        text: needle,
        category,
        pseudonym,
        enabled: true,
      }));

      const next = [...kept, ...replaced].sort((a, b) => a.start - b.start);
      const replacedCount = positions.length;

      return {
        entities: next,
        pseudoMap: map,
        pendingReplace: null,
        status: `"${needle}" : ${replacedCount} occurrence${replacedCount > 1 ? "s" : ""} (chevauchements remplaces)`,
      };
    }),

  dismissReplace: () => set({ pendingReplace: null }),

  removeEntity: (index) =>
    set((s) => {
      const next = [...s.entities];
      next.splice(index, 1);
      const sel = new Set(s.selectedIndices);
      sel.delete(index);
      const reindexed = new Set<number>();
      for (const i of sel) {
        reindexed.add(i > index ? i - 1 : i);
      }
      return { entities: next, selectedIndices: reindexed };
    }),

  toggleEntity: (index) =>
    set((s) => {
      const next = [...s.entities];
      next[index] = { ...next[index], enabled: !next[index].enabled };
      return { entities: next };
    }),

  toggleCategory: (category) =>
    set((s) => {
      const indices = s.entities
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.category === category);
      const allEnabled = indices.every(({ e }) => e.enabled);
      const next = [...s.entities];
      for (const { i } of indices) {
        next[i] = { ...next[i], enabled: !allEnabled };
      }
      return { entities: next };
    }),

  selectEntity: (index, multi) =>
    set((s) => {
      if (multi) {
        const next = new Set(s.selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return { selectedIndices: next };
      }
      if (s.selectedIndices.size === 1 && s.selectedIndices.has(index)) {
        return { selectedIndices: new Set<number>() };
      }
      return { selectedIndices: new Set([index]) };
    }),

  clearSelection: () => set({ selectedIndices: new Set<number>() }),

  mergeSelected: (category) =>
    set((s) => {
      if (s.selectedIndices.size < 2) return s;
      const indices = Array.from(s.selectedIndices).sort((a, b) => a - b);
      const toMerge = indices.map((i) => s.entities[i]).sort((a, b) => a.start - b.start);

      // Check adjacency: gap between consecutive entities must be <= 20 chars of whitespace/punctuation
      for (let i = 0; i < toMerge.length - 1; i++) {
        const gap = s.text.slice(toMerge[i].end, toMerge[i + 1].start);
        if (gap.length > 20 || /[a-zA-ZÀ-ÿ]{3,}/.test(gap)) {
          return {
            ...s,
            status: "Fusion impossible : les entites sont trop eloignees. Selectionnez des entites adjacentes.",
          };
        }
      }

      const minStart = toMerge[0].start;
      const maxEnd = toMerge[toMerge.length - 1].end;
      const mergedText = s.text.slice(minStart, maxEnd);

      const map = s.pseudoMap ?? new PseudoMap();
      const pseudonym = map.assign(mergedText, category);
      const merged: Entity = {
        start: minStart,
        end: maxEnd,
        text: mergedText,
        category,
        pseudonym,
        enabled: true,
      };

      const next = [...s.entities];
      for (const i of [...indices].reverse()) {
        next.splice(i, 1);
      }
      next.push(merged);
      next.sort((a, b) => a.start - b.start);

      return { entities: next, pseudoMap: map, selectedIndices: new Set<number>() };
    }),

  setPreviewMode: (on) => set({ previewMode: on }),

  setToolWarnings: (warnings) => set({ toolWarnings: warnings }),

  setBusy: (busy, status = "") => set({ busy, status }),
}), {
  name: "siegfried-session",
  version: 2, // bump when entity shape or detection logic changes — invalidates old state
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({
    files: s.files,
    pages: s.pages,
    text: s.text,
    entities: s.entities,
    pseudoMap: s.pseudoMap ? (s.pseudoMap as PseudoMap).toJSON() : null,
  }),
  merge: (persisted, current) => {
    const p = persisted as Partial<Store> & { pseudoMap?: Record<string, string> | null };
    const map = p.pseudoMap ? PseudoMap.fromJSON(p.pseudoMap) : null;
    return {
      ...current,
      ...p,
      pseudoMap: map,
      // transient state stays fresh
      busy: false,
      status: "",
      selectedIndices: new Set<number>(),
      pendingReplace: null,
      toolWarnings: [],
    };
  },
}));
