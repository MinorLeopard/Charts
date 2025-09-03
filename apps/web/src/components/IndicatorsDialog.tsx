"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useIndicatorStore, type IndicatorId } from "@/store/indicatorStore";
import { useCustomIndicatorStore } from "@/store/customIndicatorStore";
import { useChartStore } from "@/store/chartStore";

// Keep this typed to your IndicatorId union
const STOCK_IDS: readonly IndicatorId[] = ["sma", "ema", "vwap", "bb", "rsi", "macd"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] uppercase tracking-wide opacity-70 mb-2">{title}</div>
      {children}
    </div>
  );
}

export default function IndicatorsDialog() {
  const layout = useChartStore((s) => s.layout);
  const activePanel = useChartStore((s) => s.activePanelId) ?? "p1";
  const viewId = `${layout}:${activePanel}`;

  // ---- Local popover state ----
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"stock" | "custom">("stock");
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // ---- Stock indicators (select fields separately to avoid new-object selector) ----
  const stockVersion = useIndicatorStore((s) => s.version);
  const stockSelectedMap = useIndicatorStore((s) => s.selected);
  const toggleStock = useIndicatorStore((s) => s.toggle);

  const stockChecked = useMemo(() => {
    const arr = (stockSelectedMap[viewId] ?? []).filter(
      (id): id is IndicatorId => (STOCK_IDS as readonly string[]).includes(id)
    );
    return new Set(arr);
  }, [stockSelectedMap, viewId, stockVersion]);

  // ---- Custom indicators ----
  const customVersion = useCustomIndicatorStore((s) => s.version);
  const toggleCustom = useCustomIndicatorStore((s) => s.toggleForView);
  const startEditing = useCustomIndicatorStore((s) => s.startEditing);

  const { allCustom, customChecked } = useMemo(() => {
    const st = useCustomIndicatorStore.getState();
    const allCustom = st.all(); // stable behind version changes
    const list = st.listForView(viewId);
    return { allCustom, customChecked: new Set(list) };
  }, [customVersion, viewId]);

  return (
    <div className="relative">
      <button
        className="px-2 py-1 border rounded-md hover:bg-white/5"
        onClick={() => setOpen((v) => !v)}
        title="Indicators"
      >
        Indicators
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute z-40 mt-2 w-[420px] rounded-lg border bg-panel p-3 shadow-lg"
        >
          {/* Tabs header */}
          <div className="flex items-center gap-2 mb-3">
            <button
              className={`px-2 py-1 rounded-md text-sm border ${tab === "stock" ? "bg-white/5" : "opacity-70"}`}
              onClick={() => setTab("stock")}
            >
              Stock
            </button>
            <button
              className={`px-2 py-1 rounded-md text-sm border ${tab === "custom" ? "bg-white/5" : "opacity-70"}`}
              onClick={() => setTab("custom")}
            >
              Custom
            </button>
          </div>

          {tab === "stock" ? (
            <div>
              <Section title="Built-in">
                {STOCK_IDS.map((id) => (
                  <div key={id} className="flex items-center justify-between py-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stockChecked.has(id)}
                        onChange={() => toggleStock(viewId, id)}
                      />
                      <span className="text-sm">{id.toUpperCase()}</span>
                    </label>
                  </div>
                ))}
              </Section>
              <div className="text-[11px] opacity-60">
                Tip: RSI/MACD render on their own sub-pane automatically.
              </div>
            </div>
          ) : (
            <div>
              <Section title="Your saved indicators">
                {allCustom.length === 0 && (
                  <div className="text-xs opacity-70">
                    No custom indicators yet. Use the Editor in the toolbar to add one.
                  </div>
                )}
                {allCustom.map((ci) => (
                  <div key={ci.id} className="flex items-center justify-between py-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customChecked.has(ci.id)}
                        onChange={() => toggleCustom(viewId, ci.id)}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm">{ci.name}</span>
                        <span className="text-[11px] opacity-60">
                          v{ci.version} · {ci.visibility}
                        </span>
                      </div>
                    </label>

                    {/* Edit button — don't toggle checkbox when clicked */}
                    <button
                      className="text-xs px-2 py-1 rounded border hover:bg-white/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        startEditing(ci.id);
                        setOpen(false);
                      }}
                      title="Edit in editor"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </Section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
