import { create } from "zustand";

export type IndicatorId = "sma" | "ema" | "vwap" | "bb" | "rsi" | "macd";

/** A shared, stable empty array. We won't mutate it. */
const EMPTY: IndicatorId[] = [];

/** Optional: export a fixed list for UIs (dialogs, menus) */
export const INDICATOR_IDS: readonly IndicatorId[] = [
  "sma",
  "ema",
  "vwap",
  "bb",
  "rsi",
  "macd",
] as const;

type State = {
  version: number;
  selected: Record<string, string[]>;
  toggle: (viewId: string, id: string) => void;
  activePanel: string | null;
  setActivePanel: (id: string) => void;
};

export const useIndicatorStore = create<State>((set) => ({
  version: 0,
  selected: {},
  toggle: (viewId, id) =>
    set((s) => {
      const cur = s.selected[viewId] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { version: s.version + 1, selected: { ...s.selected, [viewId]: next } };
    }),
  activePanel: null,
  setActivePanel: (id) => set(() => ({ activePanel: id })),
}));