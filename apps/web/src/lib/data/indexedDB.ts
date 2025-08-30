import { openDB } from "idb";
type Bar = { t:number;o:number;h:number;l:number;c:number;v:number };

const DB_NAME = "charts-db";
const STORE = "bars";

async function db() {
  return openDB(DB_NAME, 1, { upgrade(d) {
    if (!d.objectStoreNames.contains(STORE)) {
      const s = d.createObjectStore(STORE, { keyPath: "key" });
      s.createIndex("bySymbolTf", "key");
    }
  }});
}

export async function putLocalBars(symbol: string, tf: string, bars: Bar[]) {
  const d = await db();
  await d.put(STORE, { key: `${symbol}::${tf}`, bars });
}

export async function getLocalBars(symbol: string, tf: string): Promise<Bar[]> {
  const d = await db();
  const row = await d.get(STORE, `${symbol}::${tf}`);
  return row?.bars ?? [];
}
