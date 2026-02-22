import type { CEPE, TF } from "@/types/watchlist";

const TF_NUMBER_MAP: Record<string, TF> = { "1": "1m", "5": "5m", "15": "15m" };

/**
 * Parse timeframe from filename suffix:
 *  "... , 1.csv" | "... , 5.csv" | "... , 15.csv"
 * tolerant to ",1" or "_15"
 */
export function tfFromName(name: string): TF | undefined {
  const base = name.replace(/\.csv$/i, "");
  const m = base.match(/([,_\-\s])\s*(1|5|15)\s*$/);
  if (!m) return undefined;
  const num = m[2];
  return TF_NUMBER_MAP[num];
}

/**
 * Extract option type + strike from:
 *  NSE_NIFTY250508C24250, 1.csv  => C|P + 24250
 *  NIFTY_250508_CE_24250, 5.csv  => CE|PE + 24250
 * Expiry comes from folder, not filename.
 */
export function parseOptionAndStrike(name: string): { optionType?: CEPE; strike?: number } {
  const base = name.replace(/\.csv$/i, "");

  // Pattern 1: ... YYMMDD (C|P) STRIKE
  const p1 = base.match(/([A-Z]+)?(\d{6})([CP])(\d{4,6})/i);
  if (p1) {
    const cp = p1[3].toUpperCase();
    const optionType = (cp === "C" ? "CE" : "PE") as CEPE;
    const strike = Number(p1[4]);
    if (!Number.isNaN(strike)) return { optionType, strike };
  }

  // Pattern 2: ... (CE|PE)[_-]?STRIKE
  const p2 = base.match(/\b(CE|PE)[ _-]?(\d{4,6})\b/i);
  if (p2) {
    const optionType = p2[1].toUpperCase() as CEPE;
    const strike = Number(p2[2]);
    if (!Number.isNaN(strike)) return { optionType, strike };
  }

  // Fallback: last large number as strike
  const lastNum = base.match(/(\d{4,6})(?!.*\d)/);
  if (lastNum) {
    const strike = Number(lastNum[1]);
    if (!Number.isNaN(strike)) return { strike };
  }

  return {};
}

export function parseFromFileName(name: string): { tf?: TF; optionType?: CEPE; strike?: number } {
  const tf = tfFromName(name);
  const { optionType, strike } = parseOptionAndStrike(name);
  return { tf, optionType, strike };
}
