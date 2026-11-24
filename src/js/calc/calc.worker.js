import { clearEvaluationCache, formulajsKeys, runCalculation, validateUdf } from '../core/evaluator.js'

const sendToMain = self.postMessage.bind(self)
const addWorkerListener = self.addEventListener.bind(self)

const BLOCKED_WORKER_APIS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'postMessage',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'caches',
  'indexedDB',
  'close',
  'openDatabase',
  'onmessage'
]
const BLOCKED_NAVIGATOR_APIS = ['sendBeacon', 'storage', 'locks', 'serviceWorker']

function disableGlobalApis(root, apis) {
  let target = root

  while (target && target !== Object.prototype) {
    for (const api of apis) {
      if (target === root || Object.hasOwn(target, api)) {
        try {
          const desc = Object.getOwnPropertyDescriptor(target, api)

          if (!desc || desc.configurable) {
            Object.defineProperty(target, api, { value: undefined, configurable: false, writable: false })
          }
        } catch {
          // Ignore if property is non-configurable in environment
        }
      }
    }

    target = Object.getPrototypeOf(target)
  }
}

// Lock down network, storage, channel, and messaging APIs across self, navigator, and their prototypes
disableGlobalApis(self, BLOCKED_WORKER_APIS)
disableGlobalApis(self.navigator, BLOCKED_NAVIGATOR_APIS)

sendToMain({
  type: 'initFormulajs',
  payload: { keys: formulajsKeys }
})

addWorkerListener('message', (event) => {
  const { type, payload } = event.data

  if (type === 'calculate') {
    const { taskId, activePage, lines, pages, settings, currencies, udf, udu, sharedBuffer } = payload

    try {
      let lastProgressPost = 0
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
              const now = performance.now()

              if (lineIndex === 0 || now - lastProgressPost >= 25) {
                lastProgressPost = now
                sendToMain({
                  type: 'lineStart',
                  payload: {
                    taskId,
                    lineIndex
                  }
                })
              }
            }
      })

      sendToMain({
        type: 'calcResult',
        payload: {
          taskId,
          ...result
        }
      })
    } catch (err) {
      sendToMain({
        type: 'calcError',
        payload: {
          taskId,
          error: String(err)
        }
      })
    }
  } else if (type === 'validateUdf') {
    const { requestId, udf } = payload || {}

    try {
      const keys = validateUdf(udf)

      sendToMain({
        type: 'validateUdfResult',
        payload: {
          requestId,
          ok: true,
          keys
        }
      })
    } catch (err) {
      sendToMain({
        type: 'validateUdfResult',
        payload: {
          requestId,
          ok: false,
          error: err?.message || String(err)
        }
      })
    }
  } else if (type === 'clearCache') {
    clearEvaluationCache()
  }
})
