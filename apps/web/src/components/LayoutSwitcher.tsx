"use client";
import { useChartStore } from "@/store/chartStore";
import { LayoutGrid, PanelLeft, PanelRight } from "lucide-react";

const BTN = "px-2 py-1 rounded border text-sm hover:bg-white/5";

export default function LayoutSwitcher() {
  const layout = useChartStore(s => s.layout);
  const setLayout = useChartStore(s => s.setLayout);
  const active = (id: string) => layout === id ? "bg-blue-600 text-white border-blue-600" : "";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Layout:</span>
      <button className={`${BTN} ${active("1x1")}`} onClick={()=>setLayout("1x1")}><PanelLeft size={16}/> 1×1</button>
      <button className={`${BTN} ${active("2x1")}`} onClick={()=>setLayout("2x1")}><PanelRight size={16}/> 2×1</button>
      <button className={`${BTN} ${active("2x2")}`} onClick={()=>setLayout("2x2")}><LayoutGrid size={16}/> 2×2</button>
    </div>
  );
}
