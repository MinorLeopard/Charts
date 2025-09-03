"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Visibility of an indicator in the library. */
export type Visibility = "private" | "public";

/** Simple param schema placeholder. */
export type ParamSchema = {
  [key: string]:
    | { type: "number"; min?: number; max?: number; step?: number; default?: number }
    | { type: "boolean"; default?: boolean }
    | { type: "string"; default?: string };
};

export type CustomIndicator = {
  id: string;
  name: string;
  code: string;
  version: number;
  visibility: Visibility;
  description?: string;
  paramSchema?: ParamSchema;
  updatedAt: number;
};

type Registry = Record<string, CustomIndicator>;
type SelectedByView = Record<string, string[]>;

type State = {
  registry: Registry;
  selectedByView: SelectedByView;
  version: number;

  upsert: (ci: CustomIndicator) => void;
  remove: (id: string) => void;

  saveCustom: (viewId: string, code: string, fn: Function) => void;

  all: () => CustomIndicator[];
  byId: (id: string) => CustomIndicator | undefined;

  listForView: (viewId: string) => string[];
  toggleForView: (viewId: string, id: string) => void;
  isSelected: (viewId: string, id: string) => boolean;

  editingId: string | null;
  startEditing: (id: string) => void;
  clearEditing: () => void;
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
          const nextSel: SelectedByView = {};
          for (const [viewId, arr] of Object.entries(s.selectedByView)) {
            nextSel[viewId] = arr.filter((x) => x !== id);
          }
          return { registry: next, selectedByView: nextSel, version: s.version + 1 };
        }),

      saveCustom: (viewId, code, _fn) => {
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

      listForView: (viewId: string) => get().selectedByView[viewId] ?? EMPTY,

      toggleForView: (viewId: string, id: string) =>
        set((s) => {
          const curr = s.selectedByView[viewId] ?? EMPTY;
          const has = curr.includes(id);
          const next = has ? curr.filter((x) => x !== id) : [...curr, id];
          return { selectedByView: { ...s.selectedByView, [viewId]: next }, version: s.version + 1 };
        }),

      isSelected: (viewId: string, id: string) => {
        const curr = get().selectedByView[viewId] ?? EMPTY;
        return curr.includes(id);
      },

      editingId: null,
      startEditing: (id: string) => set(() => ({ editingId: id })),
      clearEditing: () => set(() => ({ editingId: null })),
    }),
    {
      name: "custom-indicator-store",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted: any, fromVersion) => {
        // We only added editingId (non-persisted) and bumped version; keep existing data shape.
        if (!persisted || typeof persisted !== "object") return { registry: {}, selectedByView: {}, version: 1 };
        if (fromVersion < 1) {
          // very old/unexpected; normalize
          return { registry: {}, selectedByView: {}, version: 1 };
        }
        // Ensure required keys exist
        return {
          registry: persisted.registry ?? {},
          selectedByView: persisted.selectedByView ?? {},
          version: typeof persisted.version === "number" ? persisted.version : 1,
        };
      },
      partialize: (s) => ({
        registry: s.registry,
        selectedByView: s.selectedByView,
        version: s.version,
        // editingId is intentionally NOT persisted
      }),
    }
  )
);
