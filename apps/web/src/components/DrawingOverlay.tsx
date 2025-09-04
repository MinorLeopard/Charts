// src/components/DrawingOverlay.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LwcAdapter } from "@/lib/chart/lwcAdaptor";
import { useDrawStore, type DrawObject, type Point } from "@/store/drawStore";
import { nanoid } from "nanoid";
import type { LogicalRange, MouseEventHandler, Time, UTCTimestamp } from "lightweight-charts";
import { useIndicatorOverlayStore } from "@/store/indicatorOverlayStore";
import { useChartStore } from "@/store/chartStore";

type PanelId = "p1" | "p2" | "p3" | "p4";

type ExtendedTimeScale = {
  subscribeVisibleLogicalRangeChange?: (handler: (range: LogicalRange | null) => void) => void;
  unsubscribeVisibleLogicalRangeChange?: (handler: (range: LogicalRange | null) => void) => void;
  subscribeVisibleTimeRangeChange: (handler: (range: { from: Time; to: Time } | null) => void) => void;
  unsubscribeVisibleTimeRangeChange: (handler: (range: { from: Time; to: Time } | null) => void) => void;
  timeToCoordinate: (time: Time) => number | null;
  coordinateToTime: (x: number) => Time | null;
};

type OverlayBox = { from: number; to: number; top: number; bottom: number };
type OverlayStyle = { fill?: string; stroke?: string; lineWidth?: number; z?: number };
type OverlayPayload = { boxes?: OverlayBox[]; labels?: Array<{ time: number; price: number; text?: string; color?: string; bg?: string; align?: "above" | "below"; shape?: "up" | "down" | "circle"; size?: number; stroke?: string; strokeWidth?: number }>; style?: OverlayStyle };

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export default function DrawingOverlay({
  api,
  panelId,
}: {
  api: LwcAdapter | null;
  panelId: PanelId;
  symbol?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const layout = useChartStore((s) => s.layout);
  const viewId = useMemo(() => `${layout}:${panelId}`, [layout, panelId]);

  // Manual tools
  const activeTool = useDrawStore((s) => s.activeTool);
  const objectsAll = useDrawStore((s) => s.objects);
  const addObject = useDrawStore((s) => s.addObject);
  const deleteObj = useDrawStore((s) => s.deleteObject);
  const objects = useMemo(() => objectsAll.filter((o) => o.viewId?.endsWith(panelId)), [objectsAll, panelId]);

  // Indicator overlays
  const byView = useIndicatorOverlayStore((s) => s.byView);
  const indicatorForView = useMemo(() => (byView[viewId] ?? {}) as Record<string, OverlayPayload>, [byView, viewId]);

  const [draft, setDraft] = useState<DrawObject | null>(null);

  const priceToY = useCallback((price: number): number => api?.priceToCoord(price) ?? 0, [api]);

  const timeToX = useCallback(
    (unixSec: number): number | null => {
      if (!api) return null;
      const ts = api.chart.timeScale() as unknown as ExtendedTimeScale;
      const x = ts.timeToCoordinate(unixSec as unknown as UTCTimestamp);
      return typeof x === "number" ? x : null;
    },
    [api]
  );

  // normalize “maybe-ms” to seconds
  const toSec = (t: number) => (t > 1e11 ? Math.floor(t / 1000) : t);

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

      const drawRect = (a: Point, b: Point, stroke: string, fill: string, lw: number) => {
        const Ax = timeToX(a.time);
        const Bx = timeToX(b.time);
        // clamp off-screen to panel edges
        const X1 = Ax == null ? 0 : Ax;
        const X2 = Bx == null ? width : Bx;
        const Ay = priceToY(a.price);
        const By = priceToY(b.price);
        const x = Math.min(X1, X2), y = Math.min(Ay, By);
        const w = Math.abs(X2 - X1), h = Math.abs(By - Ay);
        if (w < 1 || h < 1) return;
        ctx.lineWidth = lw;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
      };

      const drawLabel = (l: {
        time: number;
        price: number;
        text: string;
        color?: string;
        bg?: string;
        align?: "above" | "below";
        shape?: "up" | "down" | "circle";
        size?: number;
        stroke?: string;
        strokeWidth?: number;
      }) => {
        const x = timeToX(toSec(l.time));
        if (x == null) return;
        const y = priceToY(l.price);

        // marker
        if (l.shape) {
          const size = Math.max(6, Math.min(30, l.size ?? 12));
          const fill = l.bg ?? "rgba(0,0,0,0.75)";
          const stroke = l.stroke ?? fill;
          const lw = l.strokeWidth ?? 1;

          ctx.save();
          ctx.lineWidth = lw;
          ctx.strokeStyle = stroke;
          ctx.fillStyle = fill;

          if (l.shape === "up") {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - size, y + size);
            ctx.lineTo(x + size, y + size);
            ctx.closePath();
            ctx.fill();
            if (lw > 0) ctx.stroke();
          } else if (l.shape === "down") {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - size, y - size);
            ctx.lineTo(x + size, y - size);
            ctx.closePath();
            ctx.fill();
            if (lw > 0) ctx.stroke();
          } else if (l.shape === "circle") {
            ctx.beginPath();
            ctx.arc(x, y, size * 0.75, 0, Math.PI * 2);
            ctx.fill();
            if (lw > 0) ctx.stroke();
          }

          ctx.restore();
        }

        // bubble + text
        if (l.text && l.text.length) {
          const paddingX = 6,
            radius = 4,
            pointer = 5;

          ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
          ctx.textBaseline = "middle";
          const textW = ctx.measureText(l.text).width;
          const boxW = Math.ceil(textW + paddingX * 2);
          const boxH = 18;

          const above = (l.align ?? "above") === "above";
          const bx = Math.round(x - boxW / 2);
          const by = Math.round(above ? y - (boxH + pointer) : y + pointer);

          ctx.fillStyle = l.bg ?? "rgba(0,0,0,0.75)";
          ctx.strokeStyle = ctx.fillStyle;
          roundRectPath(ctx, bx, by, boxW, boxH, radius);
          ctx.fill();

          // pointer
          ctx.beginPath();
          if (above) {
            ctx.moveTo(x, y);
            ctx.lineTo(x - pointer, by + boxH);
            ctx.lineTo(x + pointer, by + boxH);
          } else {
            ctx.moveTo(x, y);
            ctx.lineTo(x - pointer, by);
            ctx.lineTo(x + pointer, by);
          }
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = l.color ?? "#fff";
          ctx.fillText(l.text, bx + paddingX, by + boxH / 2);
        }
      };

      // ---- INDICATOR BOXES / LABELS ----
      const entries = Object.entries(indicatorForView);

      // Boxes
      const boxEntries = entries
        .filter(([, p]) => Array.isArray(p.boxes) && p.boxes.length > 0)
        .sort(([, a], [, b]) => ((a.style?.z ?? 0) - (b.style?.z ?? 0)));

      for (const [_id, payload] of boxEntries) {
        const { boxes, style } = payload;
        const stroke = style?.stroke ?? "rgba(255,215,0,1)";
        const fill = style?.fill ?? "rgba(255,215,0,0.45)";
        const lw = style?.lineWidth ?? 2;

        if (!boxes || boxes.length === 0) continue;
        //const fb = boxes[0];
        //const X1 = timeToX(toSec(fb.from));
        //const X2 = timeToX(toSec(fb.to));
        // debug log:
        // console.log("[overlay.box] first", { id, from: fb.from, to: fb.to, X1, X2, top: fb.top, bottom: fb.bottom });

        for (const bx of boxes) {
          const a: Point = { time: toSec(bx.from), price: Math.max(bx.top, bx.bottom) };
          const b: Point = { time: toSec(bx.to), price: Math.min(bx.top, bx.bottom) };
          drawRect(a, b, stroke, fill, lw);
        }
      }

      // Labels
      const labelEntries = entries.filter(([, p]) => Array.isArray(p.labels) && p.labels.length > 0);
      for (const [_id, payload] of labelEntries) {
        const { labels } = payload;
        if (!labels || labels.length === 0) continue;
        // debug log:
        // console.log("[overlay.labels] plot", id, "count", labels.length, "first", labels[0]);
       for (const l of labels) {
          // Ensure required text field is a string
         drawLabel({ ...l, text: l?.text ?? "" });
      }
      }

      // ---- MANUAL DRAW OBJECTS ----
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
      const drawVLine = (xTimeSec: number, color = "#8aa", lw = 1) => {
        const x = timeToX(xTimeSec);
        if (x == null) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      };

      for (const o of objects) {
        if (o.type === "trendline") drawLine(o.a, o.b, o.color ?? "#6aa3ff", o.width ?? 1.5);
        if (o.type === "hline") drawHLine(o.y, o.color ?? "#8aa", o.width ?? 1);
        if (o.type === "vline") drawVLine(o.x, o.color ?? "#8aa", o.width ?? 1);
        if (o.type === "rect") {
          const a = o.a,
            b = o.b;
          const stroke = o.color ?? "#6aa3ff";
          const fill = o.fill ?? "rgba(106,163,255,0.20)";
          const lw = o.width ?? 1;
          drawRect(a, b, stroke, fill, lw);
        }
      }

      ctx.restore();
    };

    const ts = api.chart.timeScale() as unknown as ExtendedTimeScale;
    const onTimeRange = () => paint();
    const onLogicalRange = () => paint();

    ts.subscribeVisibleTimeRangeChange(onTimeRange);
    ts.subscribeVisibleLogicalRangeChange?.(onLogicalRange);

    const onCrosshairMove: MouseEventHandler<Time> = () => paint();
    api.chart.subscribeCrosshairMove(onCrosshairMove);

    const ro = new ResizeObserver(() => paint());
    ro.observe(host);

    paint();

    return () => {
      api.chart.unsubscribeCrosshairMove(onCrosshairMove);
      ts.unsubscribeVisibleTimeRangeChange(onTimeRange);
      ts.unsubscribeVisibleLogicalRangeChange?.(onLogicalRange);
      ro.disconnect();
    };
  }, [api, objects, draft, priceToY, timeToX, indicatorForView, viewId]);

  // --- Pointer / tool handling ---
  const pickPoint = (clientX: number, clientY: number): Point | null => {
    if (!api || !hostRef.current) return null;
    const rect = hostRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const ts = api.chart.timeScale() as unknown as ExtendedTimeScale;
    const t = ts.coordinateToTime(x);
    const p = api.coordToPrice(y);
    if (t == null || p == null) return null;
    const unixSec = typeof t === "number" ? t : (t as unknown as UTCTimestamp);
    return { time: Number(unixSec), price: p };
  };

  const onMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!api) return;
    if (e.shiftKey) return;
    const p = pickPoint(e.clientX, e.clientY);
    if (!p) return;
    const tool = activeTool;
    if (tool === "select") return;

    if (tool === "eraser") {
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
          const Ax = timeToX(o.a.time);
          const Bx = timeToX(o.b.time);
          if (Ax == null || Bx == null) return false;
          const Ay = priceToY(o.a.price);
          const By = priceToY(o.b.price);
          const vx = Bx - Ax,
            vy = By - Ay;
          const wx = Px - Ax,
            wy = Py - Ay;
          const c1 = vx * wx + vy * wy;
          const c2 = vx * vx + vy * vy;
          let t = c2 ? c1 / c2 : 0;
          t = Math.max(0, Math.min(1, t));
          const nx = Ax + t * vx,
            ny = Ay + t * vy;
          const dist = Math.hypot(Px - nx, Py - ny);
          return dist <= tol;
        }
        if (o.type === "rect") {
          const Ax = timeToX(o.a.time),
            Bx = timeToX(o.b.time);
          if (Ax == null || Bx == null) return false;
          const Ay = priceToY(o.a.price),
            By = priceToY(o.b.price);
          const x1 = Math.min(Ax, Bx),
            x2 = Math.max(Ax, Bx);
          const y1 = Math.min(Ay, By),
            y2 = Math.max(Ay, By);
          return Px >= x1 && Px <= x2 && Py >= y1 && Py <= y2;
        }
        return false;
      };

      const victim = [...objects].reverse().find(hit);
      if (victim) deleteObj(victim.id);
      return;
    }

    if (tool === "hline") {
      setDraft({ id: "draft", viewId: `any:${panelId}`, type: "hline", y: p.price });
      return;
    }
    if (tool === "vline") {
      setDraft({ id: "draft", viewId: `any:${panelId}`, type: "vline", x: p.time });
      return;
    }
    if (tool === "rect") {
      setDraft({ id: "draft", viewId: `any:${panelId}`, type: "rect", a: p, b: p });
      return;
    }
    if (tool === "trendline") {
      setDraft({ id: "draft", viewId: `any:${panelId}`, type: "trendline", a: p, b: p });
      return;
    }
  };

  const onMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!api || !draft) return;
    const p = pickPoint(e.clientX, e.clientY);
    if (!p) return;

    if (draft.type === "trendline") setDraft({ ...draft, b: p });
    if (draft.type === "hline") setDraft({ ...draft, y: p.price });
    if (draft.type === "vline") setDraft({ ...draft, x: p.time });
    if (draft.type === "rect") setDraft({ ...draft, b: p });
  };

  const onMouseUp: React.MouseEventHandler<HTMLDivElement> = () => {
    if (!draft) return;

    if (draft.type === "trendline") {
      if (draft.a.time !== draft.b.time || draft.a.price !== draft.b.price) {
        addObject({ ...draft, id: nanoid(), color: "#6aa3ff", width: 1.5 });
      }
    } else if (draft.type === "hline") {
      addObject({ ...draft, id: nanoid(), color: "#8aa", width: 1 });
    } else if (draft.type === "vline") {
      addObject({ ...draft, id: nanoid(), color: "#8aa", width: 1 });
    } else if (draft.type === "rect") {
      if (Math.abs(draft.a.time - draft.b.time) > 0 && Math.abs(draft.a.price - draft.b.price) > 0) {
        addObject({ ...draft, id: nanoid(), color: "#6aa3ff", fill: "rgba(106,163,255,0.20)", width: 1 });
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
