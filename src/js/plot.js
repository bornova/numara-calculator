import { $, app, store } from './common'
import { math } from './eval'
import { productName } from './../../package.json'
import functionPlot from 'function-plot'

/**
 * Plot function.
 */
export function plot() {
  $('#plotTitle').innerHTML = app.plotFunction

  const f = math.simplify(app.plotFunction.split('=')[1], app.mathScope).toString()

  let domain = math.abs(math.evaluate(f, { x: 0 })) * 2

  if (domain === Infinity || domain === 0) {
    domain = 10
  }

  const xDomain = app.activePlot ? app.activePlot.meta.xScale.domain() : [-domain, domain]
  const yDomain = app.activePlot ? app.activePlot.meta.yScale.domain() : [-domain, domain]

  app.activePlot = functionPlot.default({
    data: [
      {
        derivative: app.settings.plotDerivative
          ? { fn: math.derivative(f, 'x').toString(), updateOnMouseMove: true }
          : false,
        fn: f,
        graphType: 'polyline',
        sampler: 'builtIn'
      }
    ],
    grid: app.settings.plotGrid,
    height: $('#plot').clientHeight,
    target: '#plot',
    tip: {
      xLine: app.settings.plotCross,
      yLine: app.settings.plotCross
    },
    width: $('#plot').clientWidth,
    xAxis: { domain: xDomain },
    yAxis: { domain: yDomain }
  })
}

/**
 * Update plot settings and re-plot.
 * @param {string} setting - The setting to update.
 * @param {boolean} value - The value to set.
 */
function updatePlotSetting(setting, value) {
  app.settings[setting] = value
  store.set('settings', app.settings)
  plot()
}

// Event listeners for plot settings
$('#plotCrossModal').addEventListener('click', () => {
  updatePlotSetting('plotCross', $('#plotCrossModal').checked)
})

$('#plotDerivativeModal').addEventListener('click', () => {
  updatePlotSetting('plotDerivative', $('#plotDerivativeModal').checked)
})

$('#plotGridModal').addEventListener('click', () => {
  updatePlotSetting('plotGrid', $('#plotGridModal').checked)
})

/**
 * Export plot as SVG.
 */
$('#exportPlot').addEventListener('click', () => {
  $('.function-plot').setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const fileName = `${productName} Plot ${app.plotFunction}`
  const preface = '<?xml version="1.0" standalone="no"?>\r\n'
  const svgData = $('.function-plot').outerHTML
  const svgBlob = new Blob([preface, svgData], { type: 'image/svg+xml;charset=utf-8' })
  const downloadLink = document.createElement('a')

  downloadLink.href = URL.createObjectURL(svgBlob)
  downloadLink.download = fileName
  downloadLink.click()

  setTimeout(() => URL.revokeObjectURL(downloadLink.href), 60000)
})

/**
 * Reset plot to default state.
 */
$('#resetPlot').addEventListener('click', () => {
  app.activePlot = null
  plot()
})
