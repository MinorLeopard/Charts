import { create } from "zustand";

export type BoxStyle = {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  z?: number;
};

export type IndicatorBox = {
  from: number;  // ms
  to: number;    // ms
  top: number;
  bottom: number;
};

export type LabelShape = "up" | "down" | "circle" | "square"; // extend as needed
export type IndicatorLabel = {
  time: number;      // ms
  price: number;
  text?: string;
  color?: string;    // text color
  bg?: string;       // badge background
  shape?: LabelShape;
  size?: number;     // px, default ~12
  z?: number;
};

type ViewPlots = {
  boxes?: Record<string, { boxes: IndicatorBox[]; style?: BoxStyle }>;
  labels?: Record<string, { labels: IndicatorLabel[] }>;
};

type State = {
  byView: Record<string, ViewPlots>;
  setBoxes: (viewId: string, id: string, boxes: IndicatorBox[], style?: BoxStyle) => void;
  setLabels: (viewId: string, id: string, labels: IndicatorLabel[]) => void;
  clearView: (viewId: string) => void;
};

export const useIndicatorOverlayStore = create<State>((set) => ({
  byView: {},
  setBoxes: (viewId, id, boxes, style) =>
    set((s) => {
      const v = s.byView[viewId] ?? {};
      const nb = { ...(v.boxes ?? {}), [id]: { boxes, style } };
      return { byView: { ...s.byView, [viewId]: { ...v, boxes: nb } } };
    }),
  setLabels: (viewId, id, labels) =>
    set((s) => {
      const v = s.byView[viewId] ?? {};
      const nl = { ...(v.labels ?? {}), [id]: { labels } };
      return { byView: { ...s.byView, [viewId]: { ...v, labels: nl } } };
    }),
  clearView: (viewId) =>
    set((s) => {
      const m = { ...s.byView };
      delete m[viewId];
      return { byView: m };
    }),
}));
