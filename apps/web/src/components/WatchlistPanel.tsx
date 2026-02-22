"use client";
import React, { useEffect, useMemo } from "react";
import { useWatchlistStore } from "@/store/watchlistStore";
import type { TF } from "@/types/watchlist";


const TFs: TF[] = ["1m", "5m", "15m"];


export default function WatchlistPanel() {
const rows = useWatchlistStore((s) => s.rows);
const tf = useWatchlistStore((s) => s.selectedTF);
const setTF = useWatchlistStore((s) => s.setSelectedTF);
const importDir = useWatchlistStore((s) => s.importFromDirectory);
const openRow = useWatchlistStore((s) => s.openRowInChart);
const importing = useWatchlistStore((s) => s.importing);
const progress = useWatchlistStore((s) => s.importProgress);


useEffect(() => {
// try to rehydrate on first mount
useWatchlistStore.getState().rehydrate();
}, []);


const matchedPct = useMemo(() => {
if (!progress) return 0;
if (!progress.files) return 0;
return Math.round((progress.matched / progress.files) * 100);
}, [progress]);


// Example listener: if you want to route the CSV to a specific loader here,
// you can attach a window listener in your top-level chart component instead.
// Keeping it here for reference:
useEffect(() => {
function onOpen(e: any) {
const { csv, meta, tf } = e.detail as { csv: string; meta: any; tf: TF };
console.info("watchlist:open → ", meta, tf, csv.length, "bytes");
// Example: call your own chart store here
// useChartDataStore.getState().loadCSVForActiveView(csv, { meta, tf })
}
window.addEventListener("watchlist:open", onOpen);
return () => window.removeEventListener("watchlist:open", onOpen);
}, []);


return (
<div className="flex flex-col gap-3 p-3">
<div className="flex items-center gap-2">
<button className="px-3 py-1 rounded border" onClick={importDir} disabled={importing}>
{importing ? "Indexing…" : "Import Folder"}
</button>
{importing && progress && (
<div className="text-xs ml-2">
Files: <b>{progress.files}</b> · Matched: <b>{progress.matched}</b> · {matchedPct}%
</div>
)}
<div className="ml-auto flex items-center gap-1">
{TFs.map((t) => (
<button
key={t}
className={`px-2 py-1 rounded border ${tf === t ? "bg-neutral-800 text-white" : ""}`}
onClick={() => setTF(t)}
title="Global timeframe"
>
{t}
</button>
))}
</div>
</div>


<div className="text-xs text-neutral-500">{rows.length} contracts indexed</div>


<div className="flex flex-col divide-y">
{rows.map((r) => (
<div
key={`${r.key.underlying}-${r.key.expiry}-${r.key.strike}-${r.key.optionType}`}
className="flex items-center gap-3 py-2"
>
<div className="w-64 font-mono truncate">
{r.key.underlying} {r.key.expiry} {r.key.strike}
{r.key.optionType}
</div>
<div className="text-xs">
TF: {r.stats?.has1m ? "1m " : ""}
{r.stats?.has5m ? "5m " : ""}
{r.stats?.has15m ? "15m" : ""}
</div>
<button className="ml-auto px-2 py-1 rounded border" onClick={() => openRow(r)}>
Open
</button>
</div>
))}
</div>
</div>
);
}