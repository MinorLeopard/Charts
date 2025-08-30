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

  const symbol = panel.symbol || "DEMO";
  const tf = panel.timeframe;

  useEffect(() => {
    if (!ref.current) return;
    const a = mountLwc(ref.current);
    setApi(a);
    return () => a.chart.remove();
  }, []);

  useEffect(() => {
    if (!api) return;
    (async () => {
      const bars: OHLC[] = await fetchSeries(mode, symbol, tf);
      api.setData(bars);
    })();
  }, [api, mode, symbol, tf]);

  const isActive = useChartStore(s => s.activePanelId === panelId);
  return (
    <div
      ref={ref}
      className={`w-full h-full min-h-[40vh] rounded-lg border ${isActive ? "ring-2 ring-blue-600" : ""}`}
      onMouseDown={() => setActivePanel(panelId)}
      tabIndex={0}
    />
  );

}
