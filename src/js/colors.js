import { $, $all, app, store } from './common'
import { generateIcons } from './icons'
import { confirm, modal } from './modal'
import { getTheme } from './utils'

import Coloris from '@melloware/coloris'
import DeepDiff from 'deep-diff'

/** Check for color schema changes. */
function checkDefaultColors() {
  app.colors = store.get('colors')

  DeepDiff.observableDiff(app.colors, colors.defaults, (d) => {
    if (d.kind !== 'E') {
      DeepDiff.applyChange(app.colors, colors.defaults, d)

      store.set('colors', app.colors)
    }
  })
}

/** Check if color has changed. */
export function checkColorChange() {
  const pickers = $all('.colorInput')

  pickers.forEach((picker) => {
    const isSame = picker.value === colors.defaults[picker.dataset.class][picker.dataset.theme]

    picker.style.borderLeft = isSame
      ? getTheme() === 'light'
        ? '1px solid #eaeaea'
        : '1px solid #666666'
      : '2px solid #dd9359'
  })
}

let activePicker

export const colors = {
  defaults: {
    answer: { title: 'Answers', class: '.output', dark: '#1eb5f0', light: '#17586b' },
    comment: { title: 'Comments', class: '.cm-comment', dark: '#5a5a5a', light: '#bebebe' },
    constant: { title: 'Constants', class: '.cm-constant', dark: '#eaa1f6', light: '#9c27b0' },
    currency: { title: 'Currencies', class: '.cm-currency', dark: `#009688`, light: '#009688' },
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

  initialize: () => {
    if (store.get('colors')) {
      checkDefaultColors()
    } else {
      store.set('colors', colors.defaults)
    }

    app.colors = store.get('colors')

    const pickers = $all('.colorInput')

    pickers.forEach((picker) => {
      picker.value = app.colors[picker.dataset.class][picker.dataset.theme]

      picker.addEventListener('click', (event) => {
        activePicker = event.target

        checkColorChange()
      })
    })

    Coloris.init()
    Coloris({
      el: '.colorInput',
      parent: '#dialog-theme',
      alpha: false,
      onChange: () => {
        checkColorChange()
        colors.save()
      }
    })

    Coloris.ready(() => {
      const picker = document.getElementById('clr-color-value')
      const button = document.createElement('a')

      picker.after(button)
      button.setAttribute('title', 'Reset color')
      button.classList.add('clr-custom-reset')
      button.innerHTML = '<i data-lucide="rotate-ccw"></i>'
      button.addEventListener('click', () => {
        activePicker.value = colors.defaults[activePicker.dataset.class][activePicker.dataset.theme]
        activePicker.dispatchEvent(new Event('input', { bubbles: true }))

        $('#clr-color-value').value = colors.defaults[activePicker.dataset.class][activePicker.dataset.theme]
        $('#clr-color-value').dispatchEvent(new Event('change'))

        checkColorChange()

        colors.save()
      })

      generateIcons()
    })
  },

  apply: () => {
    const appTheme = getTheme()

    let colorSheet = ''

    app.colors = store.get('colors')

    Object.values(app.colors).forEach((color) => {
      colorSheet += color.class + ' { color: ' + color[appTheme] + '; }\n'
    })

    $('#colorSheet').innerHTML = colorSheet
  },

  save: () => {
    const pickers = $all('.colorInput')

    pickers.forEach((picker) => {
      app.colors[picker.dataset.class][picker.dataset.theme] = picker.value
    })

    store.set('colors', app.colors)

    colors.apply()
  },

  reset: () => {
    store.set('colors', colors.defaults)

    app.colors = store.get('colors')

    const pickers = $all('.colorInput')

    pickers.forEach((picker) => {
      picker.value = colors.defaults[picker.dataset.class][picker.dataset.theme]
      picker.dispatchEvent(new Event('input', { bubbles: true }))
    })

    checkColorChange()

    colors.apply()
  }
}

$('#customizeThemeButton').addEventListener('click', () => {
  modal.show('#dialog-theme')
})

$('#resetColorsButton').addEventListener('click', () => {
  confirm('This will reset all colors to their default values', () => {
    colors.reset()
  })
})
