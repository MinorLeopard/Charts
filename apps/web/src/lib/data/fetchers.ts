import { getLocalBars } from "@/lib/data/indexedDB";
import type { OHLC } from "@/lib/chart/lwcAdaptor";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/mock";

export async function fetchOnline(symbol: string, tf: string): Promise<OHLC[]> {
  const res = await fetch(`${BASE}/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}&limit=5000`);
  if (!res.ok) throw new Error("online fetch failed");
  const json: { data: OHLC[] } = await res.json();
  return json.data;
}

export async function fetchMock(symbol: string, tf: string): Promise<OHLC[]> {
  const N = 1000, now = Date.now();
  const step = tf.endsWith("m") ? parseInt(tf) * 60_000 : 300_000;
  const out: OHLC[] = [];
  let price = 100;
  for (let i = N - 1; i >= 0; i--) {
    const t = now - i * step;
    const drift = (Math.sin(i / 20) + Math.random() - 0.5) * 0.5;
    const o = price, c = Math.max(1, price + drift);
    const h = Math.max(o, c) + Math.random() * 0.7, l = Math.min(o, c) - Math.random() * 0.7;
    const v = Math.floor(100 + Math.random() * 500);
    out.push({ t, o, h, l, c, v });
    price = c;
  }
  return out;
}

export async function fetchSeries(mode: "online" | "offline", symbol: string, tf: string): Promise<OHLC[]> {
  if (mode === "offline") return getLocalBars(symbol, tf);            // ← prioritize offline
  if (!BASE || BASE.includes("/api/mock")) return fetchMock(symbol, tf);
  return fetchOnline(symbol, tf);
}
