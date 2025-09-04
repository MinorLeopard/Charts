"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  createChart,
  type IChartApi,
  type CandlestickData,
  type Time,
  CandlestickSeries,
  LineSeries,
} from "lightweight-charts";

// Monaco runs client-side only
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function IndicatorEditorPage() {
  const chartEl = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const demoDataRef = useRef<CandlestickData<Time>[]>([]);

  const [code, setCode] = useState<string>(
    `// Example: Simple Moving Average
// Expects: array of candlesticks with {time, open, high, low, close}
// Returns: array of {time, value}
function calculate(data, length = 3) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    if (i + 1 < length) {
      out.push({ time: data[i].time, value: null });
      continue;
    }
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) sum += data[j].close;
    out.push({ time: data[i].time, value: sum / length });
  }
  return out;
}`
  );

  useEffect(() => {
    if (!chartEl.current) return;

    const chart = createChart(chartEl.current, {
      layout: { background: { color: "#0b0f14" }, textColor: "#e6e8eb" },
      grid: {
        vertLines: { color: "#1c2330" },
        horzLines: { color: "#1c2330" },
      },
      autoSize: true,
    });
    chartRef.current = chart;

    // main candles
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    candleSeriesRef.current = candle;

    // small demo dataset
    const demo: CandlestickData<Time>[] = [
      { time: 1 as Time, open: 100, high: 110, low:  95, close: 105 },
      { time: 2 as Time, open: 105, high: 112, low: 101, close: 108 },
      { time: 3 as Time, open: 108, high: 118, low: 106, close: 115 },
      { time: 4 as Time, open: 115, high: 121, low: 112, close: 116 },
      { time: 5 as Time, open: 116, high: 124, low: 114, close: 123 },
      { time: 6 as Time, open: 123, high: 126, low: 119, close: 121 },
      { time: 7 as Time, open: 121, high: 129, low: 120, close: 128 },
      { time: 8 as Time, open: 128, high: 131, low: 124, close: 126 },
      { time: 9 as Time, open: 126, high: 133, low: 123, close: 132 },
      { time: 10 as Time, open: 132, high: 138, low: 130, close: 137 },
    ];
    demoDataRef.current = demo;
    candle.setData(demo);

    // cleanup
    return () => chart.remove();
  }, []);

  const runCode = () => {
    const chart = chartRef.current;
    const candle = candleSeriesRef.current;
    if (!chart || !candle) return;

    try {
      // The user function must be named `calculate`
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        "data",
        `${code}\nreturn typeof calculate==='function'?calculate(data):null;`
      ) as (d: CandlestickData<Time>[]) => { time: Time; value: number | null }[] | null;

      const result = fn(demoDataRef.current);
      if (!result || !Array.isArray(result)) {
        alert("Your code must define function calculate(data) and return [{time,value}, ...].");
        return;
      }

      // Add/update an SMA line series
      const line = chart.addSeries(LineSeries, {
        color: "#f2c94c",
        lineWidth: 2,
      });
      line.setData(result);
    } catch (err) {
      console.error(err);
      alert("Error running code. Open console for details.");
    }
  };

  return (
    <div className="flex h-screen w-full">
      <div ref={chartEl} className="flex-1 border-r border-[var(--panel-border)]" />

      <div className="w-[50%] h-full flex flex-col">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          value={code}
          onChange={(val?: string) => setCode(val ?? "")}
          options={{ fontSize: 14, minimap: { enabled: false } }}
        />
        <div className="p-2 border-t border-[var(--panel-border)]">
          <button
            onClick={runCode}
            className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
          >
            Run Indicator
          </button>
        </div>
      </div>
    </div>
  );
}
