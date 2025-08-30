import ModeToggle from "@/components/ModeToggle";
import CsvImportDialog from "@/components/CsvImportDialog";
import ChartPanel from "@/components/ChartPanel";
import Watchlist from "@/components/Watchlist";

export default function Page() {
  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      <div className="col-span-9 space-y-3">
        <div className="flex items-center justify-between">
          <ModeToggle />
          <CsvImportDialog />
        </div>
        <ChartPanel />
      </div>
      <div className="col-span-3">
        <h3 className="text-sm font-semibold mb-2">Watchlist</h3>
        <Watchlist />
      </div>
    </div>
  );
}
