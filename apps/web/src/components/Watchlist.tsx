"use client";
import { useChartStore, type WatchItem } from "@/store/chartStore";

export default function Watchlist() {
  const items = useChartStore(s => s.watchlist);
  const activeId = useChartStore(s => s.activePanelId);
  const setPanelSymbol = useChartStore(s => s.setPanelSymbol);

  const load = (symbol: string) => setPanelSymbol(activeId, symbol);

  if (!items?.length) return <div className="text-xs opacity-70">No items yet.</div>;

  return (
    <div className="flex flex-col gap-1">
      {items.map((it: WatchItem) => (
        <button
          key={it.id}
          onClick={() => load(it.symbol)}
          className="px-2 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-[var(--panel-border)] transition"
        >
          <div className="text-sm font-medium">{it.label || it.symbol}</div>
          <div className="text-xs text-muted">{it.source.toUpperCase()}</div>
        </button>

      ))}
    </div>
  );
}
