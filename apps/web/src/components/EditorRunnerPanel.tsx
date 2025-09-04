"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAttachmentsStore } from "@/store/attachmentsStore";
import type { PlotAdapter } from "@/store/plotRegistryStore";
import { useCustomIndicatorStore } from "@/store/customIndicatorStore";

// Lazy-load Monaco
const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

type Label = {
  time: number;
  price: number;
  text?: string;
  color?: string;
  bg?: string;
  align?: "above" | "below";
  shape?: "up" | "down" | "circle";
  size?: number;
  stroke?: string;
  strokeWidth?: number;
};

export type EditorRunnerPanelProps = {
  viewId: string;
  getActiveChartEnv: () => {
    symbol: string;
    timeframe: string;
    getBars: (symbol?: string, tf?: string) => Promise<Bar[]>;
    listAttachments?: () => Promise<string[]>;
    getCsvAttachment?: (name: string) => Promise<{ columns: string[]; rows: Record<string, string>[] }>;
  };
  plots: PlotAdapter;
  // Kept optional to silence any legacy prop usage from the shell
  onApplyAsIndicator?: (args: { name: string; code: string; viewId: string }) => Promise<void>;
  initialCode?: string;
};

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
    function compile(code){
      const wrapped = \`"use strict"; let exports = {}; let module = { exports };\n\` + code +
        \`\\n; const __exp = module.exports && module.exports.default ? module.exports.default : module.exports; return __exp;\`;
      return new Function(wrapped);
    }
    function rpc(method, params){
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
    function makeEnv(spec){
      return {
        symbol: spec.symbol,
        timeframe: spec.timeframe,
        getBars: (s, tf) => rpc('getBars', { symbol: s, timeframe: tf }),
        plot: {
          line: (id, series, opts) => rpc('plot:line', { id, series, opts }),
          bands: (id, series, opts) => rpc('plot:bands', { id, series, opts }),
          histogram: (id, series, opts) => rpc('plot:histogram', { id, series, opts }),
          boxes: (id, boxes, opts) => rpc('plot:boxes', { id, boxes, opts }),
          labels: (id, labels, opts) => rpc('plot:labels', { id, labels, opts }),
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
      const { code, envSpec, timeoutMs = 2000 } = msg;
      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) postMessage({ type: 'done', timedOut: true });
      }, timeoutMs);
      try {
        const factory = compile(code);
        const entry = factory();
        if (typeof entry !== 'function') throw new Error('Your script must export a function via module.exports or export default');
        const env = makeEnv(envSpec);
        const maybe = entry(env);
        if (maybe && typeof maybe.then === 'function') await maybe;
        finished = true;
        postMessage({ type: 'done' });
      } catch (err) {
        postMessage({ type: 'done', error: String(err && err.message || err) });
      } finally {
        clearTimeout(timer);
      }
    };
  `;
  const blob = new Blob([src], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob), { name: "indicator-runner" });
}

const DEFAULT_NAME = "Untitled Indicator";

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

type RpcEnvelope =
  | { __rpc: true; id: string; method: "getBars"; params: { symbol?: string; timeframe?: string } }
  | {
      __rpc: true;
      id: string;
      method: "plot:line";
      params: { id: string; series: { time: number; value: number }[]; opts?: Record<string, unknown> };
    }
  | {
      __rpc: true;
      id: string;
      method: "plot:bands";
      params: {
        id: string;
        series: { time: number; upper: number; basis: number; lower: number }[];
        opts?: Record<string, unknown>;
      };
    }
  | {
      __rpc: true;
      id: string;
      method: "plot:histogram";
      params: { id: string; series: { time: number; value: number }[]; opts?: Record<string, unknown> };
    }
  | {
      __rpc: true;
      id: string;
      method: "plot:boxes";
      params: { id: string; boxes: { from: number; to: number; top: number; bottom: number }[]; opts?: Record<string, unknown> };
    }
  | {
      __rpc: true;
      id: string;
      method: "plot:labels";
      params: { id: string; labels: Label[]; opts?: Record<string, unknown> };
    }
  | { __rpc: true; id: string; method: "attachments:list"; params: Record<string, never> }
  | { __rpc: true; id: string; method: "attachments:csv"; params: { name: string } };

type DoneMessage = { type: "done"; error?: string; timedOut?: boolean };

function isRpcEnvelope(x: unknown): x is RpcEnvelope {
  return !!x && typeof x === "object" && "__rpc" in x && (x as { __rpc?: unknown }).__rpc === true;
}
function isDoneMessage(x: unknown): x is DoneMessage {
  return !!x && typeof x === "object" && "type" in x && (x as { type?: unknown }).type === "done";
}

export default function EditorRunnerPanel(props: EditorRunnerPanelProps) {
  const { viewId, getActiveChartEnv, plots, initialCode } = props;

  const [code, setCode] = useState<string>(initialCode ?? DEFAULT_SAMPLE);
  const [name, setName] = useState<string>(DEFAULT_NAME);
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const [tab, setTab] = useState<"console" | "snippets" | "attachments" | "api">("console");
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [heightPct, setHeightPct] = useState<number>(45);

  const workerRef = useRef<Worker | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef<boolean>(false);

  // Namespace for series emitted by "Run": `${savedId}::`
  const currentNsRef = useRef<string>("");

  // Attachments store
  const attachAdd = useAttachmentsStore((s) => s.add);
  const attachRefresh = useAttachmentsStore((s) => s.refresh);
  const attachList = useAttachmentsStore((s) => s.list);

  // Custom indicator store (stable selectors)
  const upsertCustom = useCustomIndicatorStore((s) => s.upsert);
  const allCustom = useCustomIndicatorStore((s) => s.all);
  const toggleCustomForView = useCustomIndicatorStore((s) => s.toggleForView);
  const editingId = useCustomIndicatorStore((s) => s.editingId);
  const byId = useCustomIndicatorStore((s) => s.byId);
  const clearEditing = useCustomIndicatorStore((s) => s.clearEditing);

  // Load requested indicator into the editor
  useEffect(() => {
    if (!editingId) return;
    const ci = byId(editingId);
    if (ci) {
      setName(ci.name || DEFAULT_NAME);
      setCode(ci.code || "");
      setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] ✏️ Loaded "${ci.name}" into editor`].slice(-400));
    }
    clearEditing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // Initialize/teardown worker
  useEffect(() => {
    const w = createRunnerWorker();
    workerRef.current = w;
    const handleMessage = (ev: MessageEvent<unknown>) => {
      const msg = ev.data;
      if (!isDoneMessage(msg)) return;
      setRunning(false);
      if (!msg.error && !msg.timedOut) {
        setLastOk(Date.now());
        setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] ✅ Completed`].slice(-400));
      } else if (msg.timedOut) {
        setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] ⏱️ Timed out`].slice(-400));
      } else if (msg.error) {
        setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] ❌ Error: ${msg.error}`].slice(-400));
      }
    };
    w.addEventListener("message", handleMessage);
    return () => {
      w.removeEventListener("message", handleMessage);
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  // Provide RPC services to the worker
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;

    const onMessage = async (ev: MessageEvent<unknown>) => {
      const msg = ev.data;
      if (!isRpcEnvelope(msg)) return;
      const { id, method, params } = msg;

      const env = getActiveChartEnv();

      const reply = (result?: unknown, error?: string) => {
        w.postMessage({ __rpc: true, id, result, error });
      };

      try {
        switch (method) {
          case "getBars": {
            const p = params as { symbol?: string; timeframe?: string };
            const out = await env.getBars(p?.symbol || env.symbol, p?.timeframe || env.timeframe);
            return reply(out);
          }
          case "plot:line": {
            const p = params as { id: string; series: { time: number; value: number }[]; opts?: Record<string, unknown> };
            const pid = String(p.id);
            const nid = pid.startsWith(currentNsRef.current) ? pid : currentNsRef.current + pid;
            plots.line(nid, p.series, p.opts || {});
            return reply(true);
          }
          case "plot:bands": {
            const p = params as {
              id: string;
              series: { time: number; upper: number; basis: number; lower: number }[];
              opts?: Record<string, unknown>;
            };
            const pid = String(p.id);
            const nid = pid.startsWith(currentNsRef.current) ? pid : currentNsRef.current + pid;
            plots.bands(nid, p.series, p.opts || {});
            return reply(true);
          }
          case "plot:histogram": {
            const p = params as { id: string; series: { time: number; value: number }[]; opts?: Record<string, unknown> };
            const pid = String(p.id);
            const nid = pid.startsWith(currentNsRef.current) ? pid : currentNsRef.current + pid;
            plots.histogram(nid, p.series, p.opts || {});
            return reply(true);
          }
          case "plot:boxes": {
            const p = params as {
              id: string;
              boxes: { from: number; to: number; top: number; bottom: number }[];
              opts?: Record<string, unknown>;
            };
            const pid = String(p.id);
            const nid = pid.startsWith(currentNsRef.current) ? pid : currentNsRef.current + pid;
            plots.boxes?.(nid, p.boxes, p.opts || {});
            return reply(true);
          }
          case "plot:labels": {
            const p = params as { id: string; labels: Label[]; opts?: Record<string, unknown> };
            const pid = String(p.id);
            const nid = pid.startsWith(currentNsRef.current) ? pid : currentNsRef.current + pid;
            const raw = (p?.labels || []) as Label[];
            const safe = raw.map((l) => ({
              time: l.time,
              price: l.price,
              text: l.text ?? "",
              color: l.color ?? "#ffffff",
              bg: l.bg ?? "rgba(0,0,0,0.6)",
              align: l.align ?? "above",
              shape: l.shape,
              size: typeof l.size === "number" ? l.size : undefined,
              stroke: typeof l.stroke === "string" ? l.stroke : undefined,
              strokeWidth: typeof l.strokeWidth === "number" ? l.strokeWidth : undefined,
            }));
            plots.labels(nid, safe);
            return reply(true);
          }
          case "attachments:list": {
            const list = env.listAttachments ? await env.listAttachments() : [];
            return reply(list);
          }
          case "attachments:csv": {
            const p = params as { name: string };
            if (!env.getCsvAttachment) return reply(undefined, "attachments are not enabled");
            const res = await env.getCsvAttachment(p.name);
            return reply(res);
          }
          default:
            return reply(undefined, `Unknown method: ${String(method)}`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply(undefined, message);
      }
    };

    w.addEventListener("message", onMessage);
    return () => {
      w.removeEventListener("message", onMessage);
    };
  }, [getActiveChartEnv, plots]);

  /** Ensure we always use the **latest** text the user typed */
  const ensureIndicatorName = useCallback(async (): Promise<string | null> => {
    let nm = (nameRef.current || "").trim();
    if (!nm || nm === DEFAULT_NAME) {
      const typed = window.prompt("Save indicator as (name):", nm || "");
      if (!typed) return null;
      nm = typed.trim();
      if (!nm) return null;
      setName(nm); // reflect the chosen name in the input
    }
    return nm;
  }, []);

  const saveIndicator = useCallback(async () => {
    const indicatorName = await ensureIndicatorName();
    if (!indicatorName) return false;

    const existing = allCustom().find((ci) => ci.name === indicatorName);
    const id = existing?.id ?? `custom-${Date.now()}`;

    upsertCustom({
      id,
      name: indicatorName,
      code,
      version: (existing?.version ?? 0) + 1,
      visibility: existing?.visibility ?? "private",
      description: existing?.description,
      paramSchema: existing?.paramSchema,
      updatedAt: Date.now(),
    });

    setConsoleLines((l) =>
      [...l, `[${new Date().toLocaleTimeString()}] 💾 Saved "${indicatorName}" (v${(existing?.version ?? 0) + 1})`].slice(
        -400
      )
    );
    return id;
  }, [allCustom, code, upsertCustom, ensureIndicatorName]);

  const runOnActive = useCallback(async () => {
    const w = workerRef.current;
    if (!w) return;

    const savedId = await saveIndicator();
    if (!savedId) return;

    // namespace for all plot:* calls made during this run
    currentNsRef.current = `${savedId}::`;

    const before = useCustomIndicatorStore.getState().listForView(viewId);
    if (!before.includes(savedId)) {
      toggleCustomForView(viewId, savedId);
      const nm = useCustomIndicatorStore.getState().byId(savedId)?.name ?? savedId;
      setConsoleLines((l) =>
        [...l, `[${new Date().toLocaleTimeString()}] ✅ Applied "${nm}" to ${viewId}`].slice(-400)
      );
    }

    setRunning(true);
    const env = getActiveChartEnv();
    setConsoleLines((l) => [...l, `[${new Date().toLocaleTimeString()}] ▶ Running on ${env.symbol}, ${env.timeframe}…`].slice(-400));

    w.postMessage({
      type: "run",
      code,
      envSpec: { symbol: env.symbol, timeframe: env.timeframe },
      timeoutMs: 2000,
    });
  }, [code, getActiveChartEnv, saveIndicator, toggleCustomForView, viewId]);

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
    for (const f of Array.from(files)) await attachAdd(f);
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
          <Btn
            small
            variant="ghost"
            onClick={async (ev) => {
              ev.preventDefault();
              await saveIndicator();
            }}
          >
            Save
          </Btn>
          {lastOk && <span className="text-xs text-emerald-400">OK {new Date(lastOk).toLocaleTimeString()}</span>}
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-full grid"
        style={{ gridTemplateRows: `${heightPct}% 6px ${100 - heightPct}%` }}
      >
        <div>
          <Monaco
            height="100%"
            defaultLanguage="typescript"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v || "")}
            options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 2, automaticLayout: true, wordWrap: "on" }}
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
                    `// zones.csv columns: from,to,top,bottom  (times in ms or sec)
module.exports = async (env) => {
  const files = await env.attachments.list();
  if (!files.includes("zones.csv")) throw new Error("Attach zones.csv first");

  const { rows } = await env.attachments.csv("zones.csv");
  const boxes = rows.map(r => ({
    from: Number(r.from), to: Number(r.to),
    top: Number(r.top),   bottom: Number(r.bottom),
  })).filter(b => Number.isFinite(b.from) && Number.isFinite(b.to));

  await env.plot.boxes("csv-zones", boxes);
};`
                  )
                }
                onCopy={() =>
                  navigator.clipboard.writeText(`// zones.csv columns: from,to,top,bottom  (times in ms or sec)
module.exports = async (env) => {
  const files = await env.attachments.list();
  if (!files.includes("zones.csv")) throw new Error("Attach zones.csv first");

  const { rows } = await env.attachments.csv("zones.csv");
  const boxes = rows.map(r => ({
    from: Number(r.from), to: Number(r.to),
    top: Number(r.top),   bottom: Number(r.bottom),
  })).filter(b => Number.isFinite(b.from) && Number.isFinite(b.to));

  await env.plot.boxes("csv-zones", boxes);
};`)
                }
              />
              {/* Labels smoke tests */}
              <SnippetCard
                title="Labels: Hello on last bar"
                onUse={() =>
                  setCode(`module.exports = async (env) => {
  const bars = await env.getBars();
  if (!bars.length) return;
  const last = bars[bars.length - 1];
  await env.plot.labels("smoke", [{
    time: last.time,  // ms
    price: last.close,
    text: "HELLO",
    shape: "circle",
    bg: "rgba(34,197,94,0.95)",
    color: "#fff",
    size: 12
  }]);
};`)
                }
                onCopy={() =>
                  navigator.clipboard.writeText(`module.exports = async (env) => {
  const bars = await env.getBars();
  if (!bars.length) return;
  const last = bars[bars.length - 1];
  await env.plot.labels("smoke", [{
    time: last.time,
    price: last.close,
    text: "HELLO",
    shape: "circle",
    bg: "rgba(34,197,94,0.95)",
    color: "#fff",
    size: 12
  }]);
};`)
                }
              />
              <SnippetCard
                title="Labels: RSI crosses 30/70"
                onUse={() =>
                  setCode(`module.exports = async (env) => {
  const bars = await env.getBars();
  if (bars.length < 15) return;
  const closes = bars.map(b => b.close);
  const rsi = env.utils.rsi(closes, 14);
  const labels = [];
  const toMs = (sec) => sec * 1;

  for (let i = 1; i < bars.length; i++) {
    const prev = rsi[i-1], curr = rsi[i];
    if (prev < 30 && curr >= 30) {
      labels.push({ time: toMs(bars[i].time), price: bars[i].low, text: "BUY", shape: "up",
        bg: "rgba(34,197,94,0.95)", color: "#fff", size: 12 });
    }
    if (prev > 70 && curr <= 70) {
      labels.push({ time: toMs(bars[i].time), price: bars[i].high, text: "SELL", shape: "down",
        bg: "rgba(239,68,68,0.95)", color: "#fff", size: 12 });
    }
  }
  await env.plot.labels("rsi-cross", labels);
};`)
                }
                onCopy={() =>
                  navigator.clipboard.writeText(`module.exports = async (env) => {
  const bars = await env.getBars();
  if (bars.length < 15) return;
  const closes = bars.map(b => b.close);
  const rsi = env.utils.rsi(closes, 14);
  const labels = [];
  const toMs = (sec) => sec * 1;
  for (let i = 1; i < bars.length; i++) {
    const prev = rsi[i-1], curr = rsi[i];
    if (prev < 30 && curr >= 30) {
      labels.push({ time: toMs(bars[i].time), price: bars[i].low, text: "BUY", shape: "up",
        bg: "rgba(34,197,94,0.95)", color: "#fff", size: 12 });
    }
    if (prev > 70 && curr <= 70) {
      labels.push({ time: toMs(bars[i].time), price: bars[i].high, text: "SELL", shape: "down",
        bg: "rgba(239,68,68,0.95)", color: "#fff", size: 12 });
    }
  }
  await env.plot.labels("rsi-cross", labels);
};`)
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
                    {attachList.map((nm) => (
                      <li key={nm}>
                        <code>{nm}</code>
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

  await env.plot.boxes("csv-zones", boxes);
};`}</pre>
              </div>
            </div>
          )}

          {/* API */}
          {tab === "api" && (
            <div className="p-3 text-xs leading-5 overflow-auto">
              <pre className="whitespace-pre-wrap">{`module.exports = async function main(env) { /* … */ }

type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

type Box = { from: number; to: number; top: number; bottom: number };
type BoxStyle = { fill?: string; stroke?: string; lineWidth?: number; z?: number };

type Label = {
  time: number; price: number; text: string;
  color?: string; bg?: string; align?: "above" | "below" | "left" | "right" | "center";
  font?: string; paddingX?: number; paddingY?: number; z?: number;
  shape?: "up" | "down" | "circle"; size?: number; stroke?: string; strokeWidth?: number;
};

env = {
  symbol: string,
  timeframe: string,
  getBars(symbol?: string, tf?: string): Promise<Bar[]>,
  plot: {
    line(id: string, series: {time:number; value:number}[], opts?: any): Promise<void>,
    bands(id: string, series: {time:number; upper:number; basis:number; lower:number}[], opts?: any): Promise<void>,
    histogram(id: string, series: {time:number; value:number}[], opts?: any): Promise<void>,
    boxes(id: string, boxes: Box[], style?: BoxStyle): Promise<void>,
    labels(id: string, labels: Label[], opts?: any): Promise<void>,
  },
  attachments: { list(): Promise<string[]>; csv(name: string): Promise<{columns:string[]; rows:Record<string,string>[]}>; },
  utils: { sma(arr:number[],len:number):number[]; ema(arr:number[],len:number):number[]; rsi(arr:number[],len?:number):number[]; },
};

// or: export default async function main(env) { /* … */ }`}</pre>
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
        <Btn small onClick={onUse}>
          Use
        </Btn>
        <Btn small variant="ghost" onClick={onCopy}>
          Copy
        </Btn>
      </div>
    </div>
  );
}
