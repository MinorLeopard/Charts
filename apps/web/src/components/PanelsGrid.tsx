"use client";
import { useChartStore } from "@/store/chartStore";
import ChartPanel from "./ChartPanel";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { useIsClient } from "@/lib/useIsClient";
export default function PanelsGrid() {
  const layout = useChartStore(s => s.layout);
  const maximized = useChartStore(s => s.maximizedPanelId);
  const isClient = useIsClient();
  if (!isClient) return <div className="h-[calc(100vh-96px)]" />;
  // Fullscreen a single panel
  if (maximized) {
    return (
      <div className="h-[calc(100vh-96px)] min-h-[600px]">
        <ChartPanel panelId={maximized} />
      </div>
    );
  }

  if (layout === "1x1") {
    return (
      <div className="h-[calc(100vh-96px)] min-h-[600px]">
        <ChartPanel panelId="p1" />
      </div>
    );
  }

  if (layout === "2x1") {
    return (
      <div className="h-[calc(100vh-96px)] min-h-[600px]">
        <PanelGroup direction="horizontal" className="h-full gap-2">
          <Panel defaultSize={50} minSize={20}><div className="h-full"><ChartPanel panelId="p1" /></div></Panel>
          <PanelResizeHandle className="w-1 bg-border" />
          <Panel defaultSize={50} minSize={20}><div className="h-full"><ChartPanel panelId="p2" /></div></Panel>
        </PanelGroup>
      </div>
    );
  }

  // 2x2
  return (
    <div className="h-[calc(100vh-96px)] min-h-[600px]">
      <PanelGroup direction="vertical" className="h-full gap-2">
        <Panel defaultSize={50} minSize={20}>
          <PanelGroup direction="horizontal" className="h-full gap-2">
            <Panel defaultSize={50} minSize={20}><div className="h-full"><ChartPanel panelId="p1" /></div></Panel>
            <PanelResizeHandle className="w-1 bg-border" />
            <Panel defaultSize={50} minSize={20}><div className="h-full"><ChartPanel panelId="p2" /></div></Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="h-1 bg-border" />
        <Panel defaultSize={50} minSize={20}>
          <PanelGroup direction="horizontal" className="h-full gap-2">
            <Panel defaultSize={50} minSize={20}><div className="h-full"><ChartPanel panelId="p3" /></div></Panel>
            <PanelResizeHandle className="w-1 bg-border" />
            <Panel defaultSize={50} minSize={20}><div className="h-full"><ChartPanel panelId="p4" /></div></Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
}
