"use client";
import { useChartStore } from "@/store/chartStore";
import ChartPanel from "./ChartPanel";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

export default function PanelsGrid() {
  const layout = useChartStore(s => s.layout);

  if (layout === "1x1") {
    return (
      <div className="h-[70vh]">
        <ChartPanel panelId="p1" />
      </div>
    );
  }

  if (layout === "2x1") {
    return (
      <PanelGroup direction="horizontal" className="h-[70vh] gap-2">
        <Panel defaultSize={50} minSize={20}><ChartPanel panelId="p1" /></Panel>
        <PanelResizeHandle className="w-1 bg-border" />
        <Panel defaultSize={50} minSize={20}><ChartPanel panelId="p2" /></Panel>
      </PanelGroup>
    );
  }

  // 2x2
  return (
    <PanelGroup direction="vertical" className="h-[70vh] gap-2">
      <Panel defaultSize={50} minSize={20}>
        <PanelGroup direction="horizontal" className="h-full gap-2">
          <Panel defaultSize={50} minSize={20}><ChartPanel panelId="p1" /></Panel>
          <PanelResizeHandle className="w-1 bg-border" />
          <Panel defaultSize={50} minSize={20}><ChartPanel panelId="p2" /></Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle className="h-1 bg-border" />
      <Panel defaultSize={50} minSize={20}>
        <PanelGroup direction="horizontal" className="h-full gap-2">
          <Panel defaultSize={50} minSize={20}><ChartPanel panelId="p3" /></Panel>
          <PanelResizeHandle className="w-1 bg-border" />
          <Panel defaultSize={50} minSize={20}><ChartPanel panelId="p4" /></Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
