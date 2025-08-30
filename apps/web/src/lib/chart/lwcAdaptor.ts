import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type OHLC = { t:number;o:number;h:number;l:number;c:number;v:number };

export type LwcAdapter = {
  chart: IChartApi;
  setData: (bars: OHLC[]) => void;
};

export function mountLwc(el: HTMLDivElement): LwcAdapter {
  const chart: IChartApi = createChart(el, {
    autoSize: true,
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false },
    layout: { fontFamily: "Inter, system-ui, sans-serif" , attributionLogo: false},
    
  });

  const candleSeries = chart.addSeries(CandlestickSeries, { priceScaleId: "right" });
  const volumeSeries = chart.addSeries(HistogramSeries, {
    priceScaleId: "left",
    priceFormat: { type: "volume" },
  });

  chart.priceScale("left").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

  function setData(bars: OHLC[]) {
    const price = bars.map(b => ({
      time: Math.floor(b.t / 1000) as UTCTimestamp,
      open: b.o, high: b.h, low: b.l, close: b.c,
    }));
    const vol = bars.map(b => ({
      time: Math.floor(b.t / 1000) as UTCTimestamp,
      value: b.v,
    }));
    candleSeries.setData(price);
    volumeSeries.setData(vol);
  }

  return { chart, setData };
}
