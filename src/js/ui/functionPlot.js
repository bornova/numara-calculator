import { dom } from '../dom'
import { math } from '../calc/calcManager'
import { getSafeFilename } from '../calc/sync'
import { modal, showError } from './dialogs'
import { app, getAppLocale, store } from '../appState'
import { parseLocaleNumber } from '../core/mathInstance'

import { applyChange, observableDiff } from '@bornova/deep-diff'

import functionPlot from 'function-plot'

import { productName } from './../../../package.json'

const plotSettings = {
  defaults: {
    domain: {
      auto: true,
      axisPrecision: 4,
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

/**
 * Gets the current active domain values for X and Y axes.
 * @param {string} f The simplified function expression in terms of x.
 * @returns {{x: number[], y: number[]}} The X and Y axis domains.
 */
function getDomains(f) {
  if (app.plotSettings.domain.auto) {
    if (app.activePlot) {
      return {
        x: app.activePlot.meta.xScale.domain(),
        y: app.activePlot.meta.yScale.domain()
      }
    }

    let domain = 10

    try {
      const evalVal = math.abs(math.evaluate(f, { x: 0 })) * 2
      const numVal = typeof evalVal?.toNumber === 'function' ? evalVal.toNumber() : Number(evalVal)

      if (Number.isFinite(numVal) && numVal > 0) {
        domain = numVal
      }
    } catch {
      domain = 10
    }

    return {
      x: [-domain, domain],
      y: [-domain, domain]
    }
  }

  return {
    x: app.plotSettings.domain.x,
    y: app.plotSettings.domain.y
  }
}

export function plot() {
  dom.plotTitle.textContent = app.plotFunction

  const match = app.plotFunction.match(/^\s*\w+\s*\(\s*(\w+)\s*\)\s*=/)
  const paramName = match ? match[1] : 'x'

  // Build a numeric scope without the parameter name so it stays symbolic for function-plot.
  // Other user variables (e.g. `a = 2` in `f(x) = a * x`) are still substituted.
  const plotScope = new Map()
  const appLocale = getAppLocale()

  for (const [key, val] of app.mathScope.entries()) {
    if (key === paramName || key === 'ans' || key === '_' || key === 'now' || key === 'today') continue
    if (['function', 'page', 'object', 'datetime'].includes(app.scopeTypes?.[key])) continue

    if (typeof val === 'number') {
      plotScope.set(key, val)
    } else if (typeof val === 'string') {
      const directNum = Number(val)

      if (Number.isFinite(directNum)) {
        plotScope.set(key, directNum)
      } else {
        const localeNum = parseLocaleNumber(val, appLocale)

        if (Number.isFinite(localeNum)) {
          plotScope.set(key, localeNum)
        }
      }
    }
  }

  const rhs = app.plotFunction.split('=')[1]
  let f = rhs

  try {
    f = math.simplify(rhs, plotScope).toString()
  } catch {
    // Keep rhs if simplification fails
  }

  if (paramName !== 'x') {
    try {
      const parsed = math.parse(f)
      const transformed = parsed.transform((node) => {
        if (node.isSymbolNode && node.name === paramName) {
          node.name = 'x'
        }

        return node
      })
      f = transformed.toString()
    } catch {
      f = f.replace(new RegExp('\\b' + paramName + '\\b', 'g'), 'x')
    }
  }

  const { x: xDomain, y: yDomain } = getDomains(f)
  let compiledF = null
  let derivative = null
  let compiledDerivative = null

  try {
    compiledF = math.compile(f)
  } catch {
    // Ignore compilation error
  }

  if (app.plotSettings.showDerivative) {
    try {
      derivative = math.derivative(f, 'x').toString()
      compiledDerivative = math.compile(derivative)
    } catch {
      // Ignore derivative error
    }
  }

  app.activePlot = functionPlot.default({
    data: [
      {
        derivative: app.plotSettings.showDerivative && derivative ? { fn: derivative, updateOnMouseMove: true } : false,
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
        const precision = app.plotSettings.domain.axisPrecision
        const xFixed = x.toFixed(precision)
        const xNum = Number(xFixed)

        let yFixed = y.toFixed(precision)

        if (compiledF) {
          try {
            const evalVal = compiledF.evaluate({ x: xNum })
            const numVal = typeof evalVal?.toNumber === 'function' ? evalVal.toNumber() : Number(evalVal)

            if (Number.isFinite(numVal)) {
              yFixed = numVal.toFixed(precision)
            }
          } catch {
            // Fall back to function-plot's y value
          }
        }

        let dStr = ''

        if (app.plotSettings.showDerivative && compiledDerivative) {
          try {
            const derivVal = compiledDerivative.evaluate({ x: xNum })
            const derivNum = typeof derivVal?.toNumber === 'function' ? derivVal.toNumber() : Number(derivVal)

            if (Number.isFinite(derivNum)) {
              dStr = ', d: ' + derivNum.toFixed(precision)
            }
          } catch {
            // Ignore non-finite derivative at x
          }
        }

        return ` x: ${xFixed}, y: ${yFixed}${dStr}`
      }
    },
    width: dom.plot.clientWidth,
    xAxis: { domain: xDomain },
    yAxis: { domain: yDomain }
  })
}

/**
 * Updates a specific plot configuration setting and triggers a redrawing.
 * @param {string} setting The setting key.
 * @param {*} value The new setting value.
 */
function updatePlotSetting(setting, value) {
  app.plotSettings[setting] = value
  store.set('plotSettings', app.plotSettings)
  plot()
}

/**
 * Validates the plot boundary domains ensuring they are numbers and valid ranges.
 * @param {number} xMin Minimum X axis boundary.
 * @param {number} xMax Maximum X axis boundary.
 * @param {number} yMin Minimum Y axis boundary.
 * @param {number} yMax Maximum Y axis boundary.
 * @returns {boolean} True if the domains are valid.
 */
function validateDomain(xMin, xMax, yMin, yMax) {
  return !isNaN(xMin) && !isNaN(xMax) && !isNaN(yMin) && !isNaN(yMax) && xMin < xMax && yMin < yMax
}

/**
 * Resets the plot zoom and domain state, redrawing from scratch.
 */
function resetPlot() {
  app.activePlot = null
  plot()
}

const minMaxInputs = [dom.plotXMin, dom.plotXMax, dom.plotYMin, dom.plotYMax]

/**
 * Sets up user event listeners for chart interactions, zoom adjustments, export buttons, etc.
 */
function setupEventListeners() {
  dom.plotCrossModal.addEventListener('click', () => updatePlotSetting('showCross', dom.plotCrossModal.checked))
  dom.plotGridModal.addEventListener('click', () => updatePlotSetting('showGrid', dom.plotGridModal.checked))
  dom.plotDerivativeModal.addEventListener('click', () =>
    updatePlotSetting('showDerivative', dom.plotDerivativeModal.checked)
  )

  dom.exportPlot.addEventListener('click', () => {
    const svg = dom.el('.function-plot')
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const fileName = `${getSafeFilename(`${productName} Plot ${app.plotFunction}`)}.svg`
    const preface = '<?xml version="1.0" standalone="no"?>\r\n'
    const svgBlob = new Blob([preface, svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
    const downloadLink = document.createElement('a')
    const objectUrl = URL.createObjectURL(svgBlob)

    downloadLink.href = objectUrl
    downloadLink.download = fileName
    downloadLink.click()

    setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
  })

  dom.axisSettingsButton.addEventListener('click', () => modal.show(dom.dialogPlotAxisSettings))

  dom.resetPlot.addEventListener('click', resetPlot)

  dom.dialogPlotAxisSettingsSave.addEventListener('click', () => {
    const isAutoDomain = dom.plotAutoDomain.checked
    const [xMin, xMax, yMin, yMax] = minMaxInputs.map((input) => parseFloat(input.value))

    // Skip domain validation if Auto Domain is checked
    if (!isAutoDomain && !validateDomain(xMin, xMax, yMin, yMax)) {
      showError(
        'Invalid Domain',
        'Please ensure all fields contain valid numbers and that the minimum values are less than the maximum values.'
      )
      return
    }

    app.plotSettings.domain.axisPrecision = parseFloat(dom.plotAxisPrecision.value)
    app.plotSettings.domain.auto = isAutoDomain
    app.plotSettings.domain.x = [xMin, xMax]
    app.plotSettings.domain.y = [yMin, yMax]

    store.set('plotSettings', app.plotSettings)
    modal.hide(dom.dialogPlotAxisSettings)
    resetPlot()
  })

  dom.plotAxisPrecision.addEventListener('input', () => {
    dom.plotAxisPrecisionLabel.textContent = dom.plotAxisPrecision.value
  })

  dom.plotAutoDomain.addEventListener('change', () => {
    const isAutoDomain = dom.plotAutoDomain.checked

    minMaxInputs.forEach((input) => (input.disabled = isAutoDomain))
  })

  dom.defaultDomainsButton.addEventListener('click', () => {
    const { auto, x, y, axisPrecision } = plotSettings.defaults.domain

    dom.plotAxisPrecision.value = axisPrecision
    dom.plotAxisPrecisionLabel.textContent = axisPrecision
    dom.plotAutoDomain.checked = auto
    dom.plotAutoDomain.dispatchEvent(new Event('change'))

    minMaxInputs.forEach((input, i) => (input.value = [...x, ...y][i]))
  })

  window.addEventListener('resize', () => {
    if (app.activePlot && dom.dialogPlot.classList.contains('uk-open')) {
      plot()
    }
  })
}

plotSettings.initialize()
setupEventListeners()
