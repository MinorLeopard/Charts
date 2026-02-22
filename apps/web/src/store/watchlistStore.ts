"use client";

import { create } from "zustand";
import type { WatchlistRow, WatchlistRowKey, WatchlistState, TF } from "@/types/watchlist";
import { parseFromFileName } from "@/lib/watchlistParsers";
import { idbGetHandle, idbSetHandle } from "@/lib/idbHandles";

function keyId(key: WatchlistRowKey): string {
  return `${key.underlying}-${key.expiry}-${key.strike}-${key.optionType}`;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  rows: [],
  selectedTF: "5m",
  importing: false,
  importProgress: null,

  setSelectedTF: (tf: TF) => set({ selectedTF: tf }),

  clearWatchlist: () => {
    localStorage.removeItem("watchlist_index");
    set({ rows: [] });
  },

  rehydrate: async () => {
    try {
      const raw = localStorage.getItem("watchlist_index");
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        rootName: string;
        rows: Array<{
          key: WatchlistRowKey;
          tf: { m1: boolean; m5: boolean; m15: boolean };
        }>;
      };

      const rows: WatchlistRow[] = parsed.rows.map((r) => ({
        key: r.key,
        filesByTF: {},
        stats: { has1m: r.tf.m1, has5m: r.tf.m5, has15m: r.tf.m15 },
      }));

      set({ rows });

      const saved = await idbGetHandle("watchlist-root");
      // Best effort: keep permission warm if granted (no-op if not supported)
      if (saved && (await (saved as any).queryPermission?.({ mode: "read" })) === "granted") {
        // nothing else needed until user re-imports
      }
    } catch (e) {
      console.error("rehydrate failed", e);
    }
  },

  importFromDirectory: async () => {
    // @ts-ignore
    if (!(window as any).showDirectoryPicker) {
      alert("Your browser does not support folder import. Use Chrome/Edge desktop.");
      return;
    }

    // @ts-ignore
    const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
      mode: "read",
    });

    try {
      await idbSetHandle("watchlist-root", dirHandle);
      // @ts-ignore
      await (dirHandle as any).requestPermission?.({ mode: "read" });
    } catch {
      // ignore
    }

    set({ importing: true, importProgress: { files: 0, matched: 0 } });

    const rowsMap = new Map<string, WatchlistRow>();
    const underlying = dirHandle.name.toUpperCase();

    async function walk(folder: FileSystemDirectoryHandle, parentExpiry?: string) {
      // @ts-ignore
      for await (const entry of (folder as any).values()) {
        if (entry.kind === "directory") {
          const possibleExpiry = entry.name;
          if (/^\d{8}$/.test(possibleExpiry)) {
            await walk(entry, possibleExpiry);
          } else {
            await walk(entry, parentExpiry);
          }
        } else if (entry.kind === "file") {
          set((s) => ({
            importProgress: s.importProgress
              ? { ...s.importProgress, files: s.importProgress.files + 1 }
              : { files: 1, matched: 0 },
          }));

          if (!parentExpiry) continue;
          const name = entry.name;
          if (!name.toLowerCase().endsWith(".csv")) continue;

          const { tf, optionType, strike } = parseFromFileName(name);
          if (!tf || !optionType || !strike) continue;

          set((s) => ({
            importProgress: s.importProgress
              ? { ...s.importProgress, matched: s.importProgress.matched + 1 }
              : { files: 0, matched: 1 },
          }));

          const key: WatchlistRowKey = { underlying, expiry: parentExpiry, strike, optionType };
          const id = keyId(key);

          let row = rowsMap.get(id);
          if (!row) {
            row = { key, filesByTF: {} };
            rowsMap.set(id, row);
          }
          (row.filesByTF as any)[tf] = entry;
        }
      }
    }

    await walk(dirHandle);

    const rows: WatchlistRow[] = Array.from(rowsMap.values()).map((r) => ({
      ...r,
      stats: {
        has1m: !!r.filesByTF["1m"],
        has5m: !!r.filesByTF["5m"],
        has15m: !!r.filesByTF["15m"],
      },
    }));

    localStorage.setItem(
      "watchlist_index",
      JSON.stringify({
        rootName: underlying,
        rows: rows.map((r) => ({
          key: r.key,
          tf: {
            m1: !!r.filesByTF["1m"],
            m5: !!r.filesByTF["5m"],
            m15: !!r.filesByTF["15m"],
          },
        })),
      })
    );

    set({ rows, importing: false, importProgress: null });
  },

  openRowInChart: async (row: WatchlistRow) => {
    const tf = get().selectedTF;
    const handle =
      row.filesByTF[tf] ?? row.filesByTF["5m"] ?? row.filesByTF["1m"] ?? row.filesByTF["15m"];

    if (!handle) {
      console.warn("No file handle for row", row);
      return;
    }

    const file = await (handle as any).getFile();
    const csv = await file.text();

    const detail = { csv, meta: row.key, tf } as const;
    window.dispatchEvent(new CustomEvent("watchlist:open", { detail }));
  },
}));
