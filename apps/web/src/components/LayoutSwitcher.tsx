"use client";
import { useChartStore } from "@/store/chartStore";
import {
  LayoutGrid,
  PanelLeft,
  PanelRight,
  type LucideIcon, // ← use Lucide's icon type
} from "lucide-react";

const BTN = "px-2 py-1 rounded-lg border text-sm hover:bg-white/5 transition";

export default function LayoutSwitcher() {
  const layout = useChartStore((s) => s.layout);
  const setLayout = useChartStore((s) => s.setLayout);

  const Btn = ({
    id,
    label,
    Icon,
  }: {
    id: "1x1" | "2x1" | "2x2";
    label: string;
    Icon: LucideIcon; // ← allows className, strokeWidth, etc.
  }) => (
    <button
      onClick={() => setLayout(id)}
      className={`${BTN} ${
        layout === id
          ? "border-blue-500 text-white bg-blue-600/20"
          : "border-[var(--panel-border)] text-muted"
      }`}
      aria-pressed={layout === id}
    >
      <Icon size={16} className="inline-block mr-1" />
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Layout:</span>
      <Btn id="1x1" label="1×1" Icon={PanelLeft} />
      <Btn id="2x1" label="2×1" Icon={PanelRight} />
      <Btn id="2x2" label="2×2" Icon={LayoutGrid} />
    </div>
  );
}
