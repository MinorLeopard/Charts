"use client";

import { useMemo, useState } from "react";
import { useChartStore } from "@/store/chartStore";
import {
  useIndicatorStore,
  INDICATOR_IDS,
  type IndicatorId,
} from "@/store/indicatorStore";

/**
 * Minimal indicators button + popover dialog (no UI libs).
 * - Uses layout + active panel to build a stable viewId
 * - Reads/updates selection via useIndicatorStore
 */
export default function IndicatorsDialog() {
  const [open, setOpen] = useState(false);

  const layout = useChartStore((s) => s.layout);
  const activePanel = useChartStore((s) => s.activePanelId ?? "p1");
  const viewId = useMemo(() => `${layout}:${activePanel}`, [layout, activePanel]);

  // read the list for this view (stable array from store)
  const list = useIndicatorStore((s) => s.list(viewId));
  const toggle = useIndicatorStore((s) => s.toggle);

  // optional: if you want a version bump to force re-render when others change the store
  const _version = useIndicatorStore((s) => s.version);

  const checked = useMemo(() => new Set(list), [list]);

  const onToggle = (id: IndicatorId) => {
    toggle(viewId, id);
  };

  return (
    <div className="relative">
      <button
        className="px-2 py-1 rounded-lg border text-sm hover:bg-white/5 transition"
        onClick={() => setOpen((v) => !v)}
        title="Indicators"
      >
        Indicators
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 w-64 rounded-lg border bg-panel p-2 shadow-lg"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="px-2 py-1 text-xs opacity-70">Stock indicators</div>
          <div className="max-h-72 overflow-auto py-1">
            {INDICATOR_IDS.map((id) => {
              const isOn = checked.has(id);
              return (
                <label
                  key={id}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => onToggle(id)}
                  />
                  <span className="text-sm uppercase tracking-wide">
                    {labelFor(id)}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 px-2 py-1">
            <button
              className="px-2 py-1 rounded border hover:bg-white/5 text-xs"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const LABELS: Record<IndicatorId, string> = {
  sma: "SMA (20)",
  ema: "EMA (20)",
  vwap: "VWAP",
  bb: "Bollinger Bands",
  rsi: "RSI (14)",
  macd: "MACD (12,26,9)",
};

function labelFor(id: IndicatorId): string {
  return LABELS[id];
}

