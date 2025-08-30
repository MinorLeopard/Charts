"use client";
import { useEffect, useRef, useState } from "react";
import { mountLwc } from "@/lib/chart/lwcAdaptor";
import { useChartStore } from "@/store/chartStore";
import { fetchSeries } from "@/lib/data/fetchers";

export default function ChartPanel() {
  const ref = useRef<HTMLDivElement|null>(null);
  const [api, setApi] = useState<any>(null);
  const mode = useChartStore(s=>s.mode);
  const panel = useChartStore(s=>s.panels["p1"]);
  const symbol = panel.symbol || "DEMO";
  const tf = panel.timeframe;

  useEffect(()=> {
    if (!ref.current) return;
    const a = mountLwc(ref.current);
    setApi(a);
    return ()=>a.chart.remove();
  }, []);

  useEffect(()=> {
    if (!api) return;
    (async ()=>{
      const bars = await fetchSeries(mode, symbol, tf);
      api.setData(bars);
    })();
  }, [api, mode, symbol, tf]);

  return (
    <div className="w-full h-[70vh] rounded border" ref={ref} />
  );
}
