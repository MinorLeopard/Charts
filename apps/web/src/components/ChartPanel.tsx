"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mountLwc, type LwcAdapter, type OHLC } from "@/lib/chart/lwcAdaptor";
import { useChartStore } from "@/store/chartStore";
import { fetchSeries } from "@/lib/data/fetchers";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type SeriesDataItemTypeMap,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import DrawingOverlay from "./DrawingOverlay";
import type { CandlestickData } from "lightweight-charts";
import { useIndicatorStore, type IndicatorId } from "@/store/indicatorStore";

interface CandlestickWithVol extends CandlestickData<Time> {
  volume?: number;
}
type PriceRange = { from: number; to: number };

const PANEL_HEADER_PX = 24;
const PRICE_AXIS_W = 64;
const TIME_AXIS_H = 28;

function formatVol(v: number | undefined) {
  if (v === undefined) return "";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toString();
}
function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChartPanel({ panelId }: { panelId: "p1" | "p2" | "p3" | "p4" }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [api, setApi] = useState<LwcAdapter | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "ready">("idle");

  const [ohlc, setOhlc] = useState<{ o: number; h: number; l: number; c: number; v?: number; time?: number } | null>(null);

  // stores
  const mode = useChartStore((s) => s.mode);
  const panel = useChartStore((s) => s.panels[panelId]);
  const setActivePanel = useChartStore((s) => s.setActivePanel);
  const isActive = useChartStore((s) => s.activePanelId === panelId);
  const maximizedPanelId = useChartStore((s) => s.maximizedPanelId);
  const toggleMaximize = useChartStore((s) => s.toggleMaximize);
  const isMaximized = maximizedPanelId === panelId;

  // indicators selected for this "view"
  const layout = useChartStore((s) => s.layout);
  const viewId = `${layout}:${panelId}`;
  const selectedIndicators = useIndicatorStore(
    useCallback((s) => s.list(viewId), [viewId])
  ) as IndicatorId[];

  const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/mock";
  const fallbackDemo = BASE.includes("/api/mock") || mode === "online";
  const effectiveSymbol = panel.symbol ?? (fallbackDemo ? "DEMO" : undefined);
  const tf = panel.timeframe;

  // mount/unmount chart
  useEffect(() => {
    if (!hostRef.current) return;
    const a = mountLwc(hostRef.current);

    a.chart.applyOptions({
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: {
        mouseWheel: true, // wheel = time scroll
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false, // we override axis zoom manually
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: true,
      },
    });

    setApi(a);
    return () => a.chart.remove();
  }, []);

  // load data
  const barsRef = useRef<OHLC[] | null>(null);
  useEffect(() => {
    if (!api) return;
    if (!effectiveSymbol) {
      api.clear();
      barsRef.current = [];
      setStatus("empty");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const bars: OHLC[] = await fetchSeries(mode, effectiveSymbol, tf);
        if (cancelled) return;

        if (!bars || bars.length === 0) {
          api.clear();
          barsRef.current = [];
          setStatus("empty");
          return;
        }
        barsRef.current = bars;
        api.setData(bars);
        setStatus("ready");
      } catch (e) {
        console.error("fetchSeries error", e);
        api?.clear();
        barsRef.current = [];
        setStatus("empty");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, mode, effectiveSymbol, tf]);

  // crosshair header
  useEffect(() => {
    if (!api) return;

    const onMove = (param: MouseEventParams<Time>) => {
      const t = param.time;
      if (typeof t !== "number" || !param.seriesData || param.seriesData.size === 0) {
        setOhlc(null);
        return;
      }

      // The map value is (WhitespaceData | CandlestickData). Narrow first:
      const firstAny = Array.from(param.seriesData.values())[0];

      if (!firstAny || typeof firstAny !== "object" || !("open" in firstAny)) {
        // It's whitespace (no bar at that point)
        setOhlc(null);
        return;
      }

      // Now it's safe to treat as candle (optionally carrying volume)
      const first = firstAny as CandlestickData<Time> & { volume?: number };

      setOhlc({
        o: first.open,
        h: first.high,
        l: first.low,
        c: first.close,
        v: first.volume,
        time: t as UTCTimestamp,
      });
    };

    api.chart.subscribeCrosshairMove(onMove);
    return () => api.chart.unsubscribeCrosshairMove(onMove);
  }, [api]);


  // vertical pan with Shift+drag
  const drag = useRef<{ active: boolean; startY: number; startRange: PriceRange | null; height: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    setActivePanel(panelId);
    if (!e.shiftKey || !api || !hostRef.current) return;
    const ps = api.chart.priceScale("right");
    const vr = ps.getVisibleRange();
    drag.current = {
      active: true,
      startY: e.clientY,
      startRange: vr ? { from: vr.from, to: vr.to } : null,
      height: hostRef.current.clientHeight || 1,
    };
    e.preventDefault();
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current?.active || !api) return;
    const ps = api.chart.priceScale("right");
    ps.setAutoScale(false);
    const base = drag.current.startRange ?? ps.getVisibleRange();
    if (!base) return;
    const dy = e.clientY - drag.current.startY;
    const pricePerPx = (base.to - base.from) / Math.max(1, drag.current.height);
    ps.setVisibleRange({ from: base.from + dy * pricePerPx, to: base.to + dy * pricePerPx });
  };
  const onMouseUp = () => {
    if (drag.current) drag.current.active = false;
  };
  const onMouseLeave = onMouseUp;
  const onDoubleClick = () => {
    api?.chart.priceScale("right").setAutoScale(true);
  };

  // wheel zoom on axes only
  useEffect(() => {
    if (!api || !hostRef.current) return;
    const el = hostRef.current;

    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const overPriceAxis = x > rect.width - PRICE_AXIS_W;
      const overTimeAxis = y > rect.height - TIME_AXIS_H;

      if (overPriceAxis) {
        e.preventDefault();
        e.stopPropagation();
        const ps = api.chart.priceScale("right");
        const vr = ps.getVisibleRange();
        if (!vr) return;
        const yLocal = Math.max(0, y - PANEL_HEADER_PX);
        const centerPrice = api.coordToPrice(yLocal);
        if (centerPrice === undefined) return;

        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        const span = vr.to - vr.from;
        const newSpan = span * factor;
        const rel = (centerPrice - vr.from) / span;
        const newFrom = centerPrice - rel * newSpan;
        const newTo = newFrom + newSpan;

        ps.setAutoScale(false);
        ps.setVisibleRange({ from: newFrom, to: newTo });
        return;
      }

      if (overTimeAxis) {
        e.preventDefault();
        e.stopPropagation();
        const ts = api.chart.timeScale();
        const lr = ts.getVisibleLogicalRange();
        if (!lr) return;

        const width = rect.width;
        const rel = Math.max(0, Math.min(1, x / Math.max(1, width)));
        const span = lr.to - lr.from;
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        const newSpan = span * factor;

        const center = lr.from + rel * span;
        const newFrom = center - rel * newSpan;
        const newTo = newFrom + newSpan;

        ts.setVisibleLogicalRange({ from: newFrom, to: newTo });
        return;
      }
      // default: time scroll
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [api]);

  // ===== Indicators (compute + render) =====

  type AnySeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;
  const overlaySeriesRef = useRef<Record<string, AnySeries | undefined>>({});

  const ensureLine = useCallback(
    (key: string, color: string, priceScaleId: string) => {
      let s = overlaySeriesRef.current[key] as ISeriesApi<"Line"> | undefined;
      if (!s && api) {
        s = api.chart.addSeries(LineSeries, {
          priceScaleId,
          color,
          lineWidth: 1,
        });
        overlaySeriesRef.current[key] = s;
      }
      return s as ISeriesApi<"Line"> | undefined;
    },
    [api]
  );

  const ensureHist = useCallback(
    (key: string, priceScaleId: string) => {
      let s = overlaySeriesRef.current[key] as ISeriesApi<"Histogram"> | undefined;
      if (!s && api) {
        s = api.chart.addSeries(HistogramSeries, {
          priceScaleId,
          priceFormat: { type: "volume" },
        });
        overlaySeriesRef.current[key] = s;
      }
      return s as ISeriesApi<"Histogram"> | undefined;
    },
    [api]
  );

  const toLinePoints = useCallback(
    (arr: { time: number; value: number }[]): LineData<Time>[] =>
      arr.map((p) => ({ time: (p.time / 1000) as UTCTimestamp, value: p.value })),
    []
  );

  const computeSMA = useCallback((bars: OHLC[], period = 20) => {
    const out: { time: number; value: number }[] = [];
    let sum = 0;
    const q: number[] = [];
    for (const b of bars) {
      q.push(b.c);
      sum += b.c;
      if (q.length > period) sum -= q.shift()!;
      if (q.length === period) out.push({ time: b.t, value: sum / period });
    }
    return out;
  }, []);

  const computeEMA = useCallback((bars: OHLC[], period = 20) => {
    const out: { time: number; value: number }[] = [];
    const k = 2 / (period + 1);
    let ema: number | null = null;
    for (const b of bars) {
      ema = ema == null ? b.c : b.c * k + ema * (1 - k);
      out.push({ time: b.t, value: ema });
    }
    return out.slice(period - 1);
  }, []);

  const computeBB = useCallback((bars: OHLC[], period = 20, mult = 2) => {
    const outMid = computeSMA(bars, period);
    const outUp: { time: number; value: number }[] = [];
    const outDn: { time: number; value: number }[] = [];

    const q: number[] = [];
    for (const b of bars) {
      q.push(b.c);
      if (q.length > period) q.shift();
      if (q.length === period) {
        const mean = q.reduce((a, v) => a + v, 0) / period;
        const variance = q.reduce((a, v) => a + (v - mean) * (v - mean), 0) / period;
        const sd = Math.sqrt(variance);
        outUp.push({ time: b.t, value: mean + mult * sd });
        outDn.push({ time: b.t, value: mean - mult * sd });
      }
    }
    return { mid: outMid, up: outUp, dn: outDn };
  }, [computeSMA]);

  const computeVWAP = useCallback((bars: OHLC[]) => {
    const out: { time: number; value: number }[] = [];
    let pvSum = 0;
    let vSum = 0;
    for (const b of bars) {
      const typical = (b.h + b.l + b.c) / 3;
      pvSum += typical * (b.v ?? 0);
      vSum += (b.v ?? 0);
      if (vSum > 0) out.push({ time: b.t, value: pvSum / vSum });
    }
    return out;
  }, []);

  const computeRSI = useCallback((bars: OHLC[], period = 14) => {
    const out: { time: number; value: number }[] = [];
    if (bars.length < period + 1) return out;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = bars[i].c - bars[i - 1].c;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    let rs = losses === 0 ? 100 : gains / losses;
    out.push({ time: bars[period].t, value: 100 - 100 / (1 + rs) });

    for (let i = period + 1; i < bars.length; i++) {
      const diff = bars[i].c - bars[i - 1].c;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
      rs = losses === 0 ? 100 : gains / losses;
      out.push({ time: bars[i].t, value: 100 - 100 / (1 + rs) });
    }
    return out;
  }, []);

  type MacdPoint = { time: number; value: number };
  type MacdResult = { macd: MacdPoint[]; signal: MacdPoint[]; hist: MacdPoint[] };
  const computeMACD = useCallback((bars: OHLC[], fast = 12, slow = 26, signal = 9): MacdResult => {
    if (bars.length < slow + signal) return { macd: [], signal: [], hist: [] };
    const emaF = computeEMA(bars, fast);
    const emaS = computeEMA(bars, slow);
    const mapS = new Map<number, number>();
    for (const p of emaS) mapS.set(p.time, p.value);
    const macd: MacdPoint[] = [];
    for (const p of emaF) {
      const sv = mapS.get(p.time);
      if (sv != null) macd.push({ time: p.time, value: p.value - sv });
    }
    const k = 2 / (signal + 1);
    const sig: MacdPoint[] = [];
    let sVal: number | null = null;
    for (const p of macd) {
      sVal = sVal == null ? p.value : p.value * k + (sVal as number) * (1 - k);
      sig.push({ time: p.time, value: sVal });
    }
    const hist: MacdPoint[] = macd.map((p, i) => {
      const sv = sig[i]?.value ?? 0;
      return { time: p.time, value: p.value - sv };
    });
    return { macd, signal: sig, hist };
  }, [computeEMA]);

  // render indicators whenever selection or data changes
  useEffect(() => {
    if (!api) return;
    const bars = barsRef.current ?? [];

    if (bars.length === 0) {
      for (const k of Object.keys(overlaySeriesRef.current)) {
        overlaySeriesRef.current[k]?.setData([]);
      }
      return;
    }

    const has = (id: IndicatorId) => selectedIndicators.includes(id);

    // Ensure RSI/MACD series exist before setting their priceScale margins
    const showRSI = has("rsi");
    const showMACD = has("macd");
    if (showRSI) ensureLine("rsi", "#ff7eb6", "rsi");
    if (showMACD) {
      ensureLine("macdLine", "#2ecc71", "macd");
      ensureLine("macdSignal", "#e74c3c", "macd");
      ensureHist("macdHist", "macd");
    }

    if (showRSI && showMACD) {
      api.chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.55, bottom: 0.25 } });
      api.chart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.80, bottom: 0.02 } });
    } else if (showRSI) {
      api.chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.70, bottom: 0.02 } });
    } else if (showMACD) {
      api.chart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.70, bottom: 0.02 } });
    }

    // overlays
    if (has("sma")) {
      const s = ensureLine("sma", "#f2c94c", "right");
      s?.setData(toLinePoints(computeSMA(bars, 20)));
    } else overlaySeriesRef.current["sma"]?.setData([]);

    if (has("ema")) {
      const s = ensureLine("ema", "#56ccf2", "right");
      s?.setData(toLinePoints(computeEMA(bars, 20)));
    } else overlaySeriesRef.current["ema"]?.setData([]);

    if (has("vwap")) {
      const s = ensureLine("vwap", "#9b51e0", "right");
      s?.setData(toLinePoints(computeVWAP(bars)));
    } else overlaySeriesRef.current["vwap"]?.setData([]);

    if (has("bb")) {
      const { mid, up, dn } = computeBB(bars, 20, 2);
      const m = ensureLine("bbMid", "#999", "right");
      const u = ensureLine("bbUp", "#666", "right");
      const d = ensureLine("bbDn", "#666", "right");
      m?.setData(toLinePoints(mid));
      u?.setData(toLinePoints(up));
      d?.setData(toLinePoints(dn));
    } else {
      overlaySeriesRef.current["bbMid"]?.setData([]);
      overlaySeriesRef.current["bbUp"]?.setData([]);
      overlaySeriesRef.current["bbDn"]?.setData([]);
    }

    // RSI sub-scale
    if (showRSI) {
      const rsiLine = ensureLine("rsi", "#ff7eb6", "rsi");
      const rsi = computeRSI(bars, 14);
      rsiLine?.setData(toLinePoints(rsi));
      const ps = api.chart.priceScale("rsi");
      ps.setAutoScale(false);
      ps.setVisibleRange({ from: 0, to: 100 });
    } else {
      overlaySeriesRef.current["rsi"]?.setData([]);
    }

    // MACD sub-scale
    if (showMACD) {
      const m = ensureLine("macdLine", "#2ecc71", "macd");
      const s = ensureLine("macdSignal", "#e74c3c", "macd");
      const h = ensureHist("macdHist", "macd");
      const macdRes = computeMACD(bars, 12, 26, 9);

      m?.setData(toLinePoints(macdRes.macd));
      s?.setData(toLinePoints(macdRes.signal));
      h?.setData(
        macdRes.hist.map((p) => ({
          time: (p.time / 1000) as UTCTimestamp,
          value: p.value,
          color: p.value >= 0 ? "#2ecc71" : "#e74c3c",
        }))
      );
      api.chart.priceScale("macd").setAutoScale(true);
    } else {
      overlaySeriesRef.current["macdLine"]?.setData([]);
      overlaySeriesRef.current["macdSignal"]?.setData([]);
      overlaySeriesRef.current["macdHist"]?.setData([]);
    }
  }, [
    api,
    selectedIndicators,
    ensureLine,
    ensureHist,
    computeSMA,
    computeEMA,
    computeBB,
    computeVWAP,
    computeRSI,
    computeMACD,
    toLinePoints,
  ]);

  return (
    <div
      className={`relative w-full h-full min-h-[320px] rounded-md 
        border-2 ${isActive ? "border-blue-600" : "border-[var(--panel-border)]"} bg-panel`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onDoubleClick={onDoubleClick}
      tabIndex={0}
    >
      {/* top-left header */}
      <div className="absolute left-2 top-1 z-20 text-xs flex items-center gap-3" style={{ height: PANEL_HEADER_PX }}>
        <span className="font-semibold">{panel.symbol ?? (fallbackDemo ? "DEMO" : "—")}</span>
        {ohlc && (
          <>
            <span>{formatTime(ohlc.time)}</span>
            <span>O: {ohlc.o}</span>
            <span>H: {ohlc.h}</span>
            <span>L: {ohlc.l}</span>
            <span>C: {ohlc.c}</span>
            <span>V: {formatVol(ohlc.v)}</span>
          </>
        )}
      </div>

      {/* header right */}
      <div className="absolute right-2 top-1 z-20 flex items-center gap-2 text-xs text-muted" style={{ height: PANEL_HEADER_PX }}>
        <button
          className="px-1 py-0.5 rounded hover:bg-white/5 border border-transparent hover:border-[var(--panel-border)]"
          onClick={(e) => {
            e.stopPropagation();
            toggleMaximize(panelId);
          }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* chart host */}
      <div ref={hostRef} className="absolute inset-0" style={{ paddingTop: PANEL_HEADER_PX }} />

      {/* drawings overlay */}
      {api && (
        <DrawingOverlay
          api={api}
          panelId={panelId}
          symbol={panel.symbol ?? (fallbackDemo ? "DEMO" : undefined)}
        />
      )}

      {/* status */}
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingTop: PANEL_HEADER_PX }}>
          <div className="text-xs text-muted">
            {status === "loading" && "Loading…"}
            {status === "empty" &&
              (effectiveSymbol ? `No data for ${effectiveSymbol} (${tf}).` : "Select a symbol from the watchlist.")}
          </div>
        </div>
      )}
    </div>
  );
}
