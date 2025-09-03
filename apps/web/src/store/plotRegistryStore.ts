// src/store/plotRegistryStore.ts
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
  labels: (id: string, labels: IndicatorLabel[], opts?: Record<string, unknown>) => void;
};

function teeBoxes(viewId: string, maybe: PlotAdapter["boxes"] | undefined): PlotAdapter["boxes"] {
  return (id, boxes, opts) => {
    // ALWAYS push to overlay store
    console.log("[plot.registry] boxes → store", { viewId, id, count: boxes?.length ?? 0, style: opts, first: boxes?.[0] });
    useIndicatorOverlayStore.getState().setBoxes(viewId, id, boxes, opts);
    // Optionally let the panel adapter also handle it
    if (typeof maybe === "function") {
      try {
        maybe(id, boxes, opts);
      } catch (e) {
        console.warn("[plot.registry] adapter boxes threw", e);
      }
    }
  };
}

function teeLabels(viewId: string, maybe: PlotAdapter["labels"] | undefined): PlotAdapter["labels"] {
  return (id, labels, _opts) => {
    console.log("[plot.registry] labels → store", { viewId, id, count: labels?.length ?? 0, first: labels?.[0] });
    useIndicatorOverlayStore.getState().setLabels(viewId, id, labels);
    if (typeof maybe === "function") {
      try {
        maybe(id, labels, _opts);
      } catch (e) {
        console.warn("[plot.registry] adapter labels threw", e);
      }
    }
  };
}

const makeAdapter = (viewId: string, base?: PlotAdapter): PlotAdapter => ({
  line: base?.line ?? (() => {}),
  bands: base?.bands ?? (() => {}),
  histogram: base?.histogram ?? (() => {}),
  // tee wrappers ensure overlay gets the data regardless of the panel adapter
  boxes: teeBoxes(viewId, base?.boxes),
  labels: teeLabels(viewId, base?.labels),
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
    set((s) => {
      const merged = makeAdapter(viewId, adapter);
      console.log("[plot.registry] register", viewId, adapter ? "(custom+tee)" : "(tee-only)");
      return { map: { ...s.map, [viewId]: merged } };
    }),
  unregister: (viewId) =>
    set((s) => {
      const m = { ...s.map };
      delete m[viewId];
      return { map: m };
    }),
  get: (viewId) => get().map[viewId],
}));
