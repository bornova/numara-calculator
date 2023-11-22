import { $, $all, app, store } from './common'
import { copyAll } from './context'
import { cm, udfInput, uduInput } from './editor'
import { getRates } from './forex'
import { generateIcons } from './icons'
import { calculate } from './math'
import { confirm, notify, showError, showModal } from './modal'
import { plot } from './plot'
import { settings } from './settings'
import { applyUdfu } from './userDefined'
import { checkSize, checkUpdates, isMac, isElectron, toggleMinMax } from './utils'

import { author, description, homepage, name, version } from './../../package.json'

import { DateTime } from 'luxon'

import UIkit from 'uikit'

import Mousetrap from 'mousetrap'
import 'mousetrap-global-bind'

// Set app info
document.title = description

$('#dialog-about-copyright').innerHTML = `Copyright ©️ ${DateTime.local().year} ${author.name}`
$('#dialog-about-appVersion').innerHTML = isElectron
  ? `Version ${version}`
  : `Version ${version}
      <div class="versionCtnr">
        <div>
          <a href="https://github.com/bornova/numara-calculator/releases" target="_blank">Download desktop version</a>
        </div>
      </div>`
$('#gitLink').setAttribute('href', homepage)
$('#webLink').setAttribute('href', author.url)
$('#licenseLink').setAttribute('href', homepage + '/blob/master/LICENSE')
$('#helpLink').setAttribute('href', homepage + '/wiki')

// Set theme and maximize if needed
if (isElectron) {
  numara.themeUpdate(settings.apply)
  numara.fullscreen()
} else {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      console.log('Service worker registration failed')
    })
  }
}

// Set headers
if (isElectron && !isMac) {
  $('#header-mac').remove()
  $('#header-win').style.display = 'block'
  $('#header-win-title').innerHTML = name

  $('#max').style.display = numara.isMaximized() ? 'none' : 'block'
  $('#unmax').style.display = numara.isMaximized() ? 'block' : 'none'

  $('#winButtons').addEventListener('click', (e) => {
    switch (e.target.id) {
      case 'min':
        numara.minimize()

        break
      case 'max':
        numara.maximize()

        break
      case 'unmax':
        numara.unmaximize()

        break
      case 'close':
        numara.close()

        break
    }

    e.stopPropagation()
  })

  numara.isMax((event, isMax) => {
    $('#unmax').style.display = isMax ? 'block' : 'none'
    $('#max').style.display = isMax ? 'none' : 'block'
  })

  $('#header-win').addEventListener('dblclick', toggleMinMax)
} else {
  $('#header-win').remove()
  $('#header-mac').style.display = 'block'
  $('#header-mac-title').innerHTML = name

  if (isElectron) {
    $('#header-mac').addEventListener('dblclick', toggleMinMax)
  }
}

// Initialize settings
settings.initialize()

// Generate app icons
generateIcons()

// Get exchange rates
if (app.settings.currency) {
  getRates()
}

// Set initial input value
cm.setValue(store.get('input') || '')

// Set user defined values
if (!store.get('udf')) {
  store.set('udf', '')
}

if (!store.get('udu')) {
  store.set('udu', '')
}

// Tooltip defaults
UIkit.mixin({ data: { offset: 5 } }, 'tooltip')

// App button actions
$('#actions').addEventListener('click', (e) => {
  UIkit.tooltip('#' + e.target.id).hide()

  switch (e.target.id) {
    case 'clearButton':
      if (cm.getValue() !== '') {
        cm.setValue('')
        cm.focus()

        calculate()
      }

      break
    case 'printButton': {
      const printArea = document.createElement('div')

      printArea.className = 'printArea'
      printArea.innerHTML = `<div id="printTitle" class="printTitle">${name}</div>
        <table id="printTable"
          class="printTable ${app.settings.rulers ? 'printRulers' : ''}"
          style="
            font-size: ${app.settings.fontSize};
            font-weight: ${app.settings.fontWeight};
            line-height: ${app.settings.lineHeight};"
        >`

      document.body.appendChild(printArea)

      cm.eachLine((line) => {
        const lineNo = cm.getLineNumber(line)
        const input = cm.getLine(lineNo)
        const answer = $('#output').children[lineNo].innerText

        let row = `<tr>
          ${app.settings.lineNumbers ? '<td class="printLineNumCol">' + (lineNo + 1) + '</td>' : ''}
          <td style="width:${app.settings.inputWidth}%;">${input}</td>
          <td class="printAnswer${app.settings.divider ? 'Left' : 'Right'}">${answer}</td>
        </tr>`

        $('#printTable').innerHTML += row
      })

      printArea.innerHTML += `</table>`

      window.print()

      printArea.remove()

      break
    }
    case 'copyButton':
      copyAll()

      break
    case 'saveButton':
      $('#saveTitle').value = ''
      $('#saveTitle').focus()

      showModal('#dialog-save')

      break
    case 'openButton':
      showModal('#dialog-open')

      break
    case 'udfuButton': // Open custom functions dialog
      showModal('#dialog-udfu')

      break
    case 'settingsButton':
      showModal('#dialog-settings')

      break
    case 'aboutButton':
      showModal('#dialog-about')

      break
  }

  e.stopPropagation()
})

if (isElectron) {
  // Export calculations to file
  $('#dialog-save-export').addEventListener('click', () => {
    numara.export($('#saveTitle').value, cm.getValue())
  })

  numara.exportData((event, msg) => {
    UIkit.modal('#dialog-save').hide()

    notify(msg, 'success')
  })

  numara.exportDataError((event, err) => {
    notify(err, 'danger')
  })

  // Import calculations from file
  $('#dialog-save-import').addEventListener('click', () => {
    numara.import()
  })

  numara.importData((event, data, msg) => {
    UIkit.modal('#dialog-open').hide()

    cm.setValue(data)

    notify(msg, 'success')
  })

  numara.importDataError((event, err) => {
    notify(err, 'danger')
  })
} else {
  $('#dialog-save-export').remove()
  $('#dialog-save-import').remove()
}

// Output actions
$('#output').addEventListener('click', (e) => {
  const func = e.target.getAttribute('data-func')

  switch (e.target.className) {
    case 'answer':
      navigator.clipboard.writeText(e.target.dataset.copy)

      notify(`Copied '${e.target.dataset.copy}' to clipboard.`)

      break
    case 'plotButton': // Plot function
      app.func = func.startsWith('line') ? app.mathScope[func] : func

      try {
        $('#plotCrossModal').checked = app.settings.plotCross
        $('#plotDerivativeModal').checked = app.settings.plotDerivative
        $('#plotGridModal').checked = app.settings.plotGrid

        plot()

        showModal('#dialog-plot')
      } catch (error) {
        showError('Error', error)
      }

      break
    case 'lineError': // Show line error
      showError('Error on Line ' + e.target.getAttribute('data-line'), e.target.getAttribute('data-error'))

      break
  }

  e.stopPropagation()
})

// Save calculation on Enter key
$('#saveTitle').addEventListener('keyup', (e) => {
  if (e.key === 'Enter' || e.keyCode === 13) {
    $('#dialog-save-save').click()
  }
})

// Clear input selections when clicked in output panel
$('#output').addEventListener('mousedown', () => {
  const sels = document.getElementsByClassName('CodeMirror-selected')

  while (sels[0]) {
    sels[0].classList.remove('CodeMirror-selected')
  }
})

// Prevent CM refresh if keydown
document.addEventListener('keydown', (e) => {
  app.refreshCM = !e.repeat
})

document.addEventListener('keyup', () => {
  app.refreshCM = true
})

// Dialog button actions
document.addEventListener('click', (e) => {
  switch (e.target.id) {
    case 'dialog-save-save': {
      const id = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
      const savedItems = store.get('saved') || {}
      const data = cm.getValue()
      const title = $('#saveTitle').value.replace(/<|>/g, '').trim() || 'No title'

      savedItems[id] = [title, data]

      store.set('saved', savedItems)

      UIkit.modal('#dialog-save').hide()

      notify(
        `Saved as '${title}' <a class="notificationLink" onclick="document.querySelector('#openButton').click()">View saved calculations</a>`
      )

      break
    }
    case 'dialog-open-deleteAll':
      confirm('All saved calculations will be deleted.', () => {
        localStorage.removeItem('saved')

        populateSaved()
      })

      break
    case 'dialog-udfu-save-f':
      applyUdfu(udfInput.getValue().trim(), 'func')

      break
    case 'dialog-udfu-save-u':
      applyUdfu(uduInput.getValue().trim(), 'unit')

      break
    case 'defaultSettingsButton':
      confirm('All settings will revert back to defaults.', () => {
        app.settings = JSON.parse(JSON.stringify(settings.defaults))

        store.set('settings', app.settings)

        settings.prep()
        settings.save()
        settings.apply()
      })

      break
    case 'dialog-settings-reset':
      confirm('All user settings and data will be lost.', () => {
        if (isElectron) {
          numara.resetApp()
        } else {
          localStorage.clear()
          location.reload()
        }
      })

      break
    case 'resetSizeButton':
      if (isElectron) {
        numara.resetSize()
      }

      break
    case 'syntax':
      settings.toggleSubs()

      break
    case 'thouSep':
      settings.toggleSubs()

      break
    case 'localeWarn':
      showError(
        'Caution: Locale',
        `Your locale (${app.settings.locale}) uses comma (,) as decimal separator.  Therefore, you must use semicolon (;) as argument separator when using functions.<br><br>Ex. sum(1;3) // 4`
      )

      break
    case 'bigNumWarn':
      showError(
        'Caution: BigNumber Limitations',
        `Using the BigNumber may break function plotting and is not compatible with some math functions. 
          It may also cause unexpected behavior and affect overall performance.<br><br>
          <a target="_blank" href="https://mathjs.org/docs/datatypes/bignumbers.html">Read more on BigNumbers</a>`
      )

      break
    // Plot settings
    case 'plotCrossModal':
      app.settings.plotCross = $('#plotCrossModal').checked

      store.set('settings', app.settings)

      plot()

      break
    case 'plotDerivativeModal':
      app.settings.plotDerivative = $('#plotDerivativeModal').checked

      store.set('settings', app.settings)

      plot()

      break
    case 'plotGridModal':
      app.settings.plotGrid = $('#plotGridModal').checked

      store.set('settings', app.settings)

      plot()

      break
    case 'exportPlot': {
      $('.function-plot').setAttribute('xmlns', 'http://www.w3.org/2000/svg')

      const preface = '<?xml version="1.0" standalone="no"?>\r\n'
      const svgData = $('.function-plot').outerHTML
      const svgBlob = new Blob([preface, svgData], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)
      const downloadLink = document.createElement('a')

      downloadLink.href = svgUrl
      downloadLink.download = name + '_plot'

      $('#dialog-plot').appendChild(downloadLink)
      downloadLink.click()
      $('#dialog-plot').removeChild(downloadLink)

      plot()

      break
    }
    case 'resetPlot':
      app.activePlot = null

      plot()

      break
    case 'restartButton': // Restart to update
      numara.updateApp()

      break
  }
})

/** Get all saved calculations and prepare list. */
function populateSaved() {
  const savedObj = store.get('saved') || {}
  const savedItems = Object.entries(savedObj)

  $('#dialog-open-body').innerHTML = ''

  if (savedItems.length > 0) {
    $('#dialog-open-deleteAll').disabled = false

    savedItems.forEach(([id, val]) => {
      $('#dialog-open-body').innerHTML += `
          <div class="dialog-open-wrapper" id="${id}">
            <div data-action="load">
              <div class="dialog-open-title">${val[0]}</div>
              <div class="dialog-open-date">${DateTime.fromFormat(id, 'yyyyMMddHHmmssSSS').toFormat('FF')}</div>
            </div>
            <span class="dialog-open-delete" data-action="delete"><i data-lucide="trash"></i></span>
          </div>`
    })

    generateIcons()
  } else {
    $('#dialog-open-deleteAll').disabled = true
    $('#dialog-open-body').innerHTML = 'No saved calculations.'
  }
}

// Open saved calculations dialog actions
$('#dialog-open').addEventListener('click', (e) => {
  const saved = store.get('saved')

  if (e.target.parentNode.getAttribute('data-action') === 'load') {
    let pid = e.target.parentNode.parentNode.id

    cm.setValue(saved[pid][1])

    calculate()

    UIkit.modal('#dialog-open').hide()
  }

  if (e.target.getAttribute('data-action') === 'delete') {
    let pid = e.target.parentNode.id

    confirm('Calculation "' + saved[pid][0] + '" will be deleted.', () => {
      delete saved[pid]

      store.set('saved', saved)

      populateSaved()
    })
  }
})

// Save dialog title focus on shown
UIkit.util.on('#dialog-save', 'shown', () => {
  $('#saveTitle').focus()
})

// Populate saved calculation
UIkit.util.on('#dialog-open', 'beforeshow', populateSaved)

// Initiate settings dialog
UIkit.util.on('#setswitch', 'beforeshow', (e) => {
  e.stopPropagation()
})

UIkit.util.on('#dialog-settings', 'beforeshow', settings.prep)

$('#precision').addEventListener('input', () => {
  $('#precision-label').innerHTML = $('#precision').value
})

$('#expLower').addEventListener('input', () => {
  $('#expLower-label').innerHTML = $('#expLower').value
})

$('#expUpper').addEventListener('input', () => {
  $('#expUpper-label').innerHTML = $('#expUpper').value
})

document.querySelectorAll('.settingItem').forEach((el) => {
  el.addEventListener('change', () => {
    settings.save()
    settings.apply()
  })
})

// Prepare user defined dialog inputs
UIkit.util.on('#dialog-udfu', 'shown', () => {
  const udf = store.get('udf').trim()
  const udu = store.get('udu').trim()

  udfInput.setValue(udf)
  uduInput.setValue(udu)

  setTimeout(() => {
    UIkit.switcher('#udfuSwitcher').index() === 0 ? udfInput.focus() : uduInput.focus()
  }, 100)
})

// Blur input when user defined switcher is shown
UIkit.util.on('.uk-switcher', 'show', () => {
  cm.getInputField().blur()
})

// Focus on input when dialog is closed
UIkit.util.on('.modal', 'hidden', () => {
  setTimeout(() => {
    cm.focus()
  }, 100)
})

// Plot dialog
UIkit.util.on('#dialog-plot', 'shown', plot)

UIkit.util.on('#dialog-plot', 'hide', () => {
  app.activePlot = false
})

// Panel resizer
let resizeDelay
let isResizing = false

const panel = $('#panel')
const divider = $('#panelDivider')

/** Set divider tooltip. */
const dividerTooltip = () => {
  divider.title =
    $('#input').style.width === settings.defaults.inputWidth + '%' ? 'Drag to resize' : 'Double click to reset position'
}

divider.addEventListener('dblclick', () => {
  app.settings.inputWidth = settings.defaults.inputWidth

  store.set('settings', app.settings)

  settings.apply()

  dividerTooltip()
})

divider.addEventListener('mousedown', (e) => {
  isResizing = e.target === divider
})

$('#panel').addEventListener('mouseup', () => {
  isResizing = false
})

$('#panel').addEventListener('mousemove', (e) => {
  if (isResizing) {
    const offset = app.settings.lineNumbers ? 12 : 27
    const pointerRelativeXpos = e.clientX - panel.offsetLeft - offset
    const iWidth = (pointerRelativeXpos / panel.clientWidth) * 100
    const inputWidth = iWidth < 0 ? 0 : iWidth > 100 ? 100 : iWidth

    $('#input').style.width = inputWidth + '%'

    app.settings.inputWidth = inputWidth

    store.set('settings', app.settings)

    clearTimeout(resizeDelay)

    resizeDelay = setTimeout(calculate, 10)
  }

  dividerTooltip()
})

// Relayout plot on window resize
let windowResizeDelay
window.addEventListener('resize', () => {
  if (app.activePlot && $('#dialog-plot').classList.contains('uk-open')) {
    plot()
  }

  clearTimeout(windowResizeDelay)

  windowResizeDelay = setTimeout(calculate, 10)

  checkSize()
})

// Sync scroll
let inputScroll = false
let outputScroll = false

const inputPanel = $('.CodeMirror-scroll')
const outputPanel = $('#output')

inputPanel.addEventListener('scroll', () => {
  if (!inputScroll) {
    outputScroll = true

    outputPanel.scrollTop = inputPanel.scrollTop
  }

  inputScroll = false
})

outputPanel.addEventListener('scroll', () => {
  if (!outputScroll) {
    inputScroll = true

    inputPanel.scrollTop = outputPanel.scrollTop
  }

  outputScroll = false

  $('#scrollTop').style.display = outputPanel.scrollTop > 50 ? 'block' : 'none'
})

$('#scrollTop').addEventListener('click', () => {
  inputPanel.scrollTop = 0
  outputPanel.scrollTop = 0
})

// Mousetrap
const traps = {
  clearButton: ['command+d', 'ctrl+d'],
  printButton: ['command+p', 'ctrl+p'],
  saveButton: ['command+s', 'ctrl+s'],
  openButton: ['command+o', 'ctrl+o']
}

for (const [button, command] of Object.entries(traps)) {
  Mousetrap.bindGlobal(command, (e) => {
    e.preventDefault()

    if ($all('.uk-open').length === 0) {
      $('#' + button).click()
    }
  })
}

// Check for updates.
checkUpdates()

window.onload = () => {
  applyUdfu(store.get('udf'), 'func')
  applyUdfu(store.get('udu'), 'unit')

  cm.execCommand('goDocEnd')
  cm.execCommand('goLineEnd')

  $('.cm-s-numara .CodeMirror-code').lastChild.scrollIntoView()

  setTimeout(() => {
    cm.focus()
  }, 200)
}
