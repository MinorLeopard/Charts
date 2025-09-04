// src/components/ClientChartsShell.tsx
"use client";

import dynamic from "next/dynamic";
import ModeToggle from "@/components/ModeToggle";
import CsvImportDialog from "@/components/CsvImportDialog";
import IndicatorsDialog from "@/components/IndicatorsDialog";
import Toolbar from "./Toolbar";
import Button from "@/components/ui/button";
import { Code } from "lucide-react";
import { useMemo, useState, useCallback } from "react";

import { useChartStore } from "@/store/chartStore";
import { usePlotRegistry, type PlotAdapter } from "@/store/plotRegistryStore";
import { fetchSeries } from "@/lib/data/fetchers";
import type { OHLC } from "@/lib/chart/lwcAdaptor";
import { useIndicatorOverlayStore, type IndicatorLabel } from "@/store/indicatorOverlayStore";
import { useAttachmentsStore } from "@/store/attachmentsStore";

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
              plots={plots} // ← always has .labels now
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
