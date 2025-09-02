// src/store/indicatorOverlayStore.ts
import { create } from "zustand";

export type IndicatorBox = {
  from: number;   // ms
  to: number;     // ms
  top: number;
  bottom: number;
};

export type BoxStyle = {
  stroke?: string;
  fill?: string;
  lineWidth?: number;
  z?: number;
};

export type IndicatorLabel = {
  time: number;     // seconds (chart uses UTCTimestamp seconds)
  price: number;
  text: string;
  color?: string;   // text color
  bg?: string;      // background fill (rounded pill)
  anchor?: "above" | "below" | "left" | "right" | "center";
  font?: string;    // e.g. "12px ui-monospace"
  paddingX?: number;
  paddingY?: number;
  z?: number;
};

export type OverlayPayload = {
  boxes?: IndicatorBox[];
  style?: BoxStyle;            // applies to boxes
  labels?: IndicatorLabel[];   // per-plot labels
};

type State = {
  byView: Record<string, Record<string, OverlayPayload>>; // viewId -> plotId -> payload
  setBoxes: (viewId: string, id: string, boxes: IndicatorBox[], style?: BoxStyle) => void;
  setLabels: (viewId: string, id: string, labels: IndicatorLabel[]) => void;
  clearView: (viewId: string) => void;
  clearPlot: (viewId: string, id: string) => void;
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
            [id]: { ...prev, boxes, style },
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
            [id]: { ...prev, labels },
          },
        },
      };
    }),

  clearView: (viewId) =>
    set((s) => {
      if (!s.byView[viewId]) return s;
      const next = { ...s.byView };
      delete next[viewId];
      return { byView: next };
    }),

  clearPlot: (viewId, id) =>
    set((s) => {
      const view = s.byView[viewId];
      if (!view || !view[id]) return s;
      const nextView = { ...view };
      delete nextView[id];
      return { byView: { ...s.byView, [viewId]: nextView } };
    }),
}));
