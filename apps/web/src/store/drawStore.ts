import { create } from "zustand";

export type ToolId = "select" | "trendline" | "hline" | "vline" | "rect" | "eraser";
export type Point = { time: number; price: number };

export type DrawObject =
  | { id: string; viewId: string; type: "trendline"; a: Point; b: Point; color?: string; width?: number }
  | { id: string; viewId: string; type: "hline"; y: number; color?: string; width?: number }
  | { id: string; viewId: string; type: "vline"; x: number; color?: string; width?: number }
  | { id: string; viewId: string; type: "rect"; a: Point; b: Point; color?: string; fill?: string; width?: number };

export interface DrawState {
  activeTool: ToolId;
  objects: DrawObject[];
  setActiveTool: (t: ToolId) => void;
  addObject: (o: DrawObject) => void;
  updateObject: (o: DrawObject) => void;
  deleteObject: (id: string) => void;
  clearView: (viewId: string) => void;
}

export const useDrawStore = create<DrawState>((set) => ({
  activeTool: "select",
  objects: [],
  setActiveTool: (t) => set({ activeTool: t }),
  addObject:     (o) => set((s) => ({ objects: [...s.objects, o] })),
  updateObject:  (o) => set((s) => ({ objects: s.objects.map(it => it.id === o.id ? o : it) })),
  deleteObject:  (id) => set((s) => ({ objects: s.objects.filter(it => it.id !== id) })),
  clearView:     (viewId) => set((s) => ({ objects: s.objects.filter(it => it.viewId !== viewId) })),
}));
