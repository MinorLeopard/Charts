"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Visibility of an indicator in the library. */
export type Visibility = "private" | "public";

/** Simple param schema placeholder (step-1). */
export type ParamSchema = {
  [key: string]:
    | { type: "number"; min?: number; max?: number; step?: number; default?: number }
    | { type: "boolean"; default?: boolean }
    | { type: "string"; default?: string };
};

export type CustomIndicator = {
  id: string;            // slug/uuid
  name: string;
  code: string;          // JS (for step-1). We’ll allow TS in step-2 via worker/transpile.
  version: number;
  visibility: Visibility;
  description?: string;
  paramSchema?: ParamSchema;
  updatedAt: number;     // epoch ms
  // We don't store CSV bytes here; those live in IndexedDB via attachments helper.
};

type Registry = Record<string, CustomIndicator>;
type SelectedByView = Record<string, string[]>;

type State = {
  registry: Registry;              // id -> indicator meta/code
  selectedByView: SelectedByView;  // viewId -> [indicatorIds]
  version: number;                 // bump to force UI refresh if needed

  /** CRUD */
  upsert: (ci: CustomIndicator) => void;
  remove: (id: string) => void;

  /** Helpers for editor save (shortcut) */
  saveCustom: (viewId: string, code: string, fn: Function) => void;

  /** Listing helpers */
  all: () => CustomIndicator[];
  byId: (id: string) => CustomIndicator | undefined;

  /** Selection per view (layout:panel) */
  listForView: (viewId: string) => string[];
  toggleForView: (viewId: string, id: string) => void;
  isSelected: (viewId: string, id: string) => boolean;
};

const EMPTY: string[] = [];

export const useCustomIndicatorStore = create<State>()(
  persist(
    (set, get) => ({
      registry: {},
      selectedByView: {},
      version: 1,

      upsert: (ci) =>
        set((s) => {
          const next: Registry = { ...s.registry, [ci.id]: { ...ci, updatedAt: Date.now() } };
          return { registry: next, version: s.version + 1 };
        }),

      remove: (id) =>
        set((s) => {
          const next: Registry = { ...s.registry };
          delete next[id];
          // also remove from selections
          const nextSel: SelectedByView = {};
          for (const [viewId, arr] of Object.entries(s.selectedByView)) {
            nextSel[viewId] = arr.filter((x) => x !== id);
          }
          return { registry: next, selectedByView: nextSel, version: s.version + 1 };
        }),

      /** Save directly from editor (auto wraps into CustomIndicator and selects it). */
      saveCustom: (viewId, code, fn) => {
        const id = `custom-${Date.now()}`;
        const ci: CustomIndicator = {
          id,
          name: `Custom ${new Date().toLocaleTimeString()}`,
          code,
          version: 1,
          visibility: "private",
          updatedAt: Date.now(),
        };
        set((s) => {
          const nextRegistry = { ...s.registry, [ci.id]: ci };
          const curr = s.selectedByView[viewId] ?? [];
          return {
            registry: nextRegistry,
            selectedByView: { ...s.selectedByView, [viewId]: [...curr, id] },
            version: s.version + 1,
          };
        });
      },

      all: () => Object.values(get().registry).sort((a, b) => b.updatedAt - a.updatedAt),

      byId: (id: string) => get().registry[id],

      listForView: (viewId: string) => {
        const found = get().selectedByView[viewId];
        return found ?? EMPTY;
      },

      toggleForView: (viewId: string, id: string) =>
        set((s) => {
          const curr = s.selectedByView[viewId] ?? EMPTY;
          const has = curr.includes(id);
          const next = has ? curr.filter((x) => x !== id) : [...curr, id];
          return {
            selectedByView: { ...s.selectedByView, [viewId]: next },
            version: s.version + 1,
          };
        }),

      isSelected: (viewId: string, id: string) => {
        const curr = get().selectedByView[viewId] ?? EMPTY;
        return curr.includes(id);
      },
    }),
    {
      name: "custom-indicator-store",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({
        registry: s.registry,
        selectedByView: s.selectedByView,
        version: s.version,
      }),
    }
  )
);
