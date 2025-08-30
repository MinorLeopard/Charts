import { createChart, ISeriesApi } from "lightweight-charts";

export type OHLC = { t:number; o:number; h:number; l:number; c:number; v:number };

export function mountLwc(el: HTMLDivElement) {
  const chart = createChart(el, { autoSize: true, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false } });
  const candleSeries = chart.addCandlestickSeries();
  const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
  chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

  function setData(bars: OHLC[]) {
    const price = bars.map(b => ({ time: Math.floor(b.t/1000) as any, open: b.o, high: b.h, low: b.l, close: b.c }));
    const vol   = bars.map(b => ({ time: Math.floor(b.t/1000) as any, value: b.v, color: (b.c >= b.o) ? undefined : undefined }));
    candleSeries.setData(price);
    volumeSeries.setData(vol);
  }

  return { chart, setData, candleSeries, volumeSeries };
}
