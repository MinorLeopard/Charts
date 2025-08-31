import { create } from "zustand";

export type ToolId = "select" | "trendline" | "hline" | "vline" | "rect" | "eraser";

export type Point = { time: number; price: number };

export type DrawObject =
  | { id: string; type: "trendline"; panelId: "p1"|"p2"|"p3"|"p4"; a: Point; b: Point; color?: string; width?: number }
  | { id: string; type: "hline";     panelId: "p1"|"p2"|"p3"|"p4"; y: number;   color?: string; width?: number }
  | { id: string; type: "vline";     panelId: "p1"|"p2"|"p3"|"p4"; x: number;   color?: string; width?: number }
  | { id: string; type: "rect";      panelId: "p1"|"p2"|"p3"|"p4"; a: Point; b: Point; color?: string; fill?: string; width?: number };

export interface DrawState {
  activeTool: ToolId;
  objects: DrawObject[];
  setActiveTool: (t: ToolId) => void;
  addObject: (o: DrawObject) => void;
  updateObject: (o: DrawObject) => void;
  deleteObject: (id: string) => void;
  clearPanel: (panelId: "p1"|"p2"|"p3"|"p4") => void;
}

export const useDrawStore = create<DrawState>((set) => ({
  activeTool: "select",
  objects: [],
  setActiveTool: (t) => set({ activeTool: t }),
  addObject:     (o) => set((s) => ({ objects: [...s.objects, o] })),
  updateObject:  (o) => set((s) => ({ objects: s.objects.map(it => it.id === o.id ? o : it) })),
  deleteObject:  (id) => set((s) => ({ objects: s.objects.filter(it => it.id !== id) })),
  clearPanel:    (panelId) => set((s) => ({ objects: s.objects.filter(it => it.panelId !== panelId) })),
}));
