"use client";

import Button from "@/components/ui/button";
import { useCallback, useState } from "react";
import { useChartStore } from "@/store/chartStore";
import { fetchSeries } from "@/lib/data/fetchers";
import { useIndicatorOverlayStore } from "@/store/indicatorOverlayStore";
import type { OHLC } from "@/lib/chart/lwcAdaptor";

export default function DebugDrawButton() {
  const [busy, setBusy] = useState(false);
  const layout = useChartStore((s) => s.layout);
  const activePanelId = useChartStore((s) => s.activePanelId);
  const panel = useChartStore((s) => s.panels[activePanelId]);
  const mode = useChartStore((s) => s.mode);

  const viewId = `${layout}:${activePanelId}`;
  const symbol = panel?.symbol ?? "DEMO";
  const timeframe = panel?.timeframe ?? "5m";

  const draw = useCallback(async () => {
    try {
      setBusy(true);
      const rows: OHLC[] = await fetchSeries(mode, symbol, timeframe);
      if (!rows?.length) {
        console.warn("[DebugDraw] no bars");
        return;
      }
      const last = rows[rows.length - 1];
      const prev = rows[rows.length - 2] ?? last;
      const bw = Math.max(1, last.t - prev.t); // ms width (your OHLC.t is ms)
      const close = last.c;

      const box = {
        from: last.t,
        to: last.t + bw - 1,
        top: close * 1.03,
        bottom: close * 0.97,
      };

      console.log("[DebugDraw] setBoxes", { viewId, box });
      useIndicatorOverlayStore.getState().setBoxes(viewId, "debug-one", [box], {
        fill: "rgba(255,0,0,0.55)",
        stroke: "rgba(255,0,0,1)",
        lineWidth: 3,
        z: 99,
      });
    } finally {
      setBusy(false);
    }
  }, [mode, symbol, timeframe, viewId]);

  return (
    <Button size="sm" variant="secondary" onClick={draw} disabled={busy} title="Draw a big red box on the active chart">
      {busy ? "Drawing…" : "Draw Test Box"}
    </Button>
  );
}
