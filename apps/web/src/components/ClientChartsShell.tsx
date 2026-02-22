// src/components/ClientChartsShell.tsx
"use client";

import dynamic from "next/dynamic";
import ModeToggle from "@/components/ModeToggle";
import CsvImportDialog from "@/components/CsvImportDialog";
import IndicatorsDialog from "@/components/IndicatorsDialog";
import Toolbar from "./Toolbar";
import Button from "@/components/ui/button";
import { Code } from "lucide-react";
import { useMemo, useState, useCallback, useEffect } from "react";

import { useChartStore } from "@/store/chartStore";
import { usePlotRegistry, type PlotAdapter } from "@/store/plotRegistryStore";
import { fetchSeries } from "@/lib/data/fetchers";
import type { OHLC } from "@/lib/chart/lwcAdaptor";
import { useIndicatorOverlayStore, type IndicatorLabel } from "@/store/indicatorOverlayStore";
import { useAttachmentsStore } from "@/store/attachmentsStore";
import type { TF } from "@/types/watchlist";

// client-only chunks
const PanelsGrid = dynamic(() => import("@/components/PanelsGrid"), { ssr: false });
const LayoutSwitcher = dynamic(() => import("@/components/LayoutSwitcher"), { ssr: false });
const Watchlist = dynamic(() => import("@/components/Watchlist"), { ssr: false });

// props-typed import for the editor drawer
const EditorRunnerPanel = dynamic<import("@/components/EditorRunnerPanel").EditorRunnerPanelProps>(
  () => import("@/components/EditorRunnerPanel"),
  { ssr: false }
);

// helper: map OHLC to Bar
const mapToBars = (rows: OHLC[]) =>
  rows.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));

// small CSV -> OHLC parser used for watchlist handoff
function csvToOHLC(csv: string): OHLC[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const data = lines.slice(1); // skip header
  const out: OHLC[] = [];
  for (const line of data) {
    const cols = line.split(",");
    if (cols.length < 6) continue;
    const tRaw = cols[0];
    // Expect epoch seconds or a ISO-like date string
    const t = /^\d+$/.test(tRaw) ? Number(tRaw) : Math.floor(new Date(tRaw).getTime() / 1000);
    out.push({
      t,
      o: Number(cols[1]),
      h: Number(cols[2]),
      l: Number(cols[3]),
      c: Number(cols[4]),
      v: Number(cols[5]),
    });
  }
  return out;
}

export default function ClientChartsShell() {
  const [showEditor, setShowEditor] = useState(false);

  // current view/panel
  const layout = useChartStore((s) => s.layout);
  const activePanelId = useChartStore((s) => s.activePanelId);
  const activePanel = useChartStore((s) => s.panels[activePanelId]);
  const mode = useChartStore((s) => s.mode);

  const viewId = `${layout}:${activePanelId}`;
  const symbol = activePanel?.symbol ?? "DEMO";
  const timeframe = activePanel?.timeframe ?? "5m";

  // adapter possibly registered by ChartPanel
  const regPlots = usePlotRegistry((s) => s.get(viewId)) as PlotAdapter | undefined;

  // attachments
  const getCsvByName = useAttachmentsStore((s) => s.getCsvByName);

  // env for runner
  const getActiveChartEnv = useCallback(
    () => ({
      symbol,
      timeframe,
      getBars: async (s?: string, tf?: string) => {
        const raw = await fetchSeries(mode, s ?? symbol, tf ?? timeframe);
        return mapToBars(raw);
      },
      listAttachments: async () => {
        await useAttachmentsStore.getState().refresh();
        return useAttachmentsStore.getState().list;
      },
      getCsvAttachment: async (name: string) => getCsvByName(name),
    }),
    [symbol, timeframe, mode, getCsvByName]
  );

  // fallback adapter that writes to overlay store
  const fallbackPlots: PlotAdapter = useMemo(
    () => ({
      line: () => {},
      bands: () => {},
      histogram: () => {},
      boxes: (id, boxes, opts) => {
        useIndicatorOverlayStore.getState().setBoxes(viewId, id, boxes, opts);
      },
      labels: (id: string, labels: IndicatorLabel[]) => {
        useIndicatorOverlayStore.getState().setLabels(viewId, id, labels);
      },
    }),
    [viewId]
  );

  // SAFE adapter: whatever is registered, ensure .labels exists
  const plots: PlotAdapter = useMemo(() => {
    if (!regPlots) return fallbackPlots;
    return {
      ...regPlots,
      labels:
        regPlots.labels ??
        ((id: string, labels: IndicatorLabel[]) => {
          useIndicatorOverlayStore.getState().setLabels(viewId, id, labels);
        }),
    };
  }, [regPlots, fallbackPlots, viewId]);

  // 🔗 Listen for watchlist -> open events and hand off to the panel layer
  useEffect(() => {
    function onWatchlistOpen(e: Event) {
      const { csv, meta, tf } = (e as CustomEvent).detail as {
        csv: string;
        meta: { underlying: string; expiry: string; strike: number; optionType: "CE" | "PE" };
        tf: TF;
      };

      // Convert CSV to OHLC
      const ohlc = csvToOHLC(csv);

      // (optional) update panel symbol/timeframe if your store exposes actions
      try {
        const symbolLabel = `${meta.underlying}-${meta.expiry}-${meta.strike}${meta.optionType}`;
        // useChartStore.getState().setActivePanelSymbol?.(activePanelId, symbolLabel);
        // useChartStore.getState().setActivePanelTimeframe?.(activePanelId, tf);
      } catch {}

      // ✅ Tell the specific panel (by viewId) to replace its primary series
      window.dispatchEvent(
        new CustomEvent("chart:load-primary", {
          detail: {
            viewId,
            ohlc, // <- raw OHLC[] the panel's LWC adapter expects
            meta,
            tf,
          } as const,
        })
      );

      console.info("Watchlist → Panel event", viewId, meta, tf, "bars:", ohlc.length);
    }

    window.addEventListener("watchlist:open", onWatchlistOpen);
    return () => window.removeEventListener("watchlist:open", onWatchlistOpen);
  }, [layout, activePanelId, viewId]);

  return (
    <div className="min-h-screen h-screen p-4 grid grid-cols-12 gap-4">
      <Toolbar />

      <main className="col-span-9 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 bg-panel border rounded-xl px-3 py-2">
          <div className="flex items-center gap-3">
            <ModeToggle />
            <LayoutSwitcher />
            <IndicatorsDialog />
            <Button
              size="sm"
              variant={showEditor ? "default" : "secondary"}
              onClick={() => setShowEditor((v) => !v)}
              title="Open custom indicators editor"
            >
              <Code className="h-4 w-4 mr-1" />
              {showEditor ? "Close Editor" : "Open Editor"}
            </Button>
          </div>
          <CsvImportDialog />
        </div>

        <div className="flex-1 bg-panel border rounded-xl p-2 min-h-0">
          <PanelsGrid />
        </div>

        {showEditor && (
          <div className="bg-panel border rounded-xl overflow-hidden">
            <EditorRunnerPanel
              viewId={viewId}
              getActiveChartEnv={getActiveChartEnv}
              plots={plots}
              onApplyAsIndicator={async () => {}}
            />
          </div>
        )}
      </main>

      <aside className="col-span-3 flex flex-col">
        <div className="bg-panel border rounded-xl p-3 h-[calc(100vh-2rem)] overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Watchlist</h3>
          </div>
          <Watchlist />
        </div>
      </aside>
    </div>
  );
}
