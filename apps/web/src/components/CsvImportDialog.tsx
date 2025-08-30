"use client";
import Papa from "papaparse";
import { useState } from "react";
import { putLocalBars } from "@/lib/data/indexedDB";
import { useChartStore } from "@/store/chartStore";

type Bar = { t:number;o:number;h:number;l:number;c:number;v:number };

function nk(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseTime(val: unknown): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number") return val < 1e12 ? Math.round(val * 1000) : Math.round(val);
  const s = String(val).trim();
  if (s === "") return undefined;
  const n = Number(s);
  if (Number.isFinite(n)) return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

export default function CsvImportDialog() {
  const [symbol, setSymbol] = useState("");
  const [tf, setTf] = useState(process.env.NEXT_PUBLIC_DEFAULT_TF || "5m");
  const [busy, setBusy] = useState(false);

  const setMode = useChartStore.getState().setMode;
  const activePanelId = useChartStore.getState().activePanelId;

  const onFile = (file: File) => {
    setBusy(true);
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      worker: true,
      complete: async (r) => {
        try {
          const rows = r.data;
          const bars: Bar[] = [];
          let skippedBadTime = 0, skippedBadNum = 0;

          for (const raw of rows) {
            const row: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(raw)) {
              const key = nk(k);
              if (row[key] == null || row[key] === "") row[key] = v;
            }
            const t = parseTime(row.time ?? row.timestamp ?? row.datetime ?? row.date ?? row.t);
            const o = Number(row.open ?? row.o ?? row.op);
            const h = Number(row.high ?? row.h);
            const l = Number(row.low ?? row.l);
            const c = Number(row.close ?? row.c ?? row.cl);
            const vNum = Number(row.volume ?? row.vol ?? row.v ?? row.qty ?? row.quantity ?? row.contracts);
            const v = Number.isFinite(vNum) ? vNum : 0;

            if (t === undefined) { skippedBadTime++; continue; }
            if (![o, h, l, c].every(Number.isFinite)) { skippedBadNum++; continue; }

            bars.push({ t, o, h, l, c, v });
          }

          bars.sort((a, b) => a.t - b.t);

          if (bars.length === 0) {
            alert(`Imported 0 bars.\nBad time: ${skippedBadTime}\nBad OHLC: ${skippedBadNum}`);
            return;
          }

          const sym = symbol || file.name.replace(/\..+$/, "");
          await putLocalBars(sym, tf, bars);

          // auto-switch to offline and load
          setMode("offline");
          useChartStore.setState(s => ({
            panels: { ...s.panels, [activePanelId]: { ...s.panels[activePanelId], symbol: sym, timeframe: tf } },
          }));

          alert(`Imported ${bars.length} bars into ${sym} (${tf}). Loaded into active chart.`);
        } finally {
          setBusy(false);
        }
      },
      error: (err) => {
        setBusy(false);
        alert("CSV parse error: " + err.message);
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <input className="border px-2 py-1 rounded" placeholder="Symbol" value={symbol} onChange={(e)=>setSymbol(e.target.value)} />
      <input className="border px-2 py-1 rounded" placeholder="Timeframe (e.g. 5m)" value={tf} onChange={(e)=>setTf(e.target.value)} />
      <label className="px-3 py-1 rounded border cursor-pointer">
        {busy ? "Importing..." : "Import CSV"}
        <input type="file" accept=".csv,text/csv" onChange={(e)=> e.target.files && onFile(e.target.files[0])} className="hidden" disabled={busy} />
      </label>
    </div>
  );
}
