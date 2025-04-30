import { app, store } from './common'
import { dom } from './dom'
import { generateIcons } from './icons'
import { confirm, modal } from './modal'
import { getTheme } from './utils'

import Coloris from '@melloware/coloris'
import DeepDiff from 'deep-diff'

const BORDER_LIGHT = '1px solid #eaeaea'
const BORDER_DARK = '1px solid #666666'
const BORDER_CHANGED = '2px solid #dd9359'

const COLOR_INPUT_SELECTOR = '.colorInput'
const colorInputs = dom.els(COLOR_INPUT_SELECTOR)

/** Check for color schema changes. */
function checkDefaultColors() {
  const storedColors = store.get('colors')

  app.colors = storedColors

  DeepDiff.observableDiff(app.colors, colors.defaults, (d) => {
    if (d.kind !== 'E') {
      DeepDiff.applyChange(app.colors, colors.defaults, d)

      store.set('colors', app.colors)
    }
  })
}

/**
 * Check if color has changed.
 * Highlights changed color pickers.
 */
export function checkColorChange() {
  const theme = getTheme()

  colorInputs.forEach((picker) => {
    const def = colors.defaults?.[picker.dataset.class]?.[picker.dataset.theme]
    const isSame = picker.value === def

    picker.style.borderLeft = isSame ? (theme === 'light' ? BORDER_LIGHT : BORDER_DARK) : BORDER_CHANGED
  })
}

let activePicker = null

export const colors = {
  defaults: {
    answer: { title: 'Answers', class: '.output', dark: '#1eb5f0', light: '#17586b' },
    comment: { title: 'Comments', class: '.cm-comment', dark: '#5a5a5a', light: '#bebebe' },
    constant: { title: 'Constants', class: '.cm-constant', dark: '#39baa0', light: '#2c917d' },
    currency: { title: 'Currencies', class: '.cm-currency', dark: '#009688', light: '#009688' },
    error: {
      title: 'Errors',
      class: '.lineError, .lineError:hover, .lineError > div, .lineNoError > div',
      dark: '#d41111',
      light: '#b10e0e'
    },
    excel: { title: 'Excel', class: '.cm-excel', dark: '#3cc383', light: '#197b43' },
    function: { title: 'Functions', class: '.cm-formulajs, .cm-function, .cm-udf', dark: '#cb82f5', light: '#6f42c1' },
    keyword: { title: 'Keywords', class: '.cm-keyword, .cm-lineNo', dark: '#be6317', light: '#be6317' },
    number: { title: 'Numbers', class: '.cm-number', dark: '#e6e6e6', light: '#333333' },
    operator: { title: 'Operators', class: '.cm-operator', dark: '#bbbbbb', light: '#888888' },
    text: { title: 'Text', class: '.cm-text', dark: '#e6e6e6', light: '#333333' },
    unit: { title: 'Units', class: '.cm-unit, .cm-udu', dark: '#4d87c9', light: '#005cc5' },
    variable: { title: 'Variables', class: '.cm-variable', dark: '#96b4c4', light: '#57707c' }
  },

  /**
   * Initialize color pickers and listeners.
   */
  initialize: () => {
    const storedColors = store.get('colors')

    if (storedColors) {
      checkDefaultColors()
    } else {
      store.set('colors', colors.defaults)
    }

    app.colors = store.get('colors')

    colorInputs.forEach((picker) => {
      const def = app.colors?.[picker.dataset.class]?.[picker.dataset.theme]

      if (def) {
        picker.value = def
      }

      picker.addEventListener('click', (event) => {
        activePicker = event.target

        checkColorChange()
      })
    })

    Coloris.init()

    Coloris({
      el: COLOR_INPUT_SELECTOR,
      parent: '#dialogTheme',
      alpha: false,
      onChange: () => {
        checkColorChange()
        colors.save()
      }
    })

    Coloris.ready(() => {
      const picker = dom.el('#clr-color-value')

      if (!picker) return

      const button = document.createElement('a')

      picker.after(button)
      button.setAttribute('title', 'Reset color')
      button.classList.add('clr-custom-reset')
      button.innerHTML = '<i data-lucide="rotate-ccw"></i>'
      button.addEventListener('click', () => {
        resetActivePickerColor()
        checkColorChange()
        colors.save()
      })
      generateIcons()
    })
  },

  /**
   * Apply current colors to the DOM.
   */
  apply: () => {
    const appTheme = getTheme()
    let colorSheet = ''

    app.colors = store.get('colors')

    Object.values(app.colors).forEach((color) => {
      colorSheet += `${color.class} { color: ${color[appTheme]}; }\n`
    })

    dom.colorSheet.innerHTML = colorSheet
  },

  /**
   * Save current color values from pickers to store.
   */
  save: () => {
    colorInputs.forEach((picker) => {
      if (app.colors?.[picker.dataset.class]) {
        app.colors[picker.dataset.class][picker.dataset.theme] = picker.value
      }
    })

    store.set('colors', app.colors)
    colors.apply()
  },

  /**
   * Reset all colors to defaults.
   */
  reset: () => {
    store.set('colors', colors.defaults)
    app.colors = store.get('colors')

    colorInputs.forEach((picker) => {
      const def = colors.defaults?.[picker.dataset.class]?.[picker.dataset.theme]

      if (def) {
        picker.value = def
      }

      picker.dispatchEvent(new Event('input', { bubbles: true }))
    })

    checkColorChange()
    colors.apply()
  }
}

/**
 * Reset the active color picker to its default value.
 */
function resetActivePickerColor() {
  if (!activePicker) return

  const def = colors.defaults?.[activePicker.dataset.class]?.[activePicker.dataset.theme]

  if (!def) return

  activePicker.dispatchEvent(new Event('input', { bubbles: true }))

  dom.el('#clr-color-value').value = def
  dom.el('#clr-color-value').dispatchEvent(new Event('change'))
}

dom.customizeThemeButton?.addEventListener('click', () => {
  modal.show('#dialogTheme')
})

dom.resetColorsButton?.addEventListener('click', () => {
  confirm('This will reset all colors to their default values', () => {
    colors.reset()
  })
})
