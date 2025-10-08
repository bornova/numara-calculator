import { dom } from './dom'
import { calculate, math } from './eval'
import { modal, showError } from './modal'
import { app, checkSize, store } from './utils'

import { productName } from './../../package.json'

import { applyChange, observableDiff } from 'deep-diff-esm'

import functionPlot from 'function-plot'

const plotSettings = {
  defaults: {
    domain: {
      auto: true,
      xPrecision: 4,
      x: [-10, 10],
      y: [-10, 10]
    },
    showCross: false,
    showDerivative: false,
    showGrid: false
  },
  initialize: () => {
    app.plotSettings = store.get('plotSettings')

    if (app.plotSettings) {
      observableDiff(app.plotSettings, plotSettings.defaults, (diff) => {
        if (diff.kind === 'E') return

        applyChange(app.plotSettings, plotSettings.defaults, diff)
        store.set('plotSettings', app.plotSettings)
      })
    } else {
      app.plotSettings = { ...plotSettings.defaults }
      store.set('plotSettings', app.plotSettings)
    }
  }
}

function getDomains() {
  if (app.plotSettings.domain.auto) {
    let domain = math.abs(math.evaluate(app.plotFunction.split('=')[1], { x: 0 })) * 2

    if (!isFinite(domain) || domain === 0) domain = 10

    return {
      x: app.activePlot ? app.activePlot.meta.xScale.domain() : [-domain, domain],
      y: app.activePlot ? app.activePlot.meta.yScale.domain() : [-domain, domain]
    }
  }

  return {
    x: app.plotSettings.domain.x,
    y: app.plotSettings.domain.y
  }
}

export function plot() {
  dom.plotTitle.innerHTML = app.plotFunction

  const f = math.simplify(app.plotFunction.split('=')[1], app.mathScope).toString()
  const { x: xDomain, y: yDomain } = getDomains()
  const derivative = math.derivative(f, 'x').toString()

  app.activePlot = functionPlot.default({
    data: [
      {
        derivative: app.plotSettings.showDerivative ? { fn: derivative, updateOnMouseMove: true } : false,
        fn: f,
        graphType: 'polyline',
        sampler: 'builtIn'
      }
    ],
    grid: app.plotSettings.showGrid,
    height: dom.plot.clientHeight,
    target: '#plot',
    tip: {
      xLine: app.plotSettings.showCross,
      yLine: app.plotSettings.showCross,
      renderer: (x, y) => {
        x = x.toFixed(app.plotSettings.domain.xPrecision)
        y = math.evaluate(f, { x }).toFixed(app.settings.precision)

        return ` x: ${x}, y: ${y}
          ${
            app.plotSettings.showDerivative
              ? ', d: ' + math.evaluate(derivative, { x }).toFixed(app.settings.precision)
              : ''
          }`
      }
    },
    width: dom.plot.clientWidth,
    xAxis: { domain: xDomain },
    yAxis: { domain: yDomain }
  })
}

function updatePlotSetting(setting, value) {
  app.plotSettings[setting] = value
  store.set('plotSettings', app.plotSettings)
  plot()
}

function validateDomain(xMin, xMax, yMin, yMax) {
  return !isNaN(xMin) && !isNaN(xMax) && !isNaN(yMin) && !isNaN(yMax) && xMin < xMax && yMin < yMax
}

function resetPlot() {
  app.activePlot = null
  plot()
}

function setupEventListeners() {
  dom.plotCrossModal.addEventListener('click', () => updatePlotSetting('showCross', dom.plotCrossModal.checked))
  dom.plotGridModal.addEventListener('click', () => updatePlotSetting('showGrid', dom.plotGridModal.checked))
  dom.plotDerivativeModal.addEventListener('click', () =>
    updatePlotSetting('showDerivative', dom.plotDerivativeModal.checked)
  )

  dom.plotXPrecision.addEventListener('input', () => {
    dom.plotXPrecisionLabel.innerHTML = dom.plotXPrecision.value
  })

  dom.exportPlot.addEventListener('click', () => {
    const svg = dom.el('.function-plot')
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const fileName = `${productName} Plot ${app.plotFunction}`
    const preface = '<?xml version="1.0" standalone="no"?>\r\n'
    const svgBlob = new Blob([preface, svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
    const downloadLink = document.createElement('a')
    downloadLink.href = URL.createObjectURL(svgBlob)
    downloadLink.download = fileName
    downloadLink.click()
    setTimeout(() => URL.revokeObjectURL(downloadLink.href), 60000)
  })

  dom.axisSettingsButton.addEventListener('click', () => modal.show(dom.dialogPlotAxisSettings))

  dom.resetPlot.addEventListener('click', resetPlot)

  dom.dialogPlotAxisSettingsSave.addEventListener('click', () => {
    const isAutoDomain = dom.plotAutoDomain.checked
    const xMin = parseFloat(dom.plotXMin.value)
    const xMax = parseFloat(dom.plotXMax.value)
    const yMin = parseFloat(dom.plotYMin.value)
    const yMax = parseFloat(dom.plotYMax.value)

    if (!validateDomain(xMin, xMax, yMin, yMax)) {
      showError(
        'Invalid Domain',
        'Please ensure all fields contain valid numbers and that the minimum values are less than the maximum values.'
      )
      return
    }

    app.plotSettings.domain.xPrecision = parseFloat(dom.plotXPrecision.value)
    app.plotSettings.domain.auto = isAutoDomain
    app.plotSettings.domain.x = [xMin, xMax]
    app.plotSettings.domain.y = [yMin, yMax]

    store.set('plotSettings', app.plotSettings)
    modal.hide(dom.dialogPlotAxisSettings)
    resetPlot()
  })

  dom.plotAutoDomain.addEventListener('change', () => {
    const isAutoDomain = dom.plotAutoDomain.checked

    dom.plotXMin.disabled = isAutoDomain
    dom.plotXMax.disabled = isAutoDomain
    dom.plotYMin.disabled = isAutoDomain
    dom.plotYMax.disabled = isAutoDomain
  })

  dom.defaultDomainsButton.addEventListener('click', () => {
    dom.plotXPrecision.value = plotSettings.defaults.domain.xPrecision
    dom.plotAutoDomain.checked = true
    dom.plotAutoDomain.dispatchEvent(new Event('change'))
    dom.plotXPrecision.dispatchEvent(new Event('input'))
    dom.plotXMin.value = plotSettings.defaults.domain.x[0]
    dom.plotXMax.value = plotSettings.defaults.domain.x[1]
    dom.plotYMin.value = plotSettings.defaults.domain.y[0]
    dom.plotYMax.value = plotSettings.defaults.domain.y[1]
  })

  let windowResizeDelay
  window.addEventListener('resize', () => {
    if (app.activePlot && dom.dialogPlot.classList.contains('uk-open')) plot()
    clearTimeout(windowResizeDelay)
    windowResizeDelay = setTimeout(calculate, 10)
    checkSize()
  })
}

plotSettings.initialize()
setupEventListeners()
