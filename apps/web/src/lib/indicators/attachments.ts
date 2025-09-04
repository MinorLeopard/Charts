// Lightweight IndexedDB CSV store (no deps)
export type CsvManifest = {
  name: string;
  size: number;
  createdAt: number;
  checksum: string; // simple CRC-ish hash
  columns: string[];
  rowCount: number;
};

const DB_NAME = "empire.attachments";
const DB_VER = 1;
const STORE = "csvFiles";

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function put(key: string, value: ArrayBuffer) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function get(key: string): Promise<ArrayBuffer | undefined> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result as ArrayBuffer | undefined);
    r.onerror = () => rej(r.error);
  });
}

async function keys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => res((req.result as IDBValidKey[]).map(String));
    req.onerror = () => rej(req.error);
  });
}

function checksum(bytes: Uint8Array): string {
  // Tiny non-cryptographic rolling hash
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  // Minimal CSV (commas, quotes, newlines). For speed/safety, keep it simple.
  const rows: string[][] = [];
  let i = 0,
    cur = "",
    row: string[] = [],
    inQ = false;

  while (i < text.length) {
    const ch = text[i++];
    if (inQ) {
      if (ch === '"') {
        if (text[i] === '"') {
          cur += '"';
          i++;
        } // escaped quote
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i] === "\n") i++;
        row.push(cur);
        cur = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else cur += ch;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  const columns = rows.shift() ?? [];
  const objs = rows.map((r) => {
    const o: Record<string, string> = {};
    for (let j = 0; j < columns.length; j++) o[columns[j]] = r[j] ?? "";
    return o;
  });
  return { columns, rows: objs };
}

// Public API
export async function addCsv(file: File): Promise<CsvManifest> {
  const buf = await file.arrayBuffer();
  await put(file.name, buf);
  const text = new TextDecoder("utf-8").decode(new Uint8Array(buf));
  const parsed = parseCsv(text);
  return {
    name: file.name,
    size: file.size,
    createdAt: Date.now(),
    checksum: checksum(new Uint8Array(buf)),
    columns: parsed.columns,
    rowCount: parsed.rows.length,
  };
}

export async function listCsv(): Promise<string[]> {
  return keys();
}

export async function getCsv(name: string): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  const buf = await get(name);
  if (!buf) throw new Error(`CSV not found: ${name}`);
  const text = new TextDecoder("utf-8").decode(new Uint8Array(buf));
  return parseCsv(text);
}
