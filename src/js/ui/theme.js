import ColorPicker from '@bornova/colorpicker'
import { diff } from '@bornova/deep-diff'

import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { migrateColors } from '../state/migration.js'
import { initStoreObject, store } from '../state/store.js'
import { confirm, modal } from './dialogs.js'

const COLOR_INPUT_SELECTOR = '.colorInput'

let colorInputs = []
let activePicker = null

/**
 * Renders a single light/dark color-picker row for a syntax token category.
 * @param {string} key Token key in `colors.defaults`.
 * @param {string} title Human-readable row label.
 * @returns {string}
 */
function renderColorRow(key, title) {
  return `
    <div class="uk-flex uk-flex-middle uk-child-width-expand">
      <div class="uk-text-right">${title}</div>
      <div><input name="color" data-class="${key}" data-theme="light" class="colorInput" readonly /></div>
      <div><input name="color" data-class="${key}" data-theme="dark" class="colorInput" readonly /></div>
    </div>`
}

/**
 * Resets the currently active color picker back to its default color value.
 */
function resetActivePickerColor() {
  if (!activePicker) return

  const colorInput = dom.el('#clr-color-value')

  colorInput.value = colors.defaults[activePicker.dataset.class][activePicker.dataset.theme]
  colorInput.dispatchEvent(new Event('change'))
  activePicker.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Toggles changed indicator classes on each color picker input based on default colors.
 */
export function checkColorChange() {
  colorInputs.forEach((picker) => {
    const isSame = picker.value === colors.defaults[picker.dataset.class][picker.dataset.theme]

    picker.classList.toggle('colorInputChanged', !isSame)
  })
}

export const colors = {
  defaults: {
    answer: { title: 'Answers', class: '.answer', dark: '#1eb5f0', light: '#17586b' },
    comment: { title: 'Comments', class: '.cm-comment', dark: '#727272', light: '#bebebe' },
    constant: { title: 'Constants', class: '.cm-constant', dark: '#39baa0', light: '#2c917d' },
    currency: { title: 'Currencies', class: '.cm-currency', dark: '#009688', light: '#009688' },
    error: {
      title: 'Errors',
      class: '.lineError, .lineError:hover, .lineError > div, .lineNoError > div',
      dark: '#d41111',
      light: '#b10e0e'
    },
    excel: { title: 'Excel', class: '.cm-excel', dark: '#3cc383', light: '#197b43' },
    function: {
      title: 'Functions',
      class: '.cm-formulajs, .cm-function, .cm-nerdamer, .cm-udf, .cm-datetime',
      dark: '#cb82f5',
      light: '#6f42c1'
    },
    keyword: { title: 'Keywords', class: '.cm-keyword, .cm-lineNo', dark: '#e78c3f', light: '#be6317' },
    number: { title: 'Numbers', class: '.cm-number', dark: '#e6e6e6', light: '#333333' },
    text: { title: 'Text', class: '.cm-text', dark: '#e6e6e6', light: '#333333' },
    operator: { title: 'Operators', class: '.cm-operator', dark: '#bbbbbb', light: '#888888' },
    unit: { title: 'Units', class: '.cm-unit, .cm-udu', dark: '#6b9cd3', light: '#005cc5' },
    variable: { title: 'Variables', class: '.cm-variable', dark: '#96b4c4', light: '#57707c' },
    plain: { title: 'Plain', class: '.cm-plain, .answer, .lineError', dark: '#e6e6e6', light: '#333333' }
  },

  /**
   * Initializes theme styling, deep-diff defaults checks, picker events, and confirm actions.
   */
  initialize: () => {
    app.colors = initStoreObject('colors', colors.defaults, (stored) => migrateColors(stored, colors.defaults))

    const container = dom.el('.colorPickerContainer')

    if (container) {
      const syntaxRows = Object.entries(colors.defaults)
        .filter(([key]) => key !== 'plain')
        .map(([key, { title }]) => renderColorRow(key, title))
        .join('')

      container.innerHTML = `${syntaxRows}<div class="colorHR uk-text-secondary uk-margin-small">No syntax</div>${renderColorRow('plain', colors.defaults.plain.title)}`
    }

    colorInputs = dom.els(COLOR_INPUT_SELECTOR)

    colorInputs.forEach((picker) => {
      picker.value = app.colors[picker.dataset.class][picker.dataset.theme]

      picker.addEventListener('click', (event) => {
        activePicker = event.target
        checkColorChange()
      })
    })

    let colorChangeTimeout = null

    ColorPicker({
      el: COLOR_INPUT_SELECTOR,
      parent: '#dialogTheme',
      alpha: false,
      onChange: () => {
        clearTimeout(colorChangeTimeout)
        colorChangeTimeout = setTimeout(() => {
          checkColorChange()
          colors.save()
        }, 50)
      }
    })

    ColorPicker.ready(() => {
      const picker = dom.el('#clr-color-value')
      const button = document.createElement('a')

      picker.parentNode.insertBefore(button, picker.nextSibling)
      button.setAttribute('title', 'Reset color')
      button.classList.add('clr-custom-reset')
      button.innerHTML = dom.icons.RotateCcw
      button.addEventListener('click', () => {
        resetActivePickerColor()
        checkColorChange()
        colors.save()
      })
    })

    dom.customizeThemeButton.addEventListener('click', () => modal.show('#dialogTheme'))

    dom.defaultColorsButton.addEventListener('click', () => {
      confirm('This will reset all colors to their default values', colors.reset)
    })
  },

  /**
   * Checks color changes against defaults to show or hide the reset defaults button.
   */
  checkDefaults: () => {
    const hasDiff = !!diff(app.colors, colors.defaults)

    dom.defaultColorsButton.style.display = hasDiff ? 'inline' : 'none'
  },

  /**
   * Generates and applies custom styling sheets to document DOM based on configured theme.
   */
  apply: () => {
    if (!app.colors) return

    const sheet = app.settings.syntax
      ? Object.values(app.colors)
          .filter((c) => c.title !== 'Plain')
          .map((c) => `${c.class} { color: light-dark(${c.light}, ${c.dark}); }`)
          .join('\n')
      : `${app.colors.plain.class} { color: light-dark(${app.colors.plain.light}, ${app.colors.plain.dark}); }`

    dom.colorSheet.textContent = sheet
  },

  /**
   * Saves updated custom colors from picker elements to storage and refreshes styles.
   */
  save: () => {
    colorInputs.forEach((picker) => {
      app.colors[picker.dataset.class][picker.dataset.theme] = picker.value
    })

    store.set('colors', app.colors)
    colors.apply()
    colors.checkDefaults()
  },

  /**
   * Resets all custom colors back to application default settings.
   */
  reset: () => {
    const clonedDefaults = structuredClone(colors.defaults)

    store.set('colors', clonedDefaults)
    app.colors = store.get('colors')

    colorInputs.forEach((picker) => {
      picker.value = colors.defaults[picker.dataset.class][picker.dataset.theme]
      picker.dispatchEvent(new Event('input', { bubbles: true }))
    })

    checkColorChange()
    colors.checkDefaults()
    colors.apply()
  }
}
