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

/** Display names for built-ins (used by chips UI) */
export const INDICATOR_NAMES: Record<IndicatorId, string> = {
  sma: "SMA(20)",
  ema: "EMA(20)",
  vwap: "VWAP",
  bb: "Bollinger Bands",
  rsi: "RSI(14)",
  macd: "MACD(12,26,9)",
};

type State = {
  version: number;
  selected: Record<string, string[]>;
  toggle: (viewId: string, id: string) => void;
  /** Remove only if currently selected; no-op otherwise. */
  removeForView: (viewId: string, id: string) => void;

  activePanel: string | null;
  setActivePanel: (id: string) => void;

  /** Convenience readers */
  listForView: (viewId: string) => string[];
  isSelected: (viewId: string, id: string) => boolean;
};

export const useIndicatorStore = create<State>((set, get) => ({
  version: 0,
  selected: {},

  toggle: (viewId, id) =>
    set((s) => {
      const cur = s.selected[viewId] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { version: s.version + 1, selected: { ...s.selected, [viewId]: next } };
    }),

  removeForView: (viewId, id) =>
    set((s) => {
      const cur = s.selected[viewId] ?? EMPTY;
      if (!cur.includes(id)) return s;
      const next = cur.filter((x) => x !== id);
      return { version: s.version + 1, selected: { ...s.selected, [viewId]: next } };
    }),

  activePanel: null,
  setActivePanel: (id) => set(() => ({ activePanel: id })),

  listForView: (viewId) => get().selected[viewId] ?? EMPTY,
  isSelected: (viewId, id) => (get().selected[viewId] ?? EMPTY).includes(id),
}));
