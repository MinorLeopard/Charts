"use client";

import * as React from "react";
import { useDrawStore, type ToolId } from "@/store/drawStore";
import {
  MousePointer2, LineChart, Minus, Eraser, GripVertical, Square,
} from "lucide-react";

type IconType = React.ComponentType<{ size?: number }>;

const tools: Array<{ id: ToolId; label: string; Icon: IconType }> = [
  { id: "select",    label: "Select",     Icon: MousePointer2 },
  { id: "trendline", label: "Trendline",  Icon: LineChart },
  { id: "hline",     label: "Horizontal", Icon: Minus },
  { id: "vline",     label: "Vertical",   Icon: GripVertical },
  { id: "rect",      label: "Rectangle",  Icon: Square },
  { id: "eraser",    label: "Eraser",     Icon: Eraser },
];

export default function Toolbar() {
  const active = useDrawStore((s) => s.activeTool);
  const setTool = useDrawStore((s) => s.setActiveTool);

  return (
    <div className="fixed left-3 top-28 z-50 flex flex-col gap-2 p-2 rounded-xl border bg-[rgba(12,12,14,0.9)] border-[var(--panel-border)] shadow-lg">
      {tools.map(({ id, label, Icon }) => (
        <button
          key={id}
          title={label}
          aria-pressed={active === id}
          onClick={() => setTool(id)}
          className={`p-2 rounded-lg border text-xs hover:bg-white/5 transition ${
            active === id ? "border-blue-500 bg-white/[0.06]" : "border-transparent"
          }`}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
