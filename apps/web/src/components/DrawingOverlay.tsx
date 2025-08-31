"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LwcAdapter } from "@/lib/chart/lwcAdaptor";
import { useDrawStore, type DrawObject, type Point } from "@/store/drawStore";
import { nanoid } from "nanoid";
import { useChartStore } from "@/store/chartStore";

type PanelId = "p1" | "p2" | "p3" | "p4";

export default function DrawingOverlay({
  api,
  panelId,
  symbol,
}: {
  api: LwcAdapter | null;
  panelId: PanelId;
  symbol?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const layout = useChartStore((s) => s.layout);
  const viewId = `${layout}:${panelId}`;

  const activeTool = useDrawStore((s) => s.activeTool);
  const objectsAll = useDrawStore((s) => s.objects);
  const addObject = useDrawStore((s) => s.addObject);
  const deleteObj = useDrawStore((s) => s.deleteObject);

  const objects = useMemo(
    () => objectsAll.filter((o) => o.viewId === viewId),
    [objectsAll, viewId]
  );

  const [draft, setDraft] = useState<DrawObject | null>(null);

  const priceToY = (price: number): number => api?.priceToCoord(price) ?? 0;
  const timeToX = (time: number): number | null => {
    if (!api) return null;
    const x = api.chart.timeScale().timeToCoordinate(time as any);
    return typeof x === "number" ? x : null;
  };

  useEffect(() => {
    if (!api || !canvasRef.current || !hostRef.current) return;

    const canvas = canvasRef.current;
    const host = hostRef.current;

    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = host.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      const targetW = Math.floor(width * dpr);
      const targetH = Math.floor(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const drawLine = (a: Point, b: Point, color = "#6aa3ff", lw = 1.5) => {
        const Ax = timeToX(a.time);
        const Bx = timeToX(b.time);
        if (Ax == null || Bx == null) return;
        const Ay = priceToY(a.price);
        const By = priceToY(b.price);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(Ax, Ay);
        ctx.lineTo(Bx, By);
        ctx.stroke();
      };

      const drawHLine = (yPrice: number, color = "#8aa", lw = 1) => {
        const y = priceToY(yPrice);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      };

      const drawVLine = (xTime: number, color = "#8aa", lw = 1) => {
        const x = timeToX(xTime);
        if (x == null) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      };

      const drawRect = (a: Point, b: Point, stroke = "#6aa3ff", fill = "rgba(106,163,255,0.12)", lw = 1) => {
        const Ax = timeToX(a.time), Bx = timeToX(b.time);
        if (Ax == null || Bx == null) return;
        const Ay = priceToY(a.price), By = priceToY(b.price);
        const x = Math.min(Ax, Bx), y = Math.min(Ay, By);
        const w = Math.abs(Bx - Ax), h = Math.abs(By - Ay);
        if (w < 1 || h < 1) return;
        ctx.lineWidth = lw;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
      };

      // existing objects
      for (const o of objects) {
        if (o.type === "trendline") drawLine(o.a, o.b, o.color ?? "#6aa3ff", o.width ?? 1.5);
        if (o.type === "hline")     drawHLine(o.y, o.color ?? "#8aa", o.width ?? 1);
        if (o.type === "vline")     drawVLine(o.x, o.color ?? "#8aa", o.width ?? 1);
        if (o.type === "rect")      drawRect(o.a, o.b, o.color ?? "#6aa3ff", o.fill ?? "rgba(106,163,255,0.12)", o.width ?? 1);
      }

      // draft (dashed border for lines; faint fill for rect)
      if (draft) {
        if (draft.type === "trendline") {
          ctx.setLineDash([4, 3]); drawLine(draft.a, draft.b, "#aaa", 1); ctx.setLineDash([]);
        }
        if (draft.type === "hline")     { ctx.setLineDash([4,3]); drawHLine(draft.y, "#aaa", 1); ctx.setLineDash([]); }
        if (draft.type === "vline")     { ctx.setLineDash([4,3]); drawVLine(draft.x, "#aaa", 1); ctx.setLineDash([]); }
        if (draft.type === "rect")      { drawRect(draft.a, draft.b, "#aaa", "rgba(170,170,170,0.12)", 1); }
      }

      ctx.restore();
    };

    const ts = api.chart.timeScale();
    const onTimeRange = () => paint();
    const onLogicalRange = () => paint();
    const onCrosshairMove = () => paint();

    ts.subscribeVisibleTimeRangeChange(onTimeRange);
    (ts as any).subscribeVisibleLogicalRangeChange?.(onLogicalRange);
    api.chart.subscribeCrosshairMove(onCrosshairMove as any);

    const ro = new ResizeObserver(() => paint());
    ro.observe(host);

    paint();

    return () => {
      api.chart.unsubscribeCrosshairMove(onCrosshairMove as any);
      ts.unsubscribeVisibleTimeRangeChange(onTimeRange);
      (ts as any).unsubscribeVisibleLogicalRangeChange?.(onLogicalRange);
      ro.disconnect();
    };
  }, [api, objects, draft]);

  const pickPoint = (clientX: number, clientY: number): Point | null => {
    if (!api || !hostRef.current) return null;
    const rect = hostRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const time = api.chart.timeScale().coordinateToTime(x);
    const price = api.coordToPrice(y);
    if (price == null || time == null) return null;

    if (typeof time === "number") {
      return { time, price }; // UTCTimestamp seconds
    }
    return null; // ignore BusinessDay for our intraday use
  };

  const onMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!api) return;
    if (e.shiftKey) return;

    const p = pickPoint(e.clientX, e.clientY);
    if (!p) return;

    if (activeTool === "select") return;

    if (activeTool === "eraser") {
      if (!hostRef.current) return;
      const rect = hostRef.current.getBoundingClientRect();
      const Px = e.clientX - rect.left;
      const Py = e.clientY - rect.top;
      const tol = 6;

      const hit = (o: DrawObject): boolean => {
        if (o.type === "hline") {
          const y = priceToY(o.y);
          return Math.abs(Py - y) <= tol;
        }
        if (o.type === "vline") {
          const x = timeToX(o.x);
          return x != null && Math.abs(Px - x) <= tol;
        }
        if (o.type === "trendline") {
          const Ax = timeToX(o.a.time); const Bx = timeToX(o.b.time);
          if (Ax == null || Bx == null) return false;
          const Ay = priceToY(o.a.price); const By = priceToY(o.b.price);
          const vx = Bx - Ax, vy = By - Ay;
          const wx = Px - Ax, wy = Py - Ay;
          const c1 = vx * wx + vy * wy; const c2 = vx * vx + vy * vy;
          let t = c2 ? c1 / c2 : 0; t = Math.max(0, Math.min(1, t));
          const nx = Ax + t * vx, ny = Ay + t * vy;
          const dist = Math.hypot(Px - nx, Py - ny);
          return dist <= tol;
        }
        if (o.type === "rect") {
          const Ax = timeToX(o.a.time), Bx = timeToX(o.b.time);
          if (Ax == null || Bx == null) return false;
          const Ay = priceToY(o.a.price), By = priceToY(o.b.price);
          const x1 = Math.min(Ax, Bx), x2 = Math.max(Ax, Bx);
          const y1 = Math.min(Ay, By), y2 = Math.max(Ay, By);
          return Px >= x1 && Px <= x2 && Py >= y1 && Py <= y2;
        }
        return false;
      };

      const victim = [...objects].reverse().find(hit);
      if (victim) deleteObj(victim.id);
      return;
    }

    if (activeTool === "hline") {
      setDraft({ id: "draft", viewId, type: "hline", y: p.price });
      return;
    }

    if (activeTool === "vline") {
      setDraft({ id: "draft", viewId, type: "vline", x: p.time });
      return;
    }

    if (activeTool === "rect") {
      setDraft({ id: "draft", viewId, type: "rect", a: p, b: p });
      return;
    }

    if (activeTool === "trendline") {
      setDraft({ id: "draft", viewId, type: "trendline", a: p, b: p });
      return;
    }
  };

  const onMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!api || !draft) return;
    const p = pickPoint(e.clientX, e.clientY);
    if (!p) return;

    if (draft.type === "trendline") setDraft({ ...draft, b: p });
    if (draft.type === "hline")     setDraft({ ...draft, y: p.price });
    if (draft.type === "vline")     setDraft({ ...draft, x: p.time });
    if (draft.type === "rect")      setDraft({ ...draft, b: p });
  };

  const onMouseUp: React.MouseEventHandler<HTMLDivElement> = () => {
    if (!draft) return;

    if (draft.type === "trendline") {
      if (draft.a.time !== draft.b.time || draft.a.price !== draft.b.price) {
        addObject({ ...draft, id: nanoid(), color: "#6aa3ff", width: 1.5 });
      }
    }
    if (draft.type === "hline") {
      addObject({ ...draft, id: nanoid(), color: "#8aa", width: 1 });
    }
    if (draft.type === "vline") {
      addObject({ ...draft, id: nanoid(), color: "#8aa", width: 1 });
    }
    if (draft.type === "rect") {
      if (Math.abs(draft.a.time - draft.b.time) > 0 && Math.abs(draft.a.price - draft.b.price) > 0) {
        addObject({ ...draft, id: nanoid(), color: "#6aa3ff", fill: "rgba(106,163,255,0.12)", width: 1 });
      }
    }

    setDraft(null);
  };

  const pointerEvents = activeTool === "select" ? "none" : "auto";

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 z-20"
      style={{ pointerEvents }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
