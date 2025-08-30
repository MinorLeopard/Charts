import ModeToggle from "@/components/ModeToggle";
import CsvImportDialog from "@/components/CsvImportDialog";
import LayoutSwitcher from "@/components/LayoutSwitcher";
import PanelsGrid from "@/components/PanelsGrid";
import Watchlist from "@/components/Watchlist";

export default function Page() {
  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      <div className="col-span-9 space-y-3">
        <div className="flex items-center justify-between gap-3 bg-panel border rounded-xl px-3 py-2">
          <div className="flex items-center gap-3">
            <ModeToggle />
            <LayoutSwitcher />
          </div>
          <CsvImportDialog />
        </div>
        <div className="bg-panel border rounded-xl p-2">
          <PanelsGrid />
        </div>
      </div>
      <aside className="col-span-3">
        <div className="bg-panel border rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">Watchlist</span>
          </div>
          <Watchlist />
        </div>
      </aside>
    </div>
  );
}

