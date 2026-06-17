import { applyUdfu, clearEvaluationCache, runCalculation } from '../core/evalCore'

self.onmessage = (event) => {
  const { type, payload } = event.data

  if (type === 'initUdfu') {
    const { udf, udu } = payload

    if (typeof udf === 'string') {
      applyUdfu(true, udf)
    }

    if (typeof udu === 'string') {
      applyUdfu(false, udu)
    }
  } else if (type === 'calculate') {
    const { taskId, activePage, lines, settings, currencies, udf, udu, sharedBuffer, timedOutLines } = payload

    if (typeof udf === 'string') {
      applyUdfu(true, udf)
    }

    if (typeof udu === 'string') {
      applyUdfu(false, udu)
    }

    try {
      const result = runCalculation({
        activePage,
        lines,
        settings,
        currencies,
        sharedBuffer,
        timedOutLines,
        onLineStart: (lineIndex) => {
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
