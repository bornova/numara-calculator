import { clearEvaluationCache, formulajsKeys, runCalculation } from '../core/evaluator.js'

// Lock down network and external script APIs inside the calculation worker sandbox
for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
  try {
    Object.defineProperty(self, api, { value: undefined, configurable: false, writable: false })
  } catch {
    // Ignore if property is non-configurable in environment
  }
}

self.postMessage({
  type: 'initFormulajs',
  payload: { keys: formulajsKeys }
})

self.onmessage = (event) => {
  const { type, payload } = event.data

  if (type === 'calculate') {
    const { taskId, activePage, lines, pages, settings, currencies, udf, udu, sharedBuffer } = payload

    try {
      const result = runCalculation({
        activePage,
        lines,
        pages,
        settings,
        currencies,
        udf,
        udu,
        sharedBuffer,
        onLineStart: sharedBuffer
          ? undefined
          : (lineIndex) => {
              self.postMessage({
                type: 'lineStart',
                payload: {
                  taskId,
                  lineIndex
                }
              })
            }
      })

      self.postMessage({
        type: 'calcResult',
        payload: {
          taskId,
          ...result
        }
      })
    } catch (err) {
      self.postMessage({
        type: 'calcError',
        payload: {
          taskId,
          error: String(err)
        }
      })
    }
  } else if (type === 'clearCache') {
    clearEvaluationCache()
  }
}
