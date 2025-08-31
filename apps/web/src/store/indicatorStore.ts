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
  /** viewId -> selected indicators */
  selected: Record<string, IndicatorId[]>;
  /** bumping this can help components re-render where needed */
  version: number;

  /** Toggle a single indicator for a view */
  toggle: (viewId: string, id: IndicatorId) => void;

  /** Replace the list for a view */
  setSelected: (viewId: string, ids: IndicatorId[]) => void;

  /**
   * Returns a stable array reference for the current list.
   * Important: never constructs a new array unless state changed.
   */
  list: (viewId: string) => IndicatorId[];
};

export const useIndicatorStore = create<State>()((set, get) => ({
  selected: {},
  version: 0,

  toggle: (viewId, id) =>
    set((s) => {
      const cur = s.selected[viewId] ?? EMPTY;
      const exists = cur.includes(id);
      const next = exists ? cur.filter((x) => x !== id) : [...cur, id];
      return {
        selected: { ...s.selected, [viewId]: next },
        version: s.version + 1,
      };
    }),

  setSelected: (viewId, ids) =>
    set((s) => ({
      selected: { ...s.selected, [viewId]: ids.slice() },
      version: s.version + 1,
    })),

  list: (viewId) => get().selected[viewId] ?? EMPTY,
}));
