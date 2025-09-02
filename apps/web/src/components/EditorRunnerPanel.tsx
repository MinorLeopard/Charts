"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAttachmentsStore } from "@/store/attachmentsStore";
import { useIndicatorOverlayStore } from "@/store/indicatorOverlayStore"; // ⬅️ NEW: direct overlay write fallback

// Lazy-load Monaco
const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

export type PlotAdapter = {
  line: (id: string, series: { time: number; value: number }[], opts?: Record<string, unknown>) => void;
  bands: (
    id: string,
    series: { time: number; upper: number; basis: number; lower: number }[],
    opts?: Record<string, unknown>
  ) => void;
  histogram: (id: string, series: { time: number; value: number }[], opts?: Record<string, unknown>) => void;
  boxes: (
    id: string,
    boxes: { from: number; to: number; top: number; bottom: number }[],
    opts?: Record<string, unknown>
  ) => void;
  labels: (id: string, labels: { time: number; price: number; text?: string; color?: string }[]) => void; // ⬅️ NEW
};

export type EditorRunnerPanelProps = {
  viewId: string;
  getActiveChartEnv: () => {
    symbol: string;
    timeframe: string;
    getBars: (symbol?: string, tf?: string) => Promise<Bar[]>;
    listAttachments?: () => Promise<string[]>;
    getCsvAttachment?: (name: string) => Promise<{ columns: string[]; rows: any[] }>;
  };
  plots: PlotAdapter;
  onApplyAsIndicator?: (args: { name: string; code: string; viewId: string }) => Promise<void>;
  initialCode?: string;
};

/** -------- Minimal UI primitives (no shadcn) -------- */
function Btn(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost"; small?: boolean }
) {
  const { variant = "primary", small, className, ...rest } = props;
  const cls =
    (variant === "primary"
      ? "bg-white/10 hover:bg-white/15 border border-white/20"
      : "bg-transparent hover:bg-white/10 border border-white/20") +
    " rounded-md " +
    (small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm") +
    (className ? " " + className : "");
  return <button {...rest} className={cls} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "bg-transparent border border-white/20 rounded-md px-2 py-1 text-sm outline-none focus:border-white/40 " +
        (props.className ?? "")
      }
    />
  );
}

function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 border-b border-white/10 px-2 pt-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={
            "px-2 py-1 text-xs rounded-t-md " +
            (value === it.id ? "bg-white/10 border border-white/20 border-b-transparent" : "hover:bg-white/5")
          }
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** -------- Worker factory (safe, dependency-free) -------- */
function createRunnerWorker(): Worker {
  const src = `
    const safeKeys = new Set([
      'Infinity','NaN','isFinite','isNaN','parseFloat','parseInt',
      'decodeURI','decodeURIComponent','encodeURI','encodeURIComponent',
      'Math','Number','BigInt','Date','Array','Object','Boolean','String','RegExp','Map','Set','WeakMap','WeakSet',
      'Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float32Array','Float64Array'
    ]);

    function compile(code) {
      const wrapped = \`"use strict"; let exports = {}; let module = { exports };\\n\` + code +
        \`\\n; const __exp = module.exports && module.exports.default ? module.exports.default : module.exports; return __exp;\`;
      return new Function(wrapped); // eslint-disable-line no-new-func
    }

    function rpc(method, params) {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        const handler = (e) => {
          const m = e.data;
          if (!m || !m.__rpc || m.id !== id) return;
          self.removeEventListener('message', handler);
          if (m.error) reject(new Error(m.error));
          else resolve(m.result);
        };
        self.addEventListener('message', handler);
        postMessage({ __rpc: true, id, method, params });
      });
    }

    function makeEnv(spec) {
      return {
        symbol: spec.symbol,
        timeframe: spec.timeframe,
        getBars: (s, tf) => rpc('getBars', { symbol: s, timeframe: tf }),
        plot: {
          line: (id, series, opts) => rpc('plot:line', { id, series, opts }),
          bands: (id, series, opts) => rpc('plot:bands', { id, series, opts }),
          histogram: (id, series, opts) => rpc('plot:histogram', { id, series, opts }),
          boxes: (id, boxes, opts) => rpc('plot:boxes', { id, boxes, opts }),
          labels: (id, labels) => rpc('plot:labels', { id, labels }), 
        },
        attachments: {
          list: () => rpc('attachments:list', {}),
          csv: (name) => rpc('attachments:csv', { name }),
        },
        utils: {
          sma: (arr, len) => { const out=[]; let s=0; for(let i=0;i<arr.length;i++){ s+=arr[i]; if(i>=len) s-=arr[i-len]; if(i>=len-1) out.push(s/len);} return out; },
          ema: (arr, len) => { const k=2/(len+1); let prev=arr[0]; const out=[prev]; for(let i=1;i<arr.length;i++){ prev = arr[i]*k + prev*(1-k); out.push(prev);} return out; },
          rsi: (arr, len=14) => {
            const gains=[], losses=[];
            for (let i=1;i<arr.length;i++){ const d=arr[i]-arr[i-1]; gains.push(Math.max(d,0)); losses.push(Math.max(-d,0)); }
            const avg=(a,n)=>{ let s=0; const out=[]; for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=n) s-=a[i-n]; if(i>=n-1) out.push(s/n);} return out; };
            const ag=avg(gains,len), al=avg(losses,len);
            const out=[...Array(len).fill(50)];
            for (let i=0;i<ag.length;i++){ const rs = al[i]===0 ? 1000 : ag[i]/al[i]; out.push(100 - 100/(1+rs)); }
            return out;
          },
        }
      };
    }

    self.onmessage = async (e) => {
      const msg = e.data;
      if (!msg || msg.type !== 'run') return;
      const { code, envSpec, timeoutMs = 1000 } = msg;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        postMessage({ type: 'log', level: 'error', text: 'Runtime timed out' });
      }, timeoutMs);

      try {
        const factory = compile(code);
        const entry = factory();
        if (typeof entry !== 'function') throw new Error('Your script must export a function via module.exports = (env)=>{...} or export default (env)=>{...}');
        const env = makeEnv(envSpec);
        postMessage({ type: 'log', level: 'info', text: 'Running on active chart…' });
        const maybe = entry(env);
        if (maybe && typeof maybe.then === 'function') await maybe;
        if (!timedOut) postMessage({ type: 'done' });
      } catch (err) {
        postMessage({ type: 'log', level: 'error', text: String(err && err.message || err) });
      } finally {
        clearTimeout(timer);
      }
    };
  `;
  const blob = new Blob([src], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob), { name: "indicator-runner" });
}

const DEFAULT_SAMPLE = `// Example: Bollinger Bands overlay
// Tip: module.exports = async (env) => { ... }  OR  export default async (env) => { ... }

module.exports = async (env) => {
  const bars = await env.getBars(env.symbol, env.timeframe);
  const closes = bars.map(b => b.close);
  const len = 20, k = 2;

  const basis = env.utils.sma(closes, len);
  const devs = [];
  for (let i = 0; i < basis.length; i++) {
    const start = i + closes.length - basis.length - (len - 1);
    const slice = closes.slice(Math.max(0, start), Math.max(0, start) + len);
    const mean = basis[i];
    let s = 0; for (const v of slice) { s += Math.pow(v - mean, 2); }
    const stdev = Math.sqrt(s / Math.max(1, slice.length));
    devs.push(stdev);
  }
  const offset = closes.length - basis.length;
  const bands = basis.map((m, i) => ({
    time: bars[i + offset].time,
    upper: m + k * devs[i],
    basis: m,
    lower: m - k * devs[i],
  }));
  await env.plot.bands('bb', bands);
};
`;

export default function EditorRunnerPanel(props: EditorRunnerPanelProps) {
  const { viewId, getActiveChartEnv, plots, onApplyAsIndicator, initialCode } = props;

  const [code, setCode] = useState<string>(initialCode ?? DEFAULT_SAMPLE);
  const [name, setName] = useState<string>("Untitled Indicator");
  const [tab, setTab] = useState<"console" | "snippets" | "attachments" | "api">("console");
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [heightPct, setHeightPct] = useState<number>(45);

  const workerRef = useRef<Worker | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef<boolean>(false);

  // Attachments store
  const attachAdd = useAttachmentsStore((s) => s.add);
  const attachRefresh = useAttachmentsStore((s) => s.refresh);
  const attachList = useAttachmentsStore((s) => s.list);

  // Initialize worker
  useEffect(() => {
    const w = createRunnerWorker();
    workerRef.current = w;

    const handleMessage = (ev: MessageEvent) => {
      const msg = ev.data as any;
      if (!msg) return;
      if (msg.type === "log") {
        setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] ${String(msg.level).toUpperCase()}: ${msg.text}`].slice(-400));
        return;
      }
      if (msg.type === "done") {
        setRunning(false);
        setLastOk(Date.now());
        setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] ✅ Completed`].slice(-400));
        return;
      }
    };

    w.addEventListener("message", handleMessage);
    return () => {
      w.removeEventListener("message", handleMessage);
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  // Provide RPC services to the worker (getBars/plot/attachments)
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;

    const onMessage = async (ev: MessageEvent) => {
      const msg = ev.data as any;
      if (!msg || !msg.__rpc) return;
      const { id, method, params } = msg;

      const env = getActiveChartEnv();

      const reply = (result?: unknown, error?: string) => {
        w.postMessage({ __rpc: true, id, result, error });
      };

      try {
        switch (method) {
          case "getBars": {
            const out = await env.getBars(params?.symbol || env.symbol, params?.timeframe || env.timeframe);
            console.log("[EditorRunnerPanel] getBars →", out?.length);
            return reply(out);
          }
          case "plot:line": {
            console.log("[EditorRunnerPanel] plot:line", params?.id, (params?.series || []).length, params?.opts);
            plots?.line?.(
              params.id as string,
              params.series as { time: number; value: number }[],
              params.opts || {}
            );
            return reply(true);
          }
          case "plot:bands": {
            console.log("[EditorRunnerPanel] plot:bands", params?.id, (params?.series || []).length, params?.opts);
            plots?.bands?.(
              params.id as string,
              params.series as { time: number; upper: number; basis: number; lower: number }[],
              params.opts || {}
            );
            return reply(true);
          }
          case "plot:labels": {
  plots?.labels?.(params.id as string, params.labels as any[]);
  return reply(true);
}

          case "plot:histogram": {
            console.log("[EditorRunnerPanel] plot:histogram", params?.id, (params?.series || []).length, params?.opts);
            plots?.histogram?.(
              params.id as string,
              params.series as { time: number; value: number }[],
              params.opts || {}
            );
            return reply(true);
          }
          case "plot:boxes": {
  const idStr = params.id as string;
  const boxesArr = params.boxes as { from: number; to: number; top: number; bottom: number }[];
  const style = params.opts || {};
  console.log("[EditorRunnerPanel] plot:boxes", idStr, boxesArr?.length, style);

  // 1) Try the adapter prop (original route)
  try {
    plots?.boxes?.(idStr, boxesArr, style);
  } catch (e) {
    console.warn("[EditorRunnerPanel] plots.boxes threw:", e);
  }

  // 2) Fallback: write directly to the overlay store for THIS view
  try {
    const { useIndicatorOverlayStore } = await import("@/store/indicatorOverlayStore");
    useIndicatorOverlayStore.getState().setBoxes(viewId, idStr, boxesArr, style);
    const snap = useIndicatorOverlayStore.getState().byView[viewId];
    console.log("[EditorRunnerPanel] overlayStore after setBoxes", viewId, Object.keys(snap || {}));
  } catch (e) {
    console.warn("[EditorRunnerPanel] overlayStore.setBoxes threw:", e);
  }

  // 3) HARD FALLBACK: push rectangles into the MANUAL draw layer (always visible for you)
  try {
    const { useDrawStore } = await import("@/store/drawStore");
    const addObject = useDrawStore.getState().addObject;
    // convert each box -> manual rect object (seconds + price)
    for (const b of boxesArr) {
      addObject({
        id: `${idStr}-${Math.random().toString(36).slice(2)}`,
        viewId, // NOTE: must exactly match DrawingOverlay’s viewId: `${layout}:${panelId}`
        type: "rect",
        a: { time: Math.floor(b.from / 1000), price: b.top },
        b: { time: Math.floor(b.to   / 1000), price: b.bottom },
        color: style.stroke || "rgba(0,153,255,1)",
        fill: style.fill || "rgba(0,153,255,0.45)",
        width: Number(style.lineWidth ?? 2),
      } as any);
    }
    console.log("[EditorRunnerPanel] pushed", boxesArr.length, "rect(s) into drawStore");
  } catch (e) {
    console.warn("[EditorRunnerPanel] drawStore addObject fallback threw:", e);
  }

  return reply(true);
}

          case "attachments:list": {
            const list = env.listAttachments ? await env.listAttachments() : [];
            console.log("[EditorRunnerPanel] attachments:list →", list);
            return reply(list);
          }
          case "attachments:csv": {
            if (!env.getCsvAttachment) return reply(undefined, "attachments are not enabled");
            const res = await env.getCsvAttachment(params.name as string);
            console.log("[EditorRunnerPanel] attachments:csv →", params.name, res?.rows?.length);
            return reply(res);
          }
          default:
            return reply(undefined, `Unknown method: ${String(method)}`);
        }
      } catch (err: any) {
        console.error("[EditorRunnerPanel] RPC error:", err);
        return reply(undefined, String(err?.message || err));
      }
    };

    w.addEventListener("message", onMessage);
    return () => {
      w.removeEventListener("message", onMessage);
    };
  }, [getActiveChartEnv, plots, viewId]);

  const runOnActive = useCallback(() => {
    const w = workerRef.current;
    if (!w) return;
    setRunning(true);
    const env = getActiveChartEnv();
    setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] ▶ Running on ${env.symbol}, ${env.timeframe}…`].slice(-400));
    w.postMessage({
      type: "run",
      code,
      envSpec: { symbol: env.symbol, timeframe: env.timeframe },
      timeoutMs: 1000,
    });
  }, [code, getActiveChartEnv]);

  const applyAsIndicator = useCallback(async () => {
    if (!onApplyAsIndicator) return;
    await onApplyAsIndicator({ name, code, viewId });
    setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] 💾 Saved & applied to ${viewId}`].slice(-400));
  }, [name, code, viewId, onApplyAsIndicator]);

  // Resizer between editor and lower panel
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const pct = Math.max(20, Math.min(80, (y / rect.height) * 100));
      setHeightPct(pct);
    };
    const stop = () => {
      isDragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
    };
  }, []);

  // Refresh list when opening the Attachments tab
  useEffect(() => {
    if (tab === "attachments") attachRefresh();
  }, [tab, attachRefresh]);

  async function onUploadFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      await attachAdd(f);
    }
    await attachRefresh();
    setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] 📎 Attached ${files.length} file(s)`].slice(-400));
  }

  return (
    <div className="w-full h-[70vh] border border-white/15 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Custom Indicator Editor</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </div>
        <div className="flex items-center gap-2">
          <Btn small onClick={runOnActive} disabled={running}>
            {running ? "Running…" : "Run on Active Chart"}
          </Btn>
          {onApplyAsIndicator && (
            <Btn small variant="ghost" onClick={applyAsIndicator}>
              Add to Chart
            </Btn>
          )}
          {lastOk && <span className="text-xs text-emerald-400">OK {new Date(lastOk).toLocaleTimeString()}</span>}
        </div>
      </div>

      <div ref={containerRef} className="h-full grid" style={{ gridTemplateRows: `${heightPct}% 6px ${100 - heightPct}%` }}>
        <div>
          <Monaco
            height="100%"
            defaultLanguage="typescript"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              tabSize: 2,
              automaticLayout: true,
              wordWrap: "on",
            }}
          />
        </div>

        <div
          className="h-1 cursor-row-resize bg-white/15 hover:bg-white/25"
          onMouseDown={() => {
            isDragging.current = true;
          }}
          title="Drag to resize"
        />

        <div className="bg-black/40 h-full flex flex-col">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: "console", label: "Console" },
              { id: "snippets", label: "Snippets" },
              { id: "attachments", label: "Attachments" },
              { id: "api", label: "API" },
            ]}
          />

          {/* Console */}
          {tab === "console" && (
            <div className="p-3 overflow-auto h-[calc(100%-32px)]">
              <pre className="text-xs whitespace-pre-wrap leading-5">
                {consoleLines.length ? consoleLines.join("\n") : "Ready."}
              </pre>
            </div>
          )}

          {/* Snippets */}
          {tab === "snippets" && (
            <div className="p-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              <SnippetCard
                title="Overlay: BB (20,2)"
                onUse={() => setCode(DEFAULT_SAMPLE)}
                onCopy={() => navigator.clipboard.writeText(DEFAULT_SAMPLE)}
              />
              <SnippetCard
                title="Overlay: SMA(50)"
                onUse={() =>
                  setCode(
                    `module.exports = async (env) => {
  const bars = await env.getBars();
  const closes = bars.map(b => b.close);
  const sma = env.utils.sma(closes, 50);
  const offset = closes.length - sma.length;
  const series = sma.map((v, i) => ({ time: bars[i + offset].time, value: v }));
  await env.plot.line('sma50', series);
};`
                  )
                }
                onCopy={() =>
                  navigator.clipboard.writeText(
                    `module.exports = async (env) => {
  const bars = await env.getBars();
  const closes = bars.map(b => b.close);
  const sma = env.utils.sma(closes, 50);
  const offset = closes.length - sma.length;
  const series = sma.map((v, i) => ({ time: bars[i + offset].time, value: v }));
  await env.plot.line('sma50', series);
};`
                  )
                }
              />
              <SnippetCard
                title="Histogram: RSI(14)"
                onUse={() =>
                  setCode(
                    `module.exports = async (env) => {
  const bars = await env.getBars();
  const closes = bars.map(b => b.close);
  const r = env.utils.rsi(closes, 14);
  const offset = closes.length - r.length;
  const series = r.map((v, i) => ({ time: bars[i + offset].time, value: v }));
  await env.plot.histogram('rsi14', series);
};`
                  )
                }
                onCopy={() =>
                  navigator.clipboard.writeText(
                    `module.exports = async (env) => {
  const bars = await env.getBars();
  const closes = bars.map(b => b.close);
  const r = env.utils.rsi(closes, 14);
  const offset = closes.length - r.length;
  const series = r.map((v, i) => ({ time: bars[i + offset].time, value: v }));
  await env.plot.histogram('rsi14', series);
};`
                  )
                }
              />
              <SnippetCard
                title="CSV → Boxes"
                onUse={() =>
                  setCode(
                    `// zones.csv columns: from,to,top,bottom  (times in ms)
module.exports = async (env) => {
  const files = await env.attachments.list();
  if (!files.includes("zones.csv")) throw new Error("Attach zones.csv first");

  const { rows } = await env.attachments.csv("zones.csv");
  const boxes = rows.map(r => ({
    from: Number(r.from), to: Number(r.to),
    top: Number(r.top),   bottom: Number(r.bottom),
  })).filter(b => Number.isFinite(b.from) && Number.isFinite(b.to));

  await env.plot.boxes("csv-zones", boxes, {
    fill: "rgba(255,0,0,0.5)",
    stroke: "rgba(255,0,0,1)",
    lineWidth: 3,
    z: 50
  });
};`
                  )
                }
                onCopy={() =>
                  navigator.clipboard.writeText(
                    `// zones.csv columns: from,to,top,bottom  (times in ms)
module.exports = async (env) => {
  const files = await env.attachments.list();
  if (!files.includes("zones.csv")) throw new Error("Attach zones.csv first");

  const { rows } = await env.attachments.csv("zones.csv");
  const boxes = rows.map(r => ({
    from: Number(r.from), to: Number(r.to),
    top: Number(r.top),   bottom: Number(r.bottom),
  })).filter(b => Number.isFinite(b.from) && Number.isFinite(b.to));

  await env.plot.boxes("csv-zones", boxes, {
    fill: "rgba(255,0,0,0.5)",
    stroke: "rgba(255,0,0,1)",
    lineWidth: 3,
    z: 50
  });
};`
                  )
                }
              />
            </div>
          )}

          {/* Attachments */}
          {tab === "attachments" && (
            <div className="p-3 grid gap-3 overflow-auto">
              <div className="flex items-center gap-2">
                <label className="text-sm">Upload CSV:</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => onUploadFiles(e.target.files)}
                  className="text-xs"
                />
              </div>

              <div className="border border-white/15 rounded-md p-2">
                <div className="text-sm font-medium mb-1">Attached files</div>
                {attachList.length === 0 ? (
                  <div className="text-xs opacity-70">No CSVs attached yet.</div>
                ) : (
                  <ul className="text-xs list-disc pl-5">
                    {attachList.map((name) => (
                      <li key={name}>
                        <code>{name}</code>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2">
                  <Btn small variant="ghost" onClick={() => attachRefresh()}>
                    Refresh
                  </Btn>
                </div>
              </div>

              <div className="border border-white/15 rounded-md p-2">
                <div className="text-sm font-medium mb-1">How to use in code</div>
                <pre className="text-xs whitespace-pre-wrap">{`module.exports = async (env) => {
  const files = await env.attachments.list(); // ["zones.csv", ...]
  if (!files.includes("zones.csv")) throw new Error("Attach zones.csv first");

  const { rows } = await env.attachments.csv("zones.csv"); // {columns, rows}
  const boxes = rows.map(r => ({
    from: Number(r.from), to: Number(r.to),
    top: Number(r.top),   bottom: Number(r.bottom),
  })).filter(b => Number.isFinite(b.from) && Number.isFinite(b.to));

  await env.plot.boxes("csv-zones", boxes, {
    fill: "rgba(255,0,0,0.5)",
    stroke: "rgba(255,0,0,1)",
    lineWidth: 3,
    z: 50
  });
};`}</pre>
              </div>
            </div>
          )}

          {/* API */}
          {tab === "api" && (
            <div className="p-3 text-xs leading-5 overflow-auto">
              <pre className="whitespace-pre-wrap">{`module.exports = async function main(env) { /* … */ }
// or: export default async function main(env) { /* … */ }

type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

env: {
  symbol: string;
  timeframe: string;               // "1m" | "5m" | "1h" | "1d"
  getBars(symbol?: string, tf?: string): Promise<Bar[]>;
  plot: {
    line(id, data: {time,value}[], opts?): Promise<void>;
    bands(id, data: {time,upper,basis,lower}[], opts?): Promise<void>;
    histogram(id, data: {time,value}[], opts?): Promise<void>;
    boxes(id, boxes: {from,to,top,bottom}[], opts?): Promise<void>;
    labels(id, labels: {time,price,text,color}[]): Promise<void>;
  };
  attachments: {
    list(): Promise<string[]>;
    csv(name: string): Promise<{ columns: string[]; rows: any[] }>;
  };
  utils: { sma(arr:number[],len:number):number[]; ema(arr:number[],len:number):number[]; rsi(arr:number[],len?:number):number[] };
}`}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SnippetCard({ title, onUse, onCopy }: { title: string; onUse: () => void; onCopy: () => void }) {
  return (
    <div className="border border-white/15 rounded-md p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="flex gap-2">
        <Btn small onClick={onUse}>Use</Btn>
        <Btn small variant="ghost" onClick={onCopy}>Copy</Btn>
      </div>
    </div>
  );
}
