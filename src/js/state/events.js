const listeners = new Map()

/**
 * Subscribes a handler to a named application event and returns an unsubscribe function.
 * @param {string} event Event name.
 * @param {Function} handler Callback invoked when the event is emitted.
 * @returns {() => void} Unsubscribe callback.
 */
export function on(event, handler) {
  let handlers = listeners.get(event)

  if (!handlers) {
    handlers = new Set()
    listeners.set(event, handlers)
  }

  handlers.add(handler)

  return () => off(event, handler)
}

/**
 * Removes a subscribed handler from a named application event.
 * @param {string} event Event name.
 * @param {Function} handler Callback to remove.
 */
export function off(event, handler) {
  const handlers = listeners.get(event)

  if (!handlers) return

  handlers.delete(handler)

  if (handlers.size === 0) {
    listeners.delete(event)
  }
}

/**
 * Synchronously invokes all handlers currently subscribed to a named event.
 * @param {string} event Event name.
 * @param {...*} args Arguments forwarded to each handler.
 */
export function emit(event, ...args) {
  const handlers = listeners.get(event)

  if (!handlers) return

  for (const handler of [...handlers]) {
    handler(...args)
  }
}

/**
 * Clears all subscribed event listeners.
 */
export function clearEvents() {
  listeners.clear()
}

export const events = { on, off, emit, clear: clearEvents }
