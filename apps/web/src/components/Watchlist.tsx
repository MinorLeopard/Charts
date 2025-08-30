"use client";
import { useChartStore } from "@/store/chartStore";

const DEFAULTS = [
  { id: "1", label: "DEMO (mock)", symbol: "DEMO" },
];

export default function Watchlist() {
  const activeId = useChartStore(s => s.activePanelId);

  const load = (symbol: string) => {
    useChartStore.setState(s => ({
      panels: { ...s.panels, [activeId]: { ...s.panels[activeId], symbol } },
    }));
  };

  return (
    <div className="flex flex-col gap-1">
      {DEFAULTS.map(it => (
        <button key={it.id} onClick={() => load(it.symbol)} className="px-2 py-1 rounded hover:bg-muted text-left">
          <div className="text-sm font-medium">{it.label}</div>
          <div className="text-xs opacity-70">{it.symbol}</div>
        </button>
      ))}
    </div>
  );
}
