"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Visibility of an indicator in the library. */
export type Visibility = "private" | "public";

/** Simple param schema placeholder. */
export type ParamSpec =
  | { type: "number"; min?: number; max?: number; step?: number; default?: number }
  | { type: "boolean"; default?: boolean }
  | { type: "string"; default?: string };

export type ParamSchema = {
  [key: string]: ParamSpec;
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

  // Saves a brand-new custom for a given view and selects it
  saveCustom: (viewId: string, code: string) => void;

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

function isPersistShape(x: unknown): x is {
  registry?: Registry;
  selectedByView?: SelectedByView;
  version?: number;
} {
  return typeof x === "object" && x !== null;
}

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

      saveCustom: (viewId, code) => {
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
      migrate: (persisted: unknown, fromVersion: number) => {
        if (!isPersistShape(persisted)) {
          return { registry: {}, selectedByView: {}, version: 1 };
        }
        if (fromVersion < 1) {
          return { registry: {}, selectedByView: {}, version: 1 };
        }
        return {
          registry: persisted.registry ?? {},
          selectedByView: persisted.selectedByView ?? {},
          version: typeof persisted.version === "number" ? persisted.version : 1,
        };
      },
      // Don't persist editingId
      partialize: (s) => ({
        registry: s.registry,
        selectedByView: s.selectedByView,
        version: s.version,
      }),
    }
  )
);
