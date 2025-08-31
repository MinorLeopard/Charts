export type OhlcIn = { t: number; o: number; h: number; l: number; c: number; v: number };
export type LinePoint = { time: number; value: number };
export type BandPoint = { time: number; upper: number; middle: number; lower: number };

const toSec = (ms: number) => Math.floor(ms / 1000);

export function sma(bars: OhlcIn[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= period) sum -= bars[i - period].c;
    if (i >= period - 1) out.push({ time: toSec(bars[i].t), value: sum / period });
  }
  return out;
}

export function ema(bars: OhlcIn[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  if (bars.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = bars[0].c;
  for (let i = 0; i < bars.length; i++) {
    const val = i === 0 ? prev : bars[i].c * k + prev * (1 - k);
    prev = val;
    if (i >= period - 1) out.push({ time: toSec(bars[i].t), value: val });
  }
  return out;
}

export function bollinger(bars: OhlcIn[], period = 20, mult = 2): BandPoint[] {
  const pts: BandPoint[] = [];
  const win: number[] = [];
  let sum = 0, sumSq = 0;
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i].c;
    win.push(c); sum += c; sumSq += c * c;
    if (win.length > period) {
      const d = win.shift()!;
      sum -= d; sumSq -= d * d;
    }
    if (win.length === period) {
      const mean = sum / period;
      const variance = Math.max(0, sumSq / period - mean * mean);
      const stdev = Math.sqrt(variance);
      pts.push({
        time: toSec(bars[i].t),
        upper: mean + mult * stdev,
        middle: mean,
        lower: mean - mult * stdev,
      });
    }
  }
  return pts;
}

// Session VWAP (resets when date changes)
export function vwap(bars: OhlcIn[]): LinePoint[] {
  const out: LinePoint[] = [];
  let cumPV = 0, cumVol = 0, curDay = -1;
  for (const b of bars) {
    const d = new Date(b.t).getUTCDate();
    if (d !== curDay) { curDay = d; cumPV = 0; cumVol = 0; }
    const tp = (b.h + b.l + b.c) / 3;
    cumPV += tp * b.v;
    cumVol += b.v || 1;
    out.push({ time: toSec(b.t), value: cumPV / Math.max(1, cumVol) });
  }
  return out;
}
