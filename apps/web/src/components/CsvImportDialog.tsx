"use client";
import Papa from "papaparse";
import { putLocalBars } from "@/lib/data/indexedDB";
import { useState } from "react";

export default function CsvImportDialog() {
  const [symbol, setSymbol] = useState("");
  const [tf, setTf] = useState(process.env.NEXT_PUBLIC_DEFAULT_TF || "5m");

  const onFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: async (r) => {
        const bars = r.data.map((row:any) => ({
          t: typeof row.timestamp === "number" ? row.timestamp : Date.parse(row.timestamp),
          o: +row.open, h: +row.high, l: +row.low, c: +row.close, v: +row.volume
        })).filter((b:any)=>Number.isFinite(b.t));
        await putLocalBars(symbol || file.name.replace(/\..+$/,""), tf, bars);
        alert(`Imported ${bars.length} bars into ${symbol||file.name} (${tf})`);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <input placeholder="Symbol" value={symbol} onChange={e=>setSymbol(e.target.value)} className="border px-2 py-1 rounded" />
      <input placeholder="Timeframe (e.g. 5m)" value={tf} onChange={e=>setTf(e.target.value)} className="border px-2 py-1 rounded" />
      <input type="file" accept=".csv" onChange={e=>e.target.files && onFile(e.target.files[0])} />
    </div>
  );
}
