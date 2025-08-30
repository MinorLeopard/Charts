"use client";

import { useEffect, useRef, useState } from "react";
import { mountLwc, type LwcAdapter, type OHLC } from "@/lib/chart/lwcAdaptor";
import { useChartStore } from "@/store/chartStore";
import { fetchSeries } from "@/lib/data/fetchers";
import { Maximize2, Minimize2 } from "lucide-react";

type PriceRange = { from: number; to: number };

const PANEL_HEADER_PX = 24;  // internal header height
const PRICE_AXIS_W    = 64;  // right edge band to treat as price axis hover
const TIME_AXIS_H     = 28;  // bottom band to treat as time axis hover

export default function ChartPanel({ panelId }: { panelId: "p1" | "p2" | "p3" | "p4" }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [api, setApi] = useState<LwcAdapter | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "ready">("idle");

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

  // Mount chart + interactions
  useEffect(() => {
    if (!hostRef.current) return;
    const a = mountLwc(hostRef.current);

    a.chart.applyOptions({
      handleScroll: {
        mouseWheel: true,          // wheel = time scroll in pane
        pressedMouseMove: true,    // drag = time scroll
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,         // we handle wheel-zoom ourselves on axes
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
    if (!effectiveSymbol) { api.clear(); setStatus("empty"); return; }

    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const bars: OHLC[] = await fetchSeries(mode, effectiveSymbol, tf);
        if (cancelled) return;

        if (!bars || bars.length === 0) { api.clear(); setStatus("empty"); return; }
        api.setData(bars);
        setStatus("ready");
      } catch (e) {
        console.error("fetchSeries error", e);
        api?.clear();
        setStatus("empty");
      }
    })();

    return () => { cancelled = true; };
  }, [api, mode, effectiveSymbol, tf]);

  // ===== Vertical pan (Shift + drag) – translate visible price range, no zoom =====
  const drag = useRef<{
    active: boolean;
    startY: number;
    startRange: PriceRange | null;
    height: number;
  } | null>(null);

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
    const delta = dy * pricePerPx;

    ps.setVisibleRange({ from: base.from + delta, to: base.to + delta });
  };

  const onMouseUp = () => { if (drag.current) drag.current.active = false; };
  const onMouseLeave = onMouseUp;
  const onDoubleClick = () => { api?.chart.priceScale("right").setAutoScale(true); };

  // ===== Wheel: zoom on axes only =====
  useEffect(() => {
    if (!api || !hostRef.current) return;
    const el = hostRef.current;

    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const overPriceAxis = x > rect.width - PRICE_AXIS_W;
      const overTimeAxis  = y > rect.height - TIME_AXIS_H;

      // PRICE AXIS → price zoom centered at cursor price
      if (overPriceAxis) {
        e.preventDefault(); e.stopPropagation();
        const ps = api.chart.priceScale("right");
        const vr = ps.getVisibleRange();
        if (!vr) return;

        const yLocal = Math.max(0, y - PANEL_HEADER_PX);
        const centerPrice = api.coordToPrice(yLocal);
        if (centerPrice === undefined) return;

        const factor = e.deltaY > 0 ? 1.1 : 0.9; // out / in
        const span   = vr.to - vr.from;
        const newSpan = span * factor;

        const rel = (centerPrice - vr.from) / span;
        const newFrom = centerPrice - rel * newSpan;
        const newTo   = newFrom + newSpan;

        ps.setAutoScale(false);
        ps.setVisibleRange({ from: newFrom, to: newTo });
        return;
      }

      // TIME AXIS → time zoom (logical range) around cursor x-position
      if (overTimeAxis) {
        e.preventDefault(); e.stopPropagation();
        const ts = api.chart.timeScale();
        const lr = ts.getVisibleLogicalRange(); // {from,to} in logical units
        if (!lr) return;

        const width = rect.width;
        const rel = Math.max(0, Math.min(1, x / Math.max(1, width))); // 0..1 along the axis
        const span = lr.to - lr.from;
        const factor = e.deltaY > 0 ? 1.1 : 0.9; // out / in
        const newSpan = span * factor;

        // center logical value at cursor
        const centerLogical = lr.from + rel * span;
        const newFrom = centerLogical - rel * newSpan;
        const newTo   = newFrom + newSpan;

        ts.setVisibleLogicalRange({ from: newFrom, to: newTo });
        return;
      }

      // Else: not over axes → let default (time scroll) happen
      // (We did not preventDefault, so built-in horizontal scroll will run)
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [api]);

  return (
    <div
      className={`relative w-full h-full min-h-[320px] rounded-lg border ${isActive ? "ring-2 ring-blue-600" : ""} bg-panel`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onDoubleClick={onDoubleClick}
      tabIndex={0}
    >
      {/* header */}
      <div
        className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-2 py-1 text-xs text-muted"
        style={{ height: PANEL_HEADER_PX }}
      >
        <div className="opacity-80">
          {panel.symbol ?? (fallbackDemo ? "DEMO" : "—")} • {tf}
        </div>
        <button
          className="px-1 py-0.5 rounded hover:bg-white/5 border border-transparent hover:border-[var(--panel-border)]"
          onClick={(e) => { e.stopPropagation(); toggleMaximize(panelId); }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* chart mount target (pad for header) */}
      <div ref={hostRef} className="absolute inset-0" style={{ paddingTop: PANEL_HEADER_PX }} />

      {/* overlays */}
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingTop: PANEL_HEADER_PX }}>
          <div className="text-xs text-muted">
            {status === "loading" && "Loading…"}
            {status === "empty" &&
              (effectiveSymbol
                ? `No data for ${effectiveSymbol} (${tf}).`
                : "Select a symbol from the watchlist to load this panel.")}
          </div>
        </div>
      )}
    </div>
  );
}
