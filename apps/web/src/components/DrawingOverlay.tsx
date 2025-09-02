"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LwcAdapter } from "@/lib/chart/lwcAdaptor";
import { useDrawStore, type DrawObject, type Point } from "@/store/drawStore";
import { nanoid } from "nanoid";
import type { LogicalRange, MouseEventHandler, Time, UTCTimestamp } from "lightweight-charts";
import {
  useIndicatorOverlayStore,
  type IndicatorBox,
  type BoxStyle,
  type IndicatorLabel,
} from "@/store/indicatorOverlayStore";
import { useChartStore } from "@/store/chartStore";

type PanelId = "p1" | "p2" | "p3" | "p4";

/** Lightweight-charts time-scale helpers (runtime-available methods) */
type ExtendedTimeScale = {
  subscribeVisibleLogicalRangeChange?: (handler: (range: LogicalRange | null) => void) => void;
  unsubscribeVisibleLogicalRangeChange?: (handler: (range: LogicalRange | null) => void) => void;
  subscribeVisibleTimeRangeChange: (handler: (range: { from: Time; to: Time } | null) => void) => void;
  unsubscribeVisibleTimeRangeChange: (handler: (range: { from: Time; to: Time } | null) => void) => void;
  timeToCoordinate: (time: Time) => number | null;
  coordinateToTime: (x: number) => Time | null;
};

export default function DrawingOverlay({
  api,
  panelId,
}: {
  api: LwcAdapter | null;
  panelId: PanelId;
  symbol?: string; // unused, preserved for compat
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // viewId (layout + panel)
  const layout = useChartStore((s) => s.layout);
  const viewId = useMemo(() => `${layout}:${panelId}`, [layout, panelId]);

  // ----- manual drawing tools -----
  const activeTool = useDrawStore((s) => s.activeTool);
  const objectsAll = useDrawStore((s) => s.objects);
  const addObject = useDrawStore((s) => s.addObject);
  const deleteObj = useDrawStore((s) => s.deleteObject);

  // Only manual objects for this panel
  const objects = useMemo(() => objectsAll.filter((o) => o.viewId?.endsWith(panelId)), [objectsAll, panelId]);
  const [draft, setDraft] = useState<DrawObject | null>(null);

  // ----- indicator overlay (boxes + labels) -----
  const byView = useIndicatorOverlayStore((s) => s.byView);
  const { boxes: boxesMap, labels: labelsMap } = useMemo(() => {
    const v = byView[viewId] ?? {};
    return {
      boxes: (v.boxes ?? {}) as Record<string, { boxes: IndicatorBox[]; style?: BoxStyle }>,
      labels: (v.labels ?? {}) as Record<string, { labels: IndicatorLabel[] }>,
    };
  }, [byView, viewId]);

  // Helpers to convert price/time to canvas coordinates
  const priceToY = useCallback((price: number): number => api?.priceToCoord(price) ?? NaN, [api]);

  const timeToX = useCallback(
    (unixSec: number): number | null => {
      if (!api) return null;
      const ts = api.chart.timeScale() as unknown as ExtendedTimeScale;
      const x = ts.timeToCoordinate(unixSec as unknown as UTCTimestamp);
      return typeof x === "number" ? x : null;
    },
    [api]
  );

  useEffect(() => {
    if (!api || !canvasRef.current || !hostRef.current) return;

    const canvas = canvasRef.current;
    const host = hostRef.current;

    const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    };

    const drawBadge = (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      lb: IndicatorLabel,
    ) => {
      const text = lb.text ?? "";
      const padX = 6;
      const padY = 3;
      const fontSize = Math.max(10, Math.min(16, lb.size ?? 12));
      ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      const textW = ctx.measureText(text).width;
      const boxW = Math.max(18, textW + padX * 2);
      const boxH = fontSize + padY * 2;

      // badge
      ctx.fillStyle = lb.bg ?? "rgba(34,197,94,0.9)"; // default green-ish
      roundRect(ctx, cx - boxW / 2, cy - boxH - 8, boxW, boxH, 6);
      ctx.fill();

      // text
      ctx.fillStyle = lb.color ?? "#fff";
      ctx.fillText(text, cx - textW / 2, cy - boxH / 2 - 8 + fontSize / 2);

      // pointer
      const shape = lb.shape ?? "up";
      ctx.beginPath();
      ctx.fillStyle = lb.bg ?? "rgba(34,197,94,0.9)";
      if (shape === "up") {
        ctx.moveTo(cx - 6, cy - 8);
        ctx.lineTo(cx + 6, cy - 8);
        ctx.lineTo(cx, cy - 2);
      } else if (shape === "down") {
        ctx.moveTo(cx - 6, cy + 2);
        ctx.lineTo(cx + 6, cy + 2);
        ctx.lineTo(cx, cy + 8);
      } else if (shape === "circle") {
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      } else if (shape === "square") {
        ctx.rect(cx - 4, cy - 4, 8, 8);
      }
      ctx.closePath();
      ctx.fill();
    };

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

      // ------ draw indicator BOXES (sorted by z) ------
      const boxEntries = Object.entries(boxesMap);
      if (boxEntries.length) {
        boxEntries.sort(([, a], [, b]) => ((a?.style?.z ?? 0) - (b?.style?.z ?? 0)));
        for (const [, payload] of boxEntries) {
          const style = payload.style ?? {};
          const stroke = style.stroke ?? "rgba(0,153,255,1)";
          const fill = style.fill ?? "rgba(0,153,255,0.35)";
          const lw = style.lineWidth ?? 2;

          for (const bx of payload.boxes) {
            // convert ms → sec for LWC coord
            const ax = timeToX(Math.floor(bx.from / 1000));
            const bxX = timeToX(Math.floor(bx.to / 1000));
            const ay = priceToY(bx.top);
            const by = priceToY(bx.bottom);
            if (!Number.isFinite(ay) || !Number.isFinite(by)) continue;

            // fallback for ultra-narrow spans (or missing timeToX at edge)
            const left = ax ?? 1; // 1px in from the edge to make it visible
            const right = bxX ?? left + 6; // thin 5–6px slab if toX missing
            const x = Math.min(left, right);
            const w = Math.max(1, Math.abs(right - left));
            const y = Math.min(ay, by);
            const h = Math.max(1, Math.abs(by - ay));

            ctx.lineWidth = lw;
            ctx.strokeStyle = stroke;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      // ------ draw indicator LABELS ------
      const labelEntries = Object.entries(labelsMap);
      if (labelEntries.length) {
        // You can optionally sort by z if you add it at the label-level.
        // For now, draw insertion order.
        for (const [, payload] of labelEntries) {
          for (const lb of payload.labels) {
            const x = timeToX(Math.floor(lb.time / 1000));
            const y = priceToY(lb.price);
            if (x == null || !Number.isFinite(y)) continue;
            drawBadge(ctx, x, y, lb);
          }
        }
      }

      // ------ draw manual objects ------
      const drawLine = (a: Point, b: Point, color = "#6aa3ff", lw = 1.5) => {
        const Ax = timeToX(a.time);
        const Bx = timeToX(b.time);
        if (Ax == null || Bx == null) return;
        const Ay = priceToY(a.price);
        const By = priceToY(b.price);
        if (!Number.isFinite(Ay) || !Number.isFinite(By)) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(Ax, Ay);
        ctx.lineTo(Bx, By);
        ctx.stroke();
      };

      const drawHLine = (yPrice: number, color = "#8aa", lw = 1) => {
        const y = priceToY(yPrice);
        if (!Number.isFinite(y)) return;
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

      const drawRectManual = (a: Point, b: Point, stroke: string, fill: string, lw: number) => {
        const Ax = timeToX(a.time),
          Bx = timeToX(b.time);
        if (Ax == null || Bx == null) return;
        const Ay = priceToY(a.price),
          By = priceToY(b.price);
        if (!Number.isFinite(Ay) || !Number.isFinite(By)) return;
        const x = Math.min(Ax, Bx),
          y = Math.min(Ay, By);
        const w = Math.abs(Bx - Ax),
          h = Math.abs(By - Ay);
        if (w < 1 || h < 1) return;
        ctx.lineWidth = lw;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
      };

      for (const o of objects) {
        if (o.type === "trendline") drawLine(o.a, o.b, o.color ?? "#6aa3ff", o.width ?? 1.5);
        if (o.type === "hline") drawHLine(o.y, o.color ?? "#8aa", o.width ?? 1);
        if (o.type === "vline") drawVLine(o.x, o.color ?? "#8aa", o.width ?? 1);
        if (o.type === "rect")
          drawRectManual(o.a, o.b, o.color ?? "#6aa3ff", o.fill ?? "rgba(106,163,255,0.20)", o.width ?? 1);
      }

      // draft preview
      if (draft) {
        if (draft.type === "trendline") {
          ctx.setLineDash([4, 3]);
          drawLine(draft.a, draft.b, "#aaa", 1);
          ctx.setLineDash([]);
        }
        if (draft.type === "hline") {
          ctx.setLineDash([4, 3]);
          drawHLine(draft.y, "#aaa", 1);
          ctx.setLineDash([]);
        }
        if (draft.type === "vline") {
          ctx.setLineDash([4, 3]);
          drawVLine(draft.x, "#aaa", 1);
          ctx.setLineDash([]);
        }
        if (draft.type === "rect") {
          drawRectManual(draft.a, draft.b, "#aaa", "rgba(170,170,170,0.12)", 1);
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
  }, [api, boxesMap, labelsMap, objects, draft, priceToY, timeToX]);

  // ----- pointer & tool handling (unchanged) -----
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
          return Number.isFinite(y) && Math.abs(Py - y) <= tol;
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
