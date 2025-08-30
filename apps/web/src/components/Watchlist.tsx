"use client";
import { useChartStore } from "@/store/chartStore";

export default function Watchlist() {
  const watchlist = useChartStore(s => s.watchlist);
  const activeId = useChartStore(s => s.activePanelId);

  const load = (symbol: string) => {
    useChartStore.setState(s => ({
      panels: { ...s.panels, [activeId]: { ...s.panels[activeId], symbol } },
    }));
  };

  if (watchlist.length === 0) {
    return <div className="text-xs opacity-70">No items yet. Import a CSV or add from DB.</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      {watchlist.map(it => (
        <button key={it.id} onClick={() => load(it.symbol)} className="px-2 py-1 rounded hover:bg-muted text-left">
          <div className="text-sm font-medium">{it.label || it.symbol}</div>
          <div className="text-xs opacity-70">{it.source.toUpperCase()}</div>
        </button>
      ))}
    </div>
  );
}
