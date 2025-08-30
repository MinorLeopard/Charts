"use client";
import { useEffect, useRef, useState } from "react";
import { mountLwc, type LwcAdapter, type OHLC } from "@/lib/chart/lwcAdaptor";
import { useChartStore } from "@/store/chartStore";
import { fetchSeries } from "@/lib/data/fetchers";

export default function ChartPanel({ panelId }: { panelId: "p1" | "p2" | "p3" | "p4" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [api, setApi] = useState<LwcAdapter | null>(null);
  const mode = useChartStore(s => s.mode);
  const panel = useChartStore(s => s.panels[panelId]);
  const setActivePanel = useChartStore(s => s.setActivePanel);

  // pick effective symbol
  const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/mock";
  const fallbackDemo = BASE.includes("/api/mock") || mode === "online";
  const effectiveSymbol = panel.symbol ?? (fallbackDemo ? "DEMO" : undefined);
  const tf = panel.timeframe;

  useEffect(() => {
    if (!ref.current) return;
    const a = mountLwc(ref.current);
    setApi(a);
    return () => a.chart.remove();
  }, []);

  useEffect(() => {
    if (!api) return;
    if (!effectiveSymbol) {
      // clear the chart if no symbol
      api.setData([]);
      return;
    }
    (async () => {
      const bars: OHLC[] = await fetchSeries(mode, effectiveSymbol, tf);
      api.setData(bars);
    })();
  }, [api, mode, effectiveSymbol, tf]);

  return (
    <div className="relative w-full h-full min-h-[40vh] rounded-lg border" onMouseDown={() => setActivePanel(panelId)} tabIndex={0}>
      {/* chart mount */}
      <div ref={ref} className="absolute inset-0" />
      {/* empty state */}
      {!effectiveSymbol && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          Select a symbol from the watchlist to load this panel.
        </div>
      )}
    </div>
  );
}
