"use client";

import { useEffect, useRef, useState } from "react";
import { mountLwc, type LwcAdapter, type OHLC } from "@/lib/chart/lwcAdaptor";
import { useChartStore } from "@/store/chartStore";
import { fetchSeries } from "@/lib/data/fetchers";
import { Maximize2, Minimize2 } from "lucide-react";
import { CrosshairMode } from "lightweight-charts";

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

  // store
  const mode = useChartStore((s) => s.mode);
  const panel = useChartStore((s) => s.panels[panelId]);
  const setActivePanel = useChartStore((s) => s.setActivePanel);
  const isActive = useChartStore((s) => s.activePanelId === panelId);

  const maximizedPanelId = useChartStore((s) => s.maximizedPanelId);
  const toggleMaximize = useChartStore((s) => s.toggleMaximize);
  const isMaximized = maximizedPanelId === panelId;

  const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/mock";
  const fallbackDemo = BASE.includes("/api/mock") || mode === "online";
  const effectiveSymbol = panel.symbol ?? (fallbackDemo ? "DEMO" : undefined);
  const tf = panel.timeframe;

  // Mount chart
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

  // Load data
  useEffect(() => {
    if (!api) return;
    if (!effectiveSymbol) {
      api.clear();
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
          setStatus("empty");
          return;
        }
        api.setData(bars);
        setStatus("ready");
      } catch (e) {
        console.error("fetchSeries error", e);
        api?.clear();
        setStatus("empty");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, mode, effectiveSymbol, tf]);

  // Crosshair → update OHLCV + Time
  useEffect(() => {
    if (!api) return;
    const onMove = (param: any) => {
      if (!param?.time || !param?.seriesData || param.seriesData.size === 0) {
        setOhlc(null);
        return;
      }
      const first = Array.from(param.seriesData.values())[0] as any;
      if (!first || typeof first.open !== "number") {
        setOhlc(null);
        return;
      }
      setOhlc({
        o: first.open,
        h: first.high,
        l: first.low,
        c: first.close,
        v: first.volume,
        time: Number(param.time),
      });
    };
    api.chart.subscribeCrosshairMove(onMove);
    return () => api.chart.unsubscribeCrosshairMove(onMove);
  }, [api]);

  // ===== Vertical pan (Shift + drag) =====
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
    let base = drag.current.startRange ?? ps.getVisibleRange();
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

  // ===== Wheel: zoom on axes only =====
  useEffect(() => {
    if (!api || !hostRef.current) return;
    const el = hostRef.current;

    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const overPriceAxis = x > rect.width - PRICE_AXIS_W;
      const overTimeAxis = y > rect.height - TIME_AXIS_H;

      // PRICE AXIS → price zoom
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

      // TIME AXIS → time zoom
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
      // else: default scroll (time navigation)
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [api]);

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

      <div ref={hostRef} className="absolute inset-0" style={{ paddingTop: PANEL_HEADER_PX }} />

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
