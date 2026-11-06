import functionPlot from 'function-plot'

import { productName } from '../../../package.json'
import { math } from '../calc/calcManager.js'
import { REGEX_PLOT } from '../core/constants.js'
import { parseLocaleNumber } from '../core/formatter.js'
import { getSafeFilename } from '../core/utils.js'
import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { initStoreObject, store } from '../state/store.js'
import { modal, showError } from './dialogs.js'

let activePlotFunctions = new Set()
let lastOpenedPlotFunction = null

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
    app.plotSettings = initStoreObject('plotSettings', plotSettings.defaults)
  }
}

/**
 * Evaluates a compiled expression at x and returns a finite number or NaN.
 * @param {object} compiled Compiled Math.js expression.
 * @param {number} x X coordinate.
 * @returns {number} Evaluated numeric value or NaN.
 */
function evalAt(compiled, x) {
  try {
    const val = compiled.evaluate({ x })
    const num = typeof val?.toNumber === 'function' ? val.toNumber() : Number(val)

    return Number.isFinite(num) ? num : NaN
  } catch {
    return NaN
  }
}

/**
 * Gets the current active domain values for X and Y axes across all active expressions.
 * @param {string[]} expressions The simplified function expressions in terms of x.
 * @returns {{x: number[], y: number[]}} The X and Y axis domains.
 */
function getDomains(expressions) {
  if (app.plotSettings.domain.auto) {
    if (app.activePlot) {
      return {
        x: app.activePlot.meta.xScale.domain(),
        y: app.activePlot.meta.yScale.domain()
      }
    }

    const compiledList = expressions
      .map((expr) => {
        try {
          return math.compile(expr)
        } catch {
          return null
        }
      })
      .filter(Boolean)

    let xSpan = 10
    const linearModels = []

    for (const compiled of compiledList) {
      const y0 = evalAt(compiled, 0)
      const h = 1e-4
      const yp = evalAt(compiled, h)
      const ym = evalAt(compiled, -h)
      const d1 = Number.isFinite(yp) && Number.isFinite(ym) ? (yp - ym) / (2 * h) : NaN
      const d2 = Number.isFinite(yp) && Number.isFinite(ym) && Number.isFinite(y0) ? (yp - 2 * y0 + ym) / (h * h) : NaN

      if (Number.isFinite(y0) && Number.isFinite(d1) && Math.abs(d1) > 1e-6) {
        linearModels.push({ y0, d1 })

        if (!Number.isFinite(d2) || Math.abs(d2) < 1e-3) {
          const rootEst = Math.abs(y0 / d1)

          if (rootEst * 1.5 > xSpan && rootEst < 1e5) {
            xSpan = rootEst * 1.5
          }
        }
      }

      if (Number.isFinite(d1) && Number.isFinite(d2) && Math.abs(d2) > 1e-6) {
        const y2 = evalAt(compiled, 1)
        const ym2 = evalAt(compiled, -1)
        const d2Unit = Number.isFinite(y2) && Number.isFinite(ym2) && Number.isFinite(y0) ? y2 - 2 * y0 + ym2 : d2

        // Only treat as polynomial vertex/roots if curvature is consistent (not a high-frequency trig wave)
        if (Math.abs(d2Unit - d2) <= Math.abs(d2) * 0.25 + 1e-3) {
          const vertexX = -d1 / d2

          if (Math.abs(vertexX) * 2 > xSpan && Math.abs(vertexX) < 1e5) {
            xSpan = Math.abs(vertexX) * 2
          }

          const disc = d1 * d1 - 2 * d2 * y0

          if (disc >= 0) {
            const sqrtDisc = Math.sqrt(disc)
            const r1 = Math.abs((-d1 + sqrtDisc) / d2)
            const r2 = Math.abs((-d1 - sqrtDisc) / d2)
            const maxRoot = Math.max(r1, r2)

            if (maxRoot * 1.5 > xSpan && maxRoot < 1e5) {
              xSpan = maxRoot * 1.5
            }
          }
        }
      }
    }

    for (let i = 0; i < linearModels.length; i++) {
      for (let j = i + 1; j < linearModels.length; j++) {
        const dm = linearModels[i].d1 - linearModels[j].d1

        if (Math.abs(dm) > 1e-6) {
          const xInt = Math.abs((linearModels[j].y0 - linearModels[i].y0) / dm)

          if (xInt * 1.5 > xSpan && xInt < 1e5) {
            xSpan = xInt * 1.5
          }
        }
      }
    }

    const yValues = []
    const steps = 120

    for (const compiled of compiledList) {
      for (let i = 0; i <= steps; i++) {
        const x = -xSpan + (2 * xSpan * i) / steps
        const y = evalAt(compiled, x)

        if (Number.isFinite(y)) {
          yValues.push(y)
        }
      }
    }

    if (yValues.length === 0) {
      return {
        x: [-xSpan, xSpan],
        y: [-xSpan, xSpan]
      }
    }

    const absY = yValues.map(Math.abs).sort((a, b) => a - b)
    const p85 = absY[Math.floor(absY.length * 0.85)] || 1
    const maxAllowedAbs = Math.max(p85 * 3, 10)
    const filteredY = yValues.filter((y) => Math.abs(y) <= maxAllowedAbs)
    const activeY = filteredY.length > 0 ? filteredY : yValues

    let minY = Math.min(0, ...activeY)
    let maxY = Math.max(0, ...activeY)
    let spanY = maxY - minY

    if (spanY < 2) {
      minY -= 1
      maxY += 1
      spanY = maxY - minY
    }

    const padY = spanY * 0.15

    return {
      x: [-xSpan, xSpan],
      y: [minY - padY, maxY + padY]
    }
  }

  return {
    x: app.plotSettings.domain.x,
    y: app.plotSettings.domain.y
  }
}

/**
 * Collects all single-variable function definitions on the current page.
 * @returns {string[]} Array of function definition strings.
 */
function getPagePlotFunctions() {
  const funcs = []
  const seen = new Set()

  const lineEntries = [...app.mathScope.entries()]
    .filter(([k, v]) => /^line\d+$/.test(k) && typeof v === 'string' && REGEX_PLOT.test(v))
    .sort((a, b) => Number(a[0].slice(4)) - Number(b[0].slice(4)))

  for (const [, val] of lineEntries) {
    const trimmed = val.trim()

    if (!seen.has(trimmed)) {
      seen.add(trimmed)
      funcs.push(trimmed)
    }
  }

  if (app.plotFunction && !seen.has(app.plotFunction.trim())) {
    funcs.unshift(app.plotFunction.trim())
  }

  return funcs
}

/**
 * Normalizes a function definition (e.g. "f(t) = a * t^2") into an expression in "x".
 * @param {string} funcDef The raw function definition string.
 * @returns {string} The simplified expression in terms of x.
 */
function preparePlotExpression(funcDef) {
  const match = funcDef.match(/^\s*\w+\s*\(\s*(\w+)\s*\)\s*=/)
  const paramName = match ? match[1] : 'x'
  const plotScope = new Map()

  for (const [key, val] of app.mathScope.entries()) {
    if (key === paramName || key === 'ans' || key === '_' || key === 'now' || key === 'today') continue
    if (['function', 'page', 'object', 'datetime'].includes(app.scopeTypes?.[key])) continue

    if (typeof val === 'number') {
      plotScope.set(key, val)
    } else if (typeof val === 'string') {
      const parsedNum = resolveAxisLimit(val)

      if (Number.isFinite(parsedNum)) {
        plotScope.set(key, parsedNum)
      }
    }
  }

  const eqIdx = funcDef.indexOf('=')
  const rhs = eqIdx !== -1 ? funcDef.slice(eqIdx + 1).trim() : funcDef.trim()
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

  return f
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
 * Parses an axis domain boundary input value, supporting localized number formats.
 * @param {string|number} val Raw axis limit value.
 * @returns {number}
 */
function resolveAxisLimit(val) {
  const trimmed = String(val ?? '').trim()

  if (!trimmed) return NaN

  if (/^-?\d[\d.,\s\u00A0\u202F\u2009]*(?:e[+-]?\d+)?$/i.test(trimmed)) {
    const localeNum = parseLocaleNumber(trimmed, app.settings)

    if (Number.isFinite(localeNum)) return localeNum
  }

  return parseFloat(trimmed)
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

/**
 * Sets up user event listeners for chart interactions, zoom adjustments, export buttons, etc.
 */
function setupEventListeners() {
  const minMaxInputs = [dom.plotXMin, dom.plotXMax, dom.plotYMin, dom.plotYMax]

  dom.plotCrossModal.addEventListener('click', () => updatePlotSetting('showCross', dom.plotCrossModal.checked))
  dom.plotGridModal.addEventListener('click', () => updatePlotSetting('showGrid', dom.plotGridModal.checked))
  dom.plotDerivativeModal.addEventListener('click', () =>
    updatePlotSetting('showDerivative', dom.plotDerivativeModal.checked)
  )

  dom.exportPlot.addEventListener('click', () => {
    const svg = dom.el('.function-plot')
    if (!svg) return

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
    const [xMin, xMax, yMin, yMax] = minMaxInputs.map((input) => resolveAxisLimit(input.value))

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

/**
 * Resets the active function selection for the plot modal to the primary plot function.
 */
export function resetPlotSelection() {
  const primaryFunc = (app.plotFunction || '').trim()

  lastOpenedPlotFunction = primaryFunc
  activePlotFunctions = new Set(primaryFunc ? [primaryFunc] : [])
  app.activePlot = null
}

/**
 * Renders the interactive function plot in the plot dialog.
 */
export function plot() {
  const primaryFunc = (app.plotFunction || '').trim()

  if (primaryFunc !== lastOpenedPlotFunction) {
    lastOpenedPlotFunction = primaryFunc
    activePlotFunctions = new Set([primaryFunc])
  }

  const pageFunctions = getPagePlotFunctions()

  if (dom.plotSeriesList) {
    dom.plotSeriesList.innerHTML = ''

    for (const funcDef of pageFunctions) {
      const chip = document.createElement('button')
      const isActive = activePlotFunctions.has(funcDef)

      chip.type = 'button'
      chip.className = `plotSeriesChip${isActive ? ' active' : ''}`
      chip.textContent = funcDef
      chip.addEventListener('click', () => {
        if (activePlotFunctions.has(funcDef)) {
          if (activePlotFunctions.size > 1) {
            activePlotFunctions.delete(funcDef)
            app.activePlot = null
            plot()
          }
        } else {
          activePlotFunctions.add(funcDef)
          app.activePlot = null
          plot()
        }
      })

      dom.plotSeriesList.appendChild(chip)
    }
  }

  if (!app.activePlot) {
    dom.plot.innerHTML = ''
  }

  const selectedList = pageFunctions.filter((fn) => activePlotFunctions.has(fn))
  const activeDefs = selectedList.length > 0 ? selectedList : [primaryFunc]
  const activeExpressions = activeDefs.map(preparePlotExpression)

  const { x: xDomain, y: yDomain } = getDomains(activeExpressions)

  const compiledSeries = activeExpressions.map((expr) => {
    let compiledF = null
    let compiledDerivative = null
    let seriesDerivative = null

    try {
      compiledF = math.compile(expr)
    } catch {
      // Ignore compilation error
    }

    if (app.plotSettings.showDerivative) {
      try {
        seriesDerivative = math.derivative(expr, 'x').toString()
        compiledDerivative = math.compile(seriesDerivative)
      } catch {
        // Ignore derivative error
      }
    }

    return { compiledF, compiledDerivative, seriesDerivative, expr }
  })

  const seriesData = compiledSeries.map(({ expr, seriesDerivative }) => ({
    derivative:
      app.plotSettings.showDerivative && seriesDerivative ? { fn: seriesDerivative, updateOnMouseMove: true } : false,
    fn: expr,
    graphType: 'polyline',
    sampler: 'builtIn'
  }))

  app.activePlot = functionPlot.default({
    data: seriesData,
    grid: app.plotSettings.showGrid,
    height: dom.plot.clientHeight,
    target: '#plot',
    tip: {
      xLine: app.plotSettings.showCross,
      yLine: app.plotSettings.showCross,
      renderer: (x, y, index) => {
        const activeSeries = compiledSeries[index] || compiledSeries[0]
        const compiledF = activeSeries?.compiledF
        const compiledDerivative = activeSeries?.compiledDerivative
        const precision = app.plotSettings.domain.axisPrecision
        const xFixed = x.toFixed(precision)
        const xNum = Number(xFixed)

        let yFixed = y.toFixed(precision)

        if (compiledF) {
          const numVal = evalAt(compiledF, xNum)

          if (Number.isFinite(numVal)) {
            yFixed = numVal.toFixed(precision)
          }
        }

        let dStr = ''

        if (app.plotSettings.showDerivative && compiledDerivative) {
          const derivNum = evalAt(compiledDerivative, xNum)

          if (Number.isFinite(derivNum)) {
            dStr = ', d: ' + derivNum.toFixed(precision)
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
 * Initializes plot settings and binds plot dialog event listeners.
 */
export function setupPlot() {
  plotSettings.initialize()
  setupEventListeners()
}
