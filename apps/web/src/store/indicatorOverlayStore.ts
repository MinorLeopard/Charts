// src/store/indicatorOverlayStore.ts
import { create } from "zustand";

export type IndicatorBox = {
  from: number;   // epoch seconds preferred (ms also accepted)
  to: number;     // epoch seconds preferred (ms also accepted)
  top: number;
  bottom: number;
};

export type BoxStyle = {
  stroke?: string;
  fill?: string;
  lineWidth?: number;
  z?: number; // draw order (higher on top)
};

export type IndicatorLabel = {
  time: number;
  price: number;
  text: string;
  color?: string;
  bg?: string;
  anchor?: "above" | "below" | "left" | "right" | "center";
  font?: string;
  paddingX?: number;
  paddingY?: number;
  z?: number;

  // NEW (optional): marker support
  shape?: "up" | "down" | "circle";
  size?: number;
  stroke?: string;
  strokeWidth?: number;
};

export type OverlayPayload = {
  boxes?: IndicatorBox[];
  style?: BoxStyle;
  labels?: IndicatorLabel[];
};

type State = {
  // viewId -> plotId -> payload
  byView: Record<string, Record<string, OverlayPayload>>;
  setBoxes: (viewId: string, id: string, boxes: IndicatorBox[], style?: BoxStyle) => void;
  setLabels: (viewId: string, id: string, labels: IndicatorLabel[]) => void;
  clearView: (viewId: string) => void;
  clearPlot: (viewId: string, id: string) => void;
  /** NEW: clear any plot whose id starts with prefix (for namespaced custom indicators) */
  clearByPrefix: (viewId: string, prefix: string) => void;
};

export const useIndicatorOverlayStore = create<State>((set, get) => ({
  byView: {},

  setBoxes: (viewId, id, boxes, style) =>
    set((s) => {
      const view = s.byView[viewId] ?? {};
      const prev = view[id] ?? {};
      return {
        byView: {
          ...s.byView,
          [viewId]: {
            ...view,
            [id]: { ...prev, boxes: boxes ?? [], style },
          },
        },
      };
    }),

  setLabels: (viewId, id, labels) =>
    set((s) => {
      const view = s.byView[viewId] ?? {};
      const prev = view[id] ?? {};
      return {
        byView: {
          ...s.byView,
          [viewId]: {
            ...view,
            [id]: { ...prev, labels: labels ?? [] },
          },
        },
      };
    }),

  clearView: (viewId) =>
    set((s) => {
      const next = { ...s.byView };
      delete next[viewId];
      return { byView: next };
    }),

  clearPlot: (viewId, id) =>
    set((s) => {
      const view = s.byView[viewId];
      if (!view) return s;
      const nextView = { ...view };
      delete nextView[id];
      return { byView: { ...s.byView, [viewId]: nextView } };
    }),

  clearByPrefix: (viewId, prefix) =>
    set((s) => {
      const view = s.byView[viewId];
      if (!view) return s;
      const nextView: Record<string, OverlayPayload> = {};
      for (const [k, v] of Object.entries(view)) {
        if (!k.startsWith(prefix)) nextView[k] = v;
      }
      return { byView: { ...s.byView, [viewId]: nextView } };
    }),
}));
