"use client";
import Papa from "papaparse";
import { useState } from "react";
import { putLocalBars } from "@/lib/data/indexedDB";

type Bar = { t:number;o:number;h:number;l:number;c:number;v:number };

function nk(s: string) {
  // normalize key: lowercase, strip non-alphanumerics
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseTime(val: any): number | undefined {
  if (val == null || val === "" || Number.isNaN(val)) return undefined;
  if (typeof val === "number") {
    return val < 1e12 ? Math.round(val * 1000) : Math.round(val);
  }
  const s = String(val).trim();
  if (s === "") return undefined;
  const n = Number(s);
  if (Number.isFinite(n)) {
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

export default function CsvImportDialog() {
  const [symbol, setSymbol] = useState("");
  const [tf, setTf] = useState(process.env.NEXT_PUBLIC_DEFAULT_TF || "5m");
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    setBusy(true);
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      worker: true,
      complete: async (r) => {
        try {
          const rows = r.data as Record<string, any>[];
          if (!rows?.length) {
            alert("No rows found in CSV.");
            return;
          }

          // Build a normalized map for the first row to show headers we see
          const first = rows[0];
          const normHeaders = Object.keys(first || {}).map(k => nk(k));
          console.log("Normalized headers:", normHeaders);

          const bars: Bar[] = [];
          let skippedMissing = 0, skippedBadNum = 0, skippedBadTime = 0;

          for (const raw of rows) {
            // Build normalized row: last non-null value wins for duplicate headings
            const row: Record<string, any> = {};
            for (const [k, v] of Object.entries(raw)) {
              const key = nk(k);
              // only overwrite if current is null/undefined/empty to keep first meaningful value
              if (row[key] == null || row[key] === "") row[key] = v;
            }

            const t = parseTime(
              row.time ?? row.timestamp ?? row.datetime ?? row.date ?? row.t
            );

            const o = Number(row.open ?? row.o ?? row.op);
            const h = Number(row.high ?? row.h);
            const l = Number(row.low ?? row.l);
            const c = Number(row.close ?? row.c ?? row.cl);
            const vRaw = row.volume ?? row.vol ?? row.v ?? row.qty ?? row.quantity ?? row.contracts;
            const vNum = Number(vRaw);
            const v = Number.isFinite(vNum) ? vNum : 0;

            if (t === undefined) { skippedBadTime++; continue; }
            if (![o,h,l,c].every(Number.isFinite)) { skippedBadNum++; continue; }

            bars.push({ t, o, h, l, c, v });
          }

          // ascending order
          bars.sort((a, b) => a.t - b.t);

          if (bars.length === 0) {
            const msg = [
              "Imported 0 bars. Debug:",
              `- rows: ${rows.length}`,
              `- bad time rows: ${skippedBadTime}`,
              `- bad OHLC rows: ${skippedBadNum}`,
              `- missing OHLC/time rows: ${skippedMissing}`,
              `- headers seen: ${normHeaders.join(", ")}`,
            ].join("\n");
            alert(msg);
            console.warn(msg);
            return;
          }

          const sym = symbol || file.name.replace(/\..+$/, "");
          await putLocalBars(sym, tf, bars);
          console.log("Imported bars:", bars.length, { first3: bars.slice(0,3), last3: bars.slice(-3) });
          alert(`Imported ${bars.length} bars into ${sym} (${tf}). Open it from the watchlist.`);
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
      <input
        placeholder="Symbol"
        value={symbol}
        onChange={(e)=>setSymbol(e.target.value)}
        className="border px-2 py-1 rounded"
      />
      <input
        placeholder="Timeframe (e.g. 5m)"
        value={tf}
        onChange={(e)=>setTf(e.target.value)}
        className="border px-2 py-1 rounded"
      />
      <label className="px-3 py-1 rounded border cursor-pointer">
        {busy ? "Importing..." : "Import CSV"}
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e)=> e.target.files && onFile(e.target.files[0])}
          className="hidden"
          disabled={busy}
        />
      </label>
    </div>
  );
}
