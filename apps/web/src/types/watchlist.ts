export type TF = "1m" | "5m" | "15m";
export type CEPE = "CE" | "PE";

export interface WatchlistRowKey {
  underlying: string; // "NIFTY"
  expiry: string; // YYYYMMDD
  strike: number;
  optionType: CEPE;
}

export interface WatchlistRow {
  key: WatchlistRowKey;
  filesByTF: Partial<Record<TF, FileSystemFileHandle>>;
  stats?: { has1m: boolean; has5m: boolean; has15m: boolean };
}

export interface WatchlistIndexRow {
  key: WatchlistRowKey;
  tf: { m1: boolean; m5: boolean; m15: boolean };
}

export interface WatchlistState {
  rows: WatchlistRow[];
  selectedTF: TF;
  importing: boolean;
  importProgress: { files: number; matched: number } | null;
  importFromDirectory: () => Promise<void>;
  rehydrate: () => Promise<void>;
  clearWatchlist: () => void;
  setSelectedTF: (tf: TF) => void;
  openRowInChart: (row: WatchlistRow) => Promise<void>;
}
