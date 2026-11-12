import { applyChange, observableDiff } from '@bornova/deep-diff'

let cachedConsolidatedRaw = null
let cachedConsolidatedObj = null

/**
 * Retrieves and parses the consolidated `numara` storage object from localStorage.
 * @returns {object|null}
 */
function getConsolidatedStore() {
  const raw = localStorage.getItem('numara')

  if (!raw) {
    cachedConsolidatedRaw = null
    cachedConsolidatedObj = null
    return null
  }

  if (raw !== cachedConsolidatedRaw || !cachedConsolidatedObj) {
    try {
      cachedConsolidatedObj = JSON.parse(raw)
      cachedConsolidatedRaw = raw
    } catch (error) {
      console.error('Error parsing consolidated local storage, backing up corrupted data:', error)

      try {
        localStorage.setItem(`numara_corrupt_${Date.now()}`, raw)
        localStorage.removeItem('numara')
      } catch {
        // Ignore storage errors during backup
      }

      cachedConsolidatedRaw = null
      cachedConsolidatedObj = null
      return null
    }
  }

  return cachedConsolidatedObj
}

/**
 * Serializes and saves the consolidated `numara` storage object to localStorage.
 * @param {object} obj The consolidated storage object.
 */
function saveConsolidatedStore(obj) {
  const raw = JSON.stringify(obj)

  localStorage.setItem('numara', raw)
  cachedConsolidatedRaw = raw
  cachedConsolidatedObj = obj
}

/**
 * Local storage persistence wrapper.
 */
export const store = {
  /**
   * Get value from local storage.
   * @param {string} key The key of the item to retrieve.
   * @returns {any} The parsed value from local storage.
   */
  get: (key) => {
    try {
      const obj = getConsolidatedStore()

      if (obj && obj[key] !== undefined) {
        const val = obj[key]

        return val !== null && typeof val === 'object' ? structuredClone(val) : val
      }

      const rootItem = localStorage.getItem(key)

      if (rootItem) {
        const parsed = JSON.parse(rootItem)

        if (store.set(key, parsed)) {
          localStorage.removeItem(key)
        }

        return parsed
      }

      return null
    } catch (error) {
      console.error(`Error parsing local storage for key "${key}":`, error)

      return null
    }
  },

  /**
   * Save value to local storage.
   * @param {string} key The key under which to store the value.
   * @param {any} value The value to store.
   * @returns {boolean} True if saved successfully, false otherwise.
   */
  set: (key, value) => {
    try {
      const obj = getConsolidatedStore() || {}

      obj[key] = value !== null && typeof value === 'object' ? structuredClone(value) : value
      saveConsolidatedStore(obj)

      return true
    } catch (error) {
      console.error(`Error writing key "${key}" to local storage:`, error)

      return false
    }
  },

  /**
   * Remove value from local storage.
   * @param {string} key The key of the item to remove.
   */
  remove: (key) => {
    try {
      localStorage.removeItem(key)

      const obj = getConsolidatedStore()

      if (obj && key in obj) {
        delete obj[key]
        saveConsolidatedStore(obj)
      }
    } catch (error) {
      console.error(`Error removing key "${key}" from local storage:`, error)
    }
  }
}

/**
 * Loads an object from `store` and merges any missing default keys via `observableDiff`,
 * or initializes it with a deep clone of `defaults` if not yet stored.
 * @param {string} key Store key.
 * @param {object} defaults Default object template.
 * @param {(val: object) => void} [onExisting] Optional hook called before diffing when stored data exists.
 * @returns {object} The initialized store object.
 */
export function initStoreObject(key, defaults, onExisting) {
  let value = store.get(key)

  if (value) {
    let changed = Boolean(onExisting?.(value))

    observableDiff(value, defaults, (diff) => {
      if (diff.kind === 'E') return

      applyChange(value, defaults, diff)
      changed = true
    })

    if (changed) {
      store.set(key, value)
    }
  } else {
    value = structuredClone(defaults)
    store.set(key, value)
  }

  return value
}
