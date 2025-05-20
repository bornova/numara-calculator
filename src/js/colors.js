import { dom } from './dom'
import { confirm, modal } from './modal'
import { app, getTheme, store } from './utils'

import Coloris from '@melloware/coloris'
import DeepDiff from 'deep-diff'

const BORDER_LIGHT = '1px solid #eaeaea'
const BORDER_DARK = '1px solid #666666'
const BORDER_CHANGED = '2px solid #dd9359'

const COLOR_INPUT_SELECTOR = '.colorInput'
const colorInputs = dom.els(COLOR_INPUT_SELECTOR)

let activePicker = null

function resetActivePickerColor() {
  if (!activePicker) return

  const colorInput = dom.el('#clr-color-value')

  colorInput.value = colors.defaults[activePicker.dataset.class][activePicker.dataset.theme]
  colorInput.dispatchEvent(new Event('change'))
  activePicker.dispatchEvent(new Event('input', { bubbles: true }))
}

export function checkColorChange() {
  const theme = getTheme()

  colorInputs.forEach((picker) => {
    const isSame = picker.value === colors.defaults[picker.dataset.class][picker.dataset.theme]

    picker.style.borderLeft = isSame ? (theme === 'light' ? BORDER_LIGHT : BORDER_DARK) : BORDER_CHANGED
  })
}

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
    keyword: { title: 'Keywords', class: '.cm-keyword, .cm-lineNo', dark: '#e78c3f', light: '#be6317' },
    number: { title: 'Numbers', class: '.cm-number', dark: '#e6e6e6', light: '#333333' },
    operator: { title: 'Operators', class: '.cm-operator', dark: '#bbbbbb', light: '#888888' },
    plain: { title: 'Plain', class: '.cm-plain, .output', dark: '#e6e6e6', light: '#333333' },
    unit: { title: 'Units', class: '.cm-unit, .cm-udu', dark: '#6b9cd3', light: '#005cc5' },
    variable: { title: 'Variables', class: '.cm-variable', dark: '#96b4c4', light: '#57707c' }
  },

  initialize: () => {
    app.colors = store.get('colors')

    if (app.colors) {
      DeepDiff.observableDiff(app.colors, colors.defaults, (diff) => {
        if (diff.kind === 'E') return

        DeepDiff.applyChange(app.colors, colors.defaults, diff)
        store.set('colors', app.colors)
      })
    } else {
      app.colors = { ...colors.defaults }
      store.set('colors', app.colors)
    }

    colorInputs.forEach((picker) => {
      picker.value = app.colors[picker.dataset.class][picker.dataset.theme]

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
      const button = document.createElement('a')

      picker.after(button)
      button.setAttribute('title', 'Reset color')
      button.classList.add('clr-custom-reset')
      button.innerHTML = dom.icons.RotateCcw
      button.addEventListener('click', () => {
        resetActivePickerColor()
        checkColorChange()
        colors.save()
      })
    })
  },

  checkDefaults: () => {
    dom.defaultColorsButton.style.display = DeepDiff.diff(app.colors, colors.defaults) ? 'inline' : 'none'
  },

  apply: () => {
    const appTheme = getTheme()
    let colorSheet = ''

    app.colors = store.get('colors')

    if (app.settings.syntax) {
      Object.values(app.colors).forEach((color) => {
        if (color.title === 'Plain') return

        colorSheet += `${color.class} { color: ${color[appTheme]};}\n`
      })
    } else {
      colorSheet += `.cm-plain, .output { color: ${app.colors.plain[appTheme]};}\n`
    }

    dom.colorSheet.innerHTML = colorSheet
  },

  save: () => {
    colorInputs.forEach((picker) => {
      app.colors[picker.dataset.class][picker.dataset.theme] = picker.value
    })

    store.set('colors', app.colors)
    colors.apply()
    colors.checkDefaults()
  },

  reset: () => {
    store.set('colors', colors.defaults)
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

dom.customizeThemeButton.addEventListener('click', () => modal.show('#dialogTheme'))

dom.defaultColorsButton.addEventListener('click', () => {
  confirm('This will reset all colors to their default values', colors.reset)
})
