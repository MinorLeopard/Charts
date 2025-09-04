import { create } from "zustand";
import { addCsv, listCsv, getCsv, type CsvManifest } from "@/lib/indicators/attachments";

type State = {
  manifests: Record<string, CsvManifest | undefined>;
  list: string[];
  add: (file: File) => Promise<CsvManifest>;
  refresh: () => Promise<void>;
  getCsvByName: (name: string) => Promise<{ columns: string[]; rows: Record<string, string>[] }>;
};

export const useAttachmentsStore = create<State>((set, get) => ({
  manifests: {},
  list: [],
  add: async (file: File) => {
    const m = await addCsv(file);
    set((s) => ({ manifests: { ...s.manifests, [m.name]: m } }));
    await get().refresh();
    return m;
  },
  refresh: async () => {
    const names = await listCsv();
    set({ list: names });
  },
  getCsvByName: async (name: string) => getCsv(name),
}));
