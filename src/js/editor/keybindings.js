/*!
 * Forked from https://github.com/jamiebuilds/tinykeys
 * Copyright (c) 2020 Jamie Kyle
 */

/**
 * These are the modifier keys that change the meaning of keybindings.
 *
 * Note: Ignoring "AltGraph" because it is covered by the others.
 */
const KEYBINDING_MODIFIER_KEYS = ['Shift', 'Meta', 'Alt', 'Control']

/**
 * Keybinding sequences should timeout if individual key presses are more than
 * 1s apart by default.
 */
const DEFAULT_TIMEOUT = 1000

/**
 * Keybinding sequences should bind to this event by default.
 */
const DEFAULT_EVENT = 'keydown'

/**
 * Platform detection code.
 */
const PLATFORM = typeof navigator === 'object' ? (navigator.userAgentData?.platform ?? navigator.platform) : ''
const APPLE_DEVICE = /Mac|iPod|iPhone|iPad/.test(PLATFORM)

/**
 * An alias for creating platform-specific keybinding aliases.
 */
const MOD = APPLE_DEVICE ? 'Meta' : 'Control'

/**
 * Meaning of `AltGraph`, from MDN:
 * - Windows: Both Alt and Ctrl keys are pressed, or AltGr key is pressed
 * - Mac: ⌥ Option key pressed
 * - Linux: Level 3 Shift key (or Level 5 Shift key) pressed
 * - Android: Not supported
 */
const ALT_GRAPH_ALIASES = PLATFORM === 'Win32' ? ['Control', 'Alt'] : APPLE_DEVICE ? ['Alt'] : []

/**
 * There's a bug in Chrome that causes event.getModifierState not to exist on
 * KeyboardEvent's for F1/F2/etc keys.
 * @param {KeyboardEvent} event
 * @param {string} mod - Modifier key name (e.g. "Shift", "Control")
 * @returns {boolean}
 */
function getModifierState(event, mod) {
  return typeof event.getModifierState === 'function'
    ? event.getModifierState(mod) || (ALT_GRAPH_ALIASES.includes(mod) && event.getModifierState('AltGraph'))
    : false
}

/**
 * Parses a "Key Binding String" into its parts
 *
 * grammar    = `<sequence>`
 * <sequence> = `<press> <press> <press> ...`
 * <press>    = `<key>` or `<mods>+<key>`
 * <mods>     = `<mod>+<mod>+...`
 * <key>      = `<KeyboardEvent.key>` or `<KeyboardEvent.code>` (case-insensitive)
 * <key>      = `(<regex>)` -> `/^(?:<regex>)$/` (case-insensitive)
 * @param {string} str - The keybinding string to parse
 * @returns {Array<[string[], string|RegExp]>} Array of [modifiers, key] pairs
 */
export function parseKeybinding(str) {
  return str
    .trim()
    .split(' ')
    .map((press) => {
      let mods = press.split(/\b\+/)
      let key = mods.pop()
      let match = key.match(/^\((.+)\)$/)

      if (match) key = new RegExp(`^(?:${match[1]})$`, 'iv')

      mods = mods.map((mod) => (mod === '$mod' ? MOD : mod))

      return [mods, key]
    })
}

/**
 * This tells us if a single keyboard event matches a single keybinding press.
 * @param {KeyboardEvent} event
 * @param {[string[], string|RegExp]} press - A [modifiers, key] pair from {@link parseKeybinding}
 * @returns {boolean}
 */
export function matchKeyBindingPress(event, [mods, key]) {
  return !(
    // Allow either the `event.key` or the `event.code`
    // MDN event.key: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
    // MDN event.code: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
    (
      (key instanceof RegExp
        ? !(key.test(event.key) || key.test(event.code))
        : key.toUpperCase() !== event.key.toUpperCase() && key !== event.code) ||
      // Ensure all the modifiers in the keybinding are pressed.
      mods.some((mod) => !getModifierState(event, mod)) ||
      // KEYBINDING_MODIFIER_KEYS (Shift/Control/etc) change the meaning of a
      // keybinding. So if they are pressed but aren't part of the current
      // keybinding press, then we don't have a match.
      KEYBINDING_MODIFIER_KEYS.some((mod) => !mods.includes(mod) && key !== mod && getModifierState(event, mod))
    )
  )
}

/**
 * Creates an event listener for handling keybindings.
 *
 * @example
 * ```js
 * import { createKeybindingsHandler } from "../src/keybindings"
 *
 * let handler = createKeybindingsHandler({
 * 	"Shift+d": () => {
 * 		alert("The 'Shift' and 'd' keys were pressed at the same time")
 * 	},
 * 	"y e e t": () => {
 * 		alert("The keys 'y', 'e', 'e', and 't' were pressed in order")
 * 	},
 * 	"$mod+d": () => {
 * 		alert("Either 'Control+d' or 'Meta+d' were pressed")
 * 	},
 * })
 *
 * window.addEventListener("keydown", handler)
 * ```
 * @param {Object} keyBindingMap - Map of keybinding strings to event handler callbacks
 * @param {Object} [options={}]
 * @param {number} [options.timeout] - ms to wait between key presses before cancelling a sequence (default: 1000)
 * @returns {EventListener}
 */
export function createKeybindingsHandler(keyBindingMap, options = {}) {
  const keyBindings = Object.keys(keyBindingMap).map((key) => [parseKeybinding(key), keyBindingMap[key]])
  const possibleMatches = new Map()
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  let timer = null

  const handler = (event) => {
    // Ensure and stop any event that isn't a full keyboard event.
    // Autocomplete option navigation and selection would fire a instanceof Event,
    // instead of the expected KeyboardEvent
    if (!(event instanceof KeyboardEvent)) return

    keyBindings.forEach(([sequence, callback]) => {
      let prev = possibleMatches.get(sequence)
      let remainingExpectedPresses = prev ? prev : sequence
      let currentExpectedPress = remainingExpectedPresses[0]
      let matches = matchKeyBindingPress(event, currentExpectedPress)

      if (!matches) {
        // Modifier keydown events shouldn't break sequences
        // Note: This works because:
        // - non-modifiers will always return false
        // - if the current keypress is a modifier then it will return true when we check its state
        // MDN: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState
        if (!getModifierState(event, event.key)) {
          possibleMatches.delete(sequence)
        }
      } else if (remainingExpectedPresses.length > 1) {
        possibleMatches.set(sequence, remainingExpectedPresses.slice(1))
      } else {
        possibleMatches.delete(sequence)
        callback(event)
      }
    })

    if (timer) clearTimeout(timer)

    timer = setTimeout(possibleMatches.clear.bind(possibleMatches), timeout)
  }

  handler.cleanup = () => {
    if (timer) clearTimeout(timer)
  }

  return handler
}

/**
 * Subscribes to keybindings.
 *
 * Returns an unsubscribe method.
 *
 * @param {Window|HTMLElement} target - The element to listen for key events on
 * @param {Object} keyBindingMap - Map of keybinding strings to event handler callbacks
 * @param {Object} [options={}]
 * @param {string} [options.event="keydown"] - The event type to listen for
 * @param {boolean} [options.capture] - Whether to use a capture listener
 * @param {number} [options.timeout] - ms to wait between key presses before cancelling a sequence
 * @returns {() => void} Unsubscribe function
 */
export function numaraKeys(target, keyBindingMap, { event = DEFAULT_EVENT, capture, timeout } = {}) {
  const onKeyEvent = createKeybindingsHandler(keyBindingMap, { timeout })

  target.addEventListener(event, onKeyEvent, capture)

  return () => {
    target.removeEventListener(event, onKeyEvent, capture)

    onKeyEvent.cleanup()
  }
}
