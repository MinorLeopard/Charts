// src/store/indicatorOverlayStore.ts
import { create } from "zustand";

export type IndicatorBox = {
  // Accept either seconds or ms (we normalize in the overlay)
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
  shape?: "up" | "down" | "circle"; // triangle up/down or a small circle
  size?: number;                    // pixel size of the marker (default 12)
  stroke?: string;                  // optional marker stroke
  strokeWidth?: number;             // stroke width (default 1)
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
};

export const useIndicatorOverlayStore = create<State>((set, get) => ({
  byView: {},

  setBoxes: (viewId, id, boxes, style) =>
    set((s) => {
      console.log("[overlay.store] setBoxes →", {
        viewId, id, count: boxes?.length ?? 0, style,
      });
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
      console.log("[overlay.store] setLabels →", {
        viewId, id, count: labels?.length ?? 0,
      });
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
      console.log("[overlay.store] clearView", viewId);
      return { byView: next };
    }),

  clearPlot: (viewId, id) =>
    set((s) => {
      const view = s.byView[viewId];
      if (!view) return s;
      const nextView = { ...view };
      delete nextView[id];
      console.log("[overlay.store] clearPlot", { viewId, id });
      return { byView: { ...s.byView, [viewId]: nextView } };
    }),
}));
