"use client";

import dynamic from "next/dynamic";
import ModeToggle from "@/components/ModeToggle";
import CsvImportDialog from "@/components/CsvImportDialog";
import Toolbar from "@/components/Toolbar";
import IndicatorsDialog from "@/components/IndicatorsDialog";
// these are client-only
const PanelsGrid = dynamic(() => import("@/components/PanelsGrid"), { ssr: false });
const LayoutSwitcher = dynamic(() => import("@/components/LayoutSwitcher"), { ssr: false });
const Watchlist = dynamic(() => import("@/components/Watchlist"), { ssr: false });

export default function ClientChartsShell() {
  return (
    <div className="min-h-screen h-screen p-4 grid grid-cols-12 gap-4">
      <Toolbar />
      <main className="col-span-9 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 bg-panel border rounded-xl px-3 py-2">
          <div className="flex items-center gap-3">
            <ModeToggle />
            <LayoutSwitcher />
            <IndicatorsDialog />
          </div>
          <CsvImportDialog />
        </div>

        <div className="flex-1 bg-panel border rounded-xl p-2">
          <PanelsGrid />
        </div>
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
