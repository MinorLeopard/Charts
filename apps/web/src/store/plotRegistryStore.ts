import { create } from "zustand";
import {
  useIndicatorOverlayStore,
  type IndicatorBox,
  type BoxStyle,
  type IndicatorLabel,
} from "@/store/indicatorOverlayStore";

export type PlotAdapter = {
  line: (id: string, series: { time: number; value: number }[], opts?: Record<string, unknown>) => void;
  bands: (
    id: string,
    series: { time: number; upper: number; basis: number; lower: number }[],
    opts?: Record<string, unknown>
  ) => void;
  histogram: (id: string, series: { time: number; value: number }[], opts?: Record<string, unknown>) => void;
  boxes: (id: string, boxes: IndicatorBox[], opts?: BoxStyle) => void;
  // REQUIRED + accepts opts? to match EditorRunnerPanel
  labels: (id: string, labels: IndicatorLabel[], opts?: Record<string, unknown>) => void;
};

const makeAdapter = (viewId: string): PlotAdapter => ({
  line: () => {},
  bands: () => {},
  histogram: () => {},
  boxes: (id, boxes, opts) => {
    useIndicatorOverlayStore.getState().setBoxes(viewId, id, boxes, opts);
  },
  labels: (id, labels, _opts) => {
    useIndicatorOverlayStore.getState().setLabels(viewId, id, labels);
  },
});

type State = {
  map: Record<string, PlotAdapter | undefined>;
  register: (viewId: string, adapter?: PlotAdapter) => void;
  unregister: (viewId: string) => void;
  get: (viewId: string) => PlotAdapter | undefined;
};

export const usePlotRegistry = create<State>((set, get) => ({
  map: {},
  register: (viewId, adapter) =>
    set((s) => ({
      map: { ...s.map, [viewId]: adapter ?? makeAdapter(viewId) },
    })),
  unregister: (viewId) =>
    set((s) => {
      const m = { ...s.map };
      delete m[viewId];
      return { map: m };
    }),
  get: (viewId) => get().map[viewId],
}));
