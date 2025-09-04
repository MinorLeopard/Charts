"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mountLwc, type LwcAdapter, type OHLC } from "@/lib/chart/lwcAdaptor";
import { useChartStore } from "@/store/chartStore";
import { fetchSeries } from "@/lib/data/fetchers";
import { Maximize2, Minimize2, X as XIcon } from "lucide-react";
import {
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import DrawingOverlay from "./DrawingOverlay";
import type { CandlestickData } from "lightweight-charts";
import { useIndicatorStore, type IndicatorId } from "@/store/indicatorStore";
import { usePlotRegistry, type PlotAdapter } from "@/store/plotRegistryStore";
import { useCustomIndicatorStore } from "@/store/customIndicatorStore";
import { useIndicatorOverlayStore } from "@/store/indicatorOverlayStore";

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

  const [ohlc, setOhlc] = useState<{ o: number; h: number; l: number; c: number; v?: number; time?: number } | null>(
    null
  );

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

  // Built-ins selection
  const selectedMap = useIndicatorStore((s) => s.selected);
  const toggleBuiltin = useIndicatorStore((s) => s.toggle);
  const selectedIndicators = useMemo(() => selectedMap[viewId] ?? [], [selectedMap, viewId]);

  // Custom indicators
  const customSelected = useCustomIndicatorStore((s) => s.listForView(viewId));
  const customRegistry = useCustomIndicatorStore((s) => s.registry);
  const toggleCustomForView = useCustomIndicatorStore((s) => s.toggleForView);

  // Overlay clearing helpers
  const overlayClearView = useIndicatorOverlayStore((s) => s.clearView);
  const overlayClearByPrefix = useIndicatorOverlayStore((s) => s.clearByPrefix);

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

      const firstAny = Array.from(param.seriesData.values())[0];

      if (!firstAny || typeof firstAny !== "object" || !("open" in firstAny)) {
        setOhlc(null);
        return;
      }

      const first = firstAny as CandlestickWithVol;

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

  const removeSeriesKey = useCallback(
    (key: string) => {
      const s = overlaySeriesRef.current[key];
      if (s && api) {
        try {
          api.chart.removeSeries(s as unknown as ISeriesApi<"Line">);
        } catch {
          // ignore
        }
      }
      delete overlaySeriesRef.current[key];
    },
    [api]
  );

  /** Clear any panel-created series that start with a custom indicator prefix. */
  const clearCustomSeriesByPrefix = useCallback(
    (indicatorId: string) => {
      const prefixes = [`line:${indicatorId}::`, `bands:${indicatorId}::`, `hist:${indicatorId}::`, `box:${indicatorId}::`];
      Object.keys(overlaySeriesRef.current).forEach((k) => {
        if (prefixes.some((p) => k.startsWith(p))) removeSeriesKey(k);
      });
    },
    [removeSeriesKey]
  );

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

  // plot registry registration (tee → overlay, plus panel-drawn primitives)
  const plotRegistryRegister = usePlotRegistry((s) => s.register);
  const plotRegistryUnregister = usePlotRegistry((s) => s.unregister);

  useEffect(() => {
    if (!api) return;

    const adapter: PlotAdapter = {
      line: (id, series, opts) => {
        const color = (opts?.color as string) ?? "#c8c8c8";
        const priceScaleId = (opts?.priceScaleId as string) ?? "right";
        const s = ensureLine(`line:${id}`, color, priceScaleId);
        s?.setData(series.map((p) => ({ time: (p.time / 1000) as UTCTimestamp, value: p.value })));
      },
      bands: (id, series, opts) => {
        // Plot as three lines: upper/basis/lower
        const u = ensureLine(`bands:${id}:u`, (opts?.upperColor as string) ?? "#888", "right");
        const m = ensureLine(`bands:${id}:m`, (opts?.basisColor as string) ?? "#aaa", "right");
        const l = ensureLine(`bands:${id}:l`, (opts?.lowerColor as string) ?? "#888", "right");
        const toU = series.map((p) => ({ time: (p.time / 1000) as UTCTimestamp, value: p.upper }));
        const toM = series.map((p) => ({ time: (p.time / 1000) as UTCTimestamp, value: p.basis }));
        const toL = series.map((p) => ({ time: (p.time / 1000) as UTCTimestamp, value: p.lower }));
        u?.setData(toU);
        m?.setData(toM);
        l?.setData(toL);
      },
      histogram: (id, series, opts) => {
        const s = ensureHist(`hist:${id}`, (opts?.priceScaleId as string) ?? "right");
        s?.setData(
          series.map((p) => ({
            time: (p.time / 1000) as UTCTimestamp,
            value: p.value,
            color: (opts?.color as string) ?? undefined,
          }))
        );
      },
      boxes: (id, boxes, opts) => {
        // Minimal viable “box” implementation: draw top/bottom as two lines.
        const stroke = (opts?.stroke as string) ?? "#666";
        const t = ensureLine(`box:${id}:top`, stroke, "right");
        const b = ensureLine(`box:${id}:bot`, stroke, "right");
        // Convert boxes to 2-point segments per edge
        const topSegs = boxes
          .flatMap((bx) => [
            { time: bx.from, value: bx.top },
            { time: bx.to, value: bx.top },
          ])
          .map((p) => ({ time: (p.time / 1000) as UTCTimestamp, value: p.value }));
        const botSegs = boxes
          .flatMap((bx) => [
            { time: bx.from, value: bx.bottom },
            { time: bx.to, value: bx.bottom },
          ])
          .map((p) => ({ time: (p.time / 1000) as UTCTimestamp, value: p.value }));

        t?.setData(topSegs);
        b?.setData(botSegs);
      },
      labels: () => {
        // labels are rendered by the DrawingOverlay via overlay store tee
      },
    };

    const layoutNow = useChartStore.getState().layout; // read once to build viewId here
    const vId = `${layoutNow}:${panelId}`;

    plotRegistryRegister(vId, adapter);

    return () => {
      plotRegistryUnregister(vId);
      // optional: remove lingering series for this viewId if keyed by viewId
    };
  }, [api, panelId, ensureLine, ensureHist, plotRegistryRegister, plotRegistryUnregister]);

  const toLinePoints = useCallback(
    (arr: { time: number; value: number }[]): LineData<Time>[] =>
      arr.map((p) => ({ time: (p.time / 1000) as UTCTimestamp, value: p.value })),
    []
  );

  // ===== Built-ins compute helpers =====
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

  const computeBB = useCallback(
    (bars: OHLC[], period = 20, mult = 2) => {
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
    },
    [computeSMA]
  );

  const computeVWAP = useCallback((bars: OHLC[]) => {
    const out: { time: number; value: number }[] = [];
    let pvSum = 0;
    let vSum = 0;
    for (const b of bars) {
      const typical = (b.h + b.l + b.c) / 3;
      pvSum += typical * (b.v ?? 0);
      vSum += b.v ?? 0;
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
  const computeMACD = useCallback(
    (bars: OHLC[], fast = 12, slow = 26, signal = 9): MacdResult => {
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
      const hist: MacdPoint[] = macd.map((pt, i) => {
        const sv = sig[i]?.value ?? 0;
        return { time: pt.time, value: pt.value - sv };
      });
      return { macd, signal: sig, hist };
    },
    [computeEMA]
  );

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

    // Ensure RSI/MACD series exist before touching their scales
    const showRSI = has("rsi");
    const showMACD = has("macd");
    const rsiLine = showRSI ? ensureLine("rsi", "#ff7eb6", "rsi") : undefined;
    const macdLine = showMACD ? ensureLine("macdLine", "#2ecc71", "macd") : undefined;
    const macdSignal = showMACD ? ensureLine("macdSignal", "#e74c3c", "macd") : undefined;
    const macdHist = showMACD ? ensureHist("macdHist", "macd") : undefined;

    if (showRSI && showMACD) {
      try {
        api.chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.55, bottom: 0.25 } });
        api.chart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.8, bottom: 0.02 } });
      } catch {}
    } else if (showRSI) {
      try {
        api.chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.7, bottom: 0.02 } });
      } catch {}
    } else if (showMACD) {
      try {
        api.chart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.7, bottom: 0.02 } });
      } catch {}
    } else {
      // Neither used: no scale touches
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
    if (showRSI && rsiLine) {
      rsiLine.setData(toLinePoints(computeRSI(bars, 14)));
      try {
        const ps = api.chart.priceScale("rsi");
        ps.setAutoScale(false);
        ps.setVisibleRange({ from: 0, to: 100 });
      } catch {}
    } else {
      overlaySeriesRef.current["rsi"]?.setData([]);
    }

    // MACD sub-scale
    if (showMACD && macdLine && macdSignal && macdHist) {
      const macdRes = computeMACD(bars, 12, 26, 9);
      macdLine.setData(toLinePoints(macdRes.macd));
      macdSignal.setData(toLinePoints(macdRes.signal));
      macdHist.setData(
        macdRes.hist.map((p) => ({
          time: (p.time / 1000) as UTCTimestamp,
          value: p.value,
          color: p.value >= 0 ? "#2ecc71" : "#e74c3c",
        }))
      );
      try {
        api.chart.priceScale("macd").setAutoScale(true);
      } catch {}
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

  // --- Refresh overlays & panel series when symbol / timeframe changes
  useEffect(() => {
    // Clear overlay store and panel series when chart context changes
    overlayClearView(viewId);
    Object.keys(overlaySeriesRef.current).forEach((k) => {
      try {
        overlaySeriesRef.current[k]?.setData([]);
      } catch {}
    });
  }, [viewId, effectiveSymbol, tf, overlayClearView]);

  // ===== Chips UI for built-ins + custom =====
  const chips = useMemo(() => {
    const builtins = (selectedIndicators ?? []).map((id) => ({
      id,
      label: id.toUpperCase(),
      kind: "builtin" as const,
    }));
    const customs = (customSelected ?? []).map((id) => ({
      id,
      label: customRegistry[id]?.name ?? id,
      kind: "custom" as const,
    }));
    return [...builtins, ...customs];
  }, [selectedIndicators, customSelected, customRegistry]);

  const removeChip = useCallback(
    (chipId: string, kind: "builtin" | "custom") => {
      if (kind === "builtin") {
        toggleBuiltin(viewId, chipId);
      } else {
        // toggle selection off
        toggleCustomForView(viewId, chipId);
        // clear everything this custom drew: overlays + series
        overlayClearByPrefix(viewId, `${chipId}::`);
        clearCustomSeriesByPrefix(chipId);
      }
    },
    [viewId, toggleBuiltin, toggleCustomForView, overlayClearByPrefix, clearCustomSeriesByPrefix]
  );

  // ===== Run selected CUSTOM indicators (saved ones) =====
  // Runs whenever customSelections change or chart context changes.
  const prevCustomSelRef = useRef<string[]>([]);
  useEffect(() => {
    if (!api || !effectiveSymbol) return;
    const bars = barsRef.current ?? [];
    if (bars.length === 0) return;

    // detect removals (to clear their series/overlays immediately)
    const prev = prevCustomSelRef.current;
    const removed = prev.filter((id) => !customSelected.includes(id));
    removed.forEach((id) => {
      overlayClearByPrefix(viewId, `${id}::`);
      clearCustomSeriesByPrefix(id);
    });
    prevCustomSelRef.current = customSelected.slice();

    // run all currently selected customs
    const workers: Worker[] = [];
    for (const indicatorId of customSelected) {
      const meta = customRegistry[indicatorId];
      if (!meta?.code) continue;

      // Before running, clear previous outputs for this id (fresh redraw)
      overlayClearByPrefix(viewId, `${indicatorId}::`);
      clearCustomSeriesByPrefix(indicatorId);

      const src = `
        function compile(code) {
          const wrapped = \`"use strict"; let exports = {}; let module = { exports };\\n\` + code +
            \`\\n; const __exp = module.exports && module.exports.default ? module.exports.default : module.exports; return __exp;\`;
          return new Function(wrapped);
        }
        function rpc(method, params) {
          return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).slice(2);
            const handler = (e) => {
              const m = e.data;
              if (!m || !m.__rpc || m.id !== id) return;
              self.removeEventListener('message', handler);
              if (m.error) reject(new Error(m.error));
              else resolve(m.result);
            };
            self.addEventListener('message', handler);
            postMessage({ __rpc: true, id, method, params });
          });
        }
        function makeEnv(spec) {
          return {
            symbol: spec.symbol,
            timeframe: spec.timeframe,
            getBars: (s, tf) => rpc('getBars', { symbol: s, timeframe: tf }),
            plot: {
              line: (id, series, opts) => rpc('plot:line', { id, series, opts }),
              bands: (id, series, opts) => rpc('plot:bands', { id, series, opts }),
              histogram: (id, series, opts) => rpc('plot:histogram', { id, series, opts }),
              boxes: (id, boxes, opts) => rpc('plot:boxes', { id, boxes, opts }),
              labels: (id, labels, opts) => rpc('plot:labels', { id, labels, opts }),
            },
            attachments: { list: () => rpc('attachments:list', {}), csv: (name) => rpc('attachments:csv', { name }) },
            utils: {
              sma: (arr, len) => { const out=[]; let s=0; for(let i=0;i<arr.length;i++){ s+=arr[i]; if(i>=len) s-=arr[i-len]; if(i>=len-1) out.push(s/len);} return out; },
              ema: (arr, len) => { const k=2/(len+1); let prev=arr[0]; const out=[prev]; for(let i=1;i<arr.length;i++){ prev = arr[i]*k + prev*(1-k); out.push(prev);} return out; },
              rsi: (arr, len=14) => {
                const gains=[], losses=[];
                for (let i=1;i<arr.length;i++){ const d=arr[i]-arr[i-1]; gains.push(Math.max(d,0)); losses.push(Math.max(-d,0)); }
                const avg=(a,n)=>{ let s=0; const out=[]; for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=n) s-=a[i-n]; if(i>=n-1) out.push(s/n);} return out; };
                const ag=avg(gains,len), al=avg(losses,len);
                const out=[...Array(len).fill(50)];
                for (let i=0;i<ag.length;i++){ const rs = al[i]===0 ? 1000 : ag[i]/al[i]; out.push(100 - 100/(1+rs)); }
                return out;
              },
            }
          };
        }
        self.onmessage = async (e) => {
          const msg = e.data;
          if (!msg || msg.type !== 'run') return;
          const { code, envSpec, timeoutMs = 2000 } = msg;
          let finished = false;
          const t = setTimeout(() => {
            if (!finished) postMessage({ type: 'done', timedOut: true });
          }, timeoutMs);
          try {
            const factory = compile(code);
            const entry = factory();
            if (typeof entry !== 'function') throw new Error('Your script must export a function');
            const env = makeEnv(envSpec);
            const maybe = entry(env);
            if (maybe && typeof maybe.then === 'function') await maybe;
            finished = true;
            postMessage({ type: 'done' });
          } catch (err) {
            postMessage({ type: 'done', error: String(err && err.message || err) });
          } finally { clearTimeout(t); }
        };
      `;
      const worker = new Worker(URL.createObjectURL(new Blob([src], { type: "application/javascript" })));
      workers.push(worker);

      // Wire RPCs into panel via plot registry
      const rpcHandler = async (ev: MessageEvent<unknown>) => {
        const msg = ev.data as unknown;
        const isRpc =
          !!msg && typeof msg === "object" && "__rpc" in (msg as Record<string, unknown>) && (msg as { __rpc?: unknown }).__rpc === true;
        if (!isRpc) return;

        const { id: rpcId, method, params } = msg as {
          __rpc: true;
          id: string;
          method: string;
          params?: unknown;
        };

        const reply = (result?: unknown, error?: string) =>
          worker.postMessage({ __rpc: true, id: rpcId, result, error });

        try {
          switch (method) {
            case "getBars": {
              const mapped = bars.map((b) => ({
                time: b.t,
                open: b.o,
                high: b.h,
                low: b.l,
                close: b.c,
                volume: b.v,
              }));
              reply(mapped);
              break;
            }
            case "plot:line":
            case "plot:bands":
            case "plot:histogram":
            case "plot:boxes":
            case "plot:labels": {
              const prefix = `${indicatorId}::`;
              const id = String((params as { id: string }).id);
              const nsId = id.startsWith(prefix) ? id : prefix + id;
              const reg: PlotAdapter | undefined = usePlotRegistry.getState().get(viewId);
              if (!reg) {
                reply(undefined, "No plot adapter");
                break;
              }
              if (method === "plot:line") {
                const p = params as { series: { time: number; value: number }[]; opts?: Record<string, unknown> };
                reg.line(nsId, p.series, p.opts);
              }
              if (method === "plot:bands") {
                const p = params as { series: { time: number; upper: number; basis: number; lower: number }[]; opts?: Record<string, unknown> };
                reg.bands(nsId, p.series, p.opts);
              }
              if (method === "plot:histogram") {
                const p = params as { series: { time: number; value: number }[]; opts?: Record<string, unknown> };
                reg.histogram(nsId, p.series, p.opts);
              }
              if (method === "plot:boxes") {
                const p = params as { boxes: { from: number; to: number; top: number; bottom: number }[]; opts?: Record<string, unknown> };
                reg.boxes(nsId, p.boxes, p.opts);
              }
              if (method === "plot:labels") {
                const p = params as {
                  labels: Array<{
                    time: number; price: number; text?: string;
                    color?: string; bg?: string; align?: "above" | "below";
                    shape?: "up" | "down" | "circle"; size?: number; stroke?: string; strokeWidth?: number
                  }>;
                  opts?: Record<string, unknown>;
                };
                // Ensure `text` is always a string (IndicatorLabel requires it)
                const safe = (p.labels ?? []).map(l => ({ ...l, text: l?.text ?? "" }));
                reg.labels(nsId, safe as unknown as Parameters<PlotAdapter["labels"]>[1], p.opts);
              }
              reply(true);
              break;
            }
            case "attachments:list":
            case "attachments:csv":
              // (Optional) hook up to your attachments infra if needed in panel-run
              reply([]);
              break;
            default:
              reply(undefined, `Unknown method: ${String(method)}`);
          }
        } catch (err: unknown) {
          reply(undefined, err instanceof Error ? err.message : String(err));
        }
      };
      worker.addEventListener("message", rpcHandler);

      worker.postMessage({
        type: "run",
        code: meta.code,
        envSpec: { symbol: effectiveSymbol, timeframe: tf },
        timeoutMs: 2000,
      });
    }

    return () => {
      // terminate workers on deps change
      workers.forEach((w) => w.terminate());
    };
  }, [
    api,
    effectiveSymbol,
    tf,
    viewId,
    customSelected,
    customRegistry,
    overlayClearByPrefix,
    clearCustomSeriesByPrefix,
  ]);

  return (
    <div
      className={`relative w-full h-full min-h[320px] rounded-md 
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
            <span>{formatTime(ohlc.time)}</span> <span>O: {ohlc.o}</span> <span>H: {ohlc.h}</span>{" "}
            <span>L: {ohlc.l}</span> <span>C: {ohlc.c}</span> <span>V: {formatVol(ohlc.v)}</span>
          </>
        )}
      </div>

      {/* indicator chips row (below OHLC) */}
      {(selectedIndicators.length > 0 || customSelected.length > 0) && (
        <div className="absolute left-2 top-6 z-20 text-[10px] flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={`${chip.kind}:${chip.id}`}
              className="inline-flex items-center gap-1 px-2 py-[2px] rounded-md border border-white/20 bg-white/10"
            >
              {chip.label}
              <button
                className="inline-flex items-center justify-center w-3 h-3 rounded-sm border border-white/30 ml-1 hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(chip.id, chip.kind);
                }}
                title="Remove indicator"
              >
                <XIcon size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* header right */}
      <div
        className="absolute right-2 top-1 z-20 flex items-center gap-2 text-xs text-muted"
        style={{ height: PANEL_HEADER_PX }}
      >
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
      <div ref={hostRef} className="absolute inset-0" style={{ paddingTop: PANEL_HEADER_PX + 18 }} />

      {/* drawings overlay */}
      {api && (
        <DrawingOverlay api={api} panelId={panelId} symbol={panel.symbol ?? (fallbackDemo ? "DEMO" : undefined)} />
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
