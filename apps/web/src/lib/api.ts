export async function fetchCandles(symbol: string, tf: string) {
  const base = process.env.NEXT_PUBLIC_API_BASE!;
  const res = await fetch(`${base}/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`);
  if (!res.ok) throw new Error("fetch candles failed");
  return res.json();
}
