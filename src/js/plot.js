import { $, app } from './common'
import { math } from './math'

import functionPlot from 'function-plot'

/** Plot function. */
export function plot() {
  $('#plotTitle').innerHTML = app.plotFunction

  const f = app.plotFunction.split('=')[1]

  let domain = math.abs(math.evaluate(f, { x: 0 })) * 2

  if (domain === Infinity || domain === 0) {
    domain = 10
  }

  const xDomain = app.activePlot ? app.activePlot.meta.xScale.domain() : [-domain, domain]
  const yDomain = app.activePlot ? app.activePlot.meta.yScale.domain() : [-domain, domain]

  app.activePlot = functionPlot.default({
    data: [
      {
        fn: f,
        graphType: 'polyline',
        sampler: 'builtIn',
        derivative: app.settings.plotDerivative
          ? { fn: math.derivative(f, 'x').toString(), updateOnMouseMove: true }
          : false
      }
    ],
    target: '#plot',
    height: $('#plot').clientHeight,
    width: $('#plot').clientWidth,
    xAxis: { domain: xDomain },
    yAxis: { domain: yDomain },
    grid: app.settings.plotGrid,
    tip: {
      xLine: app.settings.plotCross,
      yLine: app.settings.plotCross
    }
  })
}
