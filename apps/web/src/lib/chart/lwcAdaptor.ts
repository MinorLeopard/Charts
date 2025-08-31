import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type OHLC = { t: number; o: number; h: number; l: number; c: number; v: number };

// Adapter surface that other components (DrawingOverlay) will use
export type LwcAdapter = {
  chart: IChartApi;
  setData: (bars: OHLC[]) => void;
  clear: () => void;

  // helpers for interactions (Y px <-> price)
  priceToCoord: (price: number) => number | undefined;
  coordToPrice: (y: number) => number | undefined;

  // price scale range helpers (right scale)
  getPriceRange: () => { from: number; to: number } | null;
  setPriceRange: (r: { from: number; to: number }) => void;
};

export function mountLwc(el: HTMLDivElement): LwcAdapter {
  if (!el.style.minHeight) el.style.minHeight = "300px";

  const chart: IChartApi = createChart(el, {
    autoSize: true,
    layout: {
      fontFamily: "Inter, system-ui, sans-serif",
      attributionLogo: false,
      background: { color: "#131722" },
      textColor: "#e6e8eb",
    },
    grid: {
      vertLines: { color: "#2a2e39", style: 0, visible: true },
      horzLines: { color: "#2a2e39", style: 0, visible: true },
    },
    rightPriceScale: { borderVisible: false },
    leftPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false },
  });

  // --- Main series (keep reference; used for conversions) ---
  const candleSeries = chart.addSeries(CandlestickSeries, {
    priceScaleId: "right",
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderVisible: false,
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });

  // Volume on left scale
  const volumeSeries = chart.addSeries(HistogramSeries, {
    priceScaleId: "left",
    priceFormat: { type: "volume" },
  });
  chart.priceScale("left").applyOptions({ scaleMargins: { top: 0.8, bottom: 0.0 } });

  function setData(bars: OHLC[]) {
    const sorted = (bars ?? []).slice().sort((a, b) => a.t - b.t);

    const price = sorted.map((b) => ({
      time: Math.floor(b.t / 1000) as UTCTimestamp,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }));

    const vol = sorted.map((b) => ({
      time: Math.floor(b.t / 1000) as UTCTimestamp,
      value: b.v,
    }));

    candleSeries.setData(price);
    volumeSeries.setData(vol);
  }

  function clear() {
    candleSeries.setData([]);
    volumeSeries.setData([]);
  }

  // --- Conversions via MAIN candle series (reliable) ---
  function priceToCoord(price: number): number | undefined {
    const y = candleSeries.priceToCoordinate(price);
    return typeof y === "number" ? y : undefined;
  }

  function coordToPrice(y: number): number | undefined {
    const p = candleSeries.coordinateToPrice(y);
    return typeof p === "number" ? p : undefined;
  }

  // --- Price scale range (right) ---
  const getPriceRange = () => chart.priceScale("right").getVisibleRange();
  const setPriceRange = (r: { from: number; to: number }) =>
    chart.priceScale("right").setVisibleRange(r);

  return {
    chart,
    setData,
    clear,
    priceToCoord,
    coordToPrice,
    getPriceRange,
    setPriceRange,
  };
}
