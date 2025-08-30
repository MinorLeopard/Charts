"use client";
import { useChartStore } from "@/store/chartStore";

export default function ModeToggle() {
  const mode = useChartStore(s=>s.mode);
  const setMode = useChartStore(s=>s.setMode);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm opacity-70">Mode:</span>
      <button onClick={()=>setMode("online")} className={`px-2 py-1 rounded ${mode==="online"?"bg-blue-600 text-white":"bg-muted"}`}>Online</button>
      <button onClick={()=>setMode("offline")} className={`px-2 py-1 rounded ${mode==="offline"?"bg-blue-600 text-white":"bg-muted"}`}>Offline</button>
    </div>
  );
}
