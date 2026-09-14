/** Start fetching the ECharts plot chunk before Content mounts. */
export function preloadPricingHistoryPlot() {
  void import('./plot')
}
