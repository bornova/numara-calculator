/*!
 * Adapted from https://github.com/jamiebuilds/tinykeys
 * Copyright (c) 2020 Jamie Kyle
 */

const KEYBINDING_MODIFIER_KEYS = ['Shift', 'Meta', 'Alt', 'Control']
const PLATFORM = typeof navigator === 'object' ? (navigator.userAgentData?.platform ?? navigator.platform) : ''
const APPLE_DEVICE = /Mac|iPod|iPhone|iPad/.test(PLATFORM)
const MOD = APPLE_DEVICE ? 'Meta' : 'Control'
const ALT_GRAPH_ALIASES = /^Win/i.test(PLATFORM) ? ['Control', 'Alt'] : APPLE_DEVICE ? ['Alt'] : []

/**
 * Safe check for modifier state on KeyboardEvent.
 * @param {KeyboardEvent} event
 * @param {string} mod Modifier key name (e.g. "Shift", "Control")
 * @returns {boolean}
 */
function getModifierState(event, mod) {
  return typeof event.getModifierState === 'function'
    ? event.getModifierState(mod) || (ALT_GRAPH_ALIASES.includes(mod) && event.getModifierState('AltGraph'))
    : false
}

/**
 * Parses a keybinding string (e.g. "$mod+D" or "Shift+TAB") into [modifiers, key].
 * @param {string} str The keybinding string to parse
 * @returns {[string[], string]} Pair of [modifiers, key]
 */
function parseKeybinding(str) {
  const mods = str.trim().split(/\b\+/)
  const key = mods.pop()

  return [mods.map((mod) => (mod === '$mod' ? MOD : mod)), key]
}

/**
 * Checks if a KeyboardEvent matches a parsed [modifiers, key] binding.
 * @param {KeyboardEvent} event
 * @param {[string[], string]} press
 * @returns {boolean}
 */
function matchKeyBindingPress(event, [mods, key]) {
  return !(
    (key.toUpperCase() !== event.key.toUpperCase() && key !== event.code) ||
    mods.some((mod) => !getModifierState(event, mod)) ||
    KEYBINDING_MODIFIER_KEYS.some((mod) => !mods.includes(mod) && key !== mod && getModifierState(event, mod))
  )
}

/**
 * Subscribes to single-chord keybindings on a target.
 * @param {Window|HTMLElement} target The element to listen for key events on
 * @param {Object} keyBindingMap Map of keybinding strings to event handler callbacks
 */
export function numaraKeys(target, keyBindingMap) {
  const keyBindings = Object.entries(keyBindingMap).map(([key, callback]) => [parseKeybinding(key), callback])

  target.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return

    for (const [press, callback] of keyBindings) {
      if (matchKeyBindingPress(event, press)) {
        callback(event)
      }
    }
  })
}
