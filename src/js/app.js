import { $, $all, app, store } from './common'
import { copyAll } from './context'
import { cm, udfInput, uduInput } from './editor'
import { calculate } from './eval'
import { getRates } from './forex'
import { generateIcons } from './icons'
import { notify, showError, showModal } from './modal'
import { plot } from './plot'
import { settings } from './settings'
import { defaultPage, lastPage, loadPage, getPageName, populatePages, sortPages } from './pages'
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
      console.log('Service worker registration failed.')
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

  $('#min').addEventListener('click', numara.minimize)
  $('#max').addEventListener('click', numara.maximize)
  $('#unmax').addEventListener('click', numara.unmaximize)
  $('#close').addEventListener('click', numara.close)

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

// Generate app icons
generateIcons()

// Initialize settings
settings.initialize()

// Get exchange rates
if (app.settings.currency) {
  getRates()
}

// Set user defined values
if (!store.get('pages')) {
  defaultPage()
} else {
  app.activePage = lastPage()
  loadPage(lastPage())
}

// Set user defined values
if (!store.get('udf')) {
  store.set('udf', '')
}

if (!store.get('udu')) {
  store.set('udu', '')
}

applyUdfu(store.get('udf'), 'func')
applyUdfu(store.get('udu'), 'unit')

// Prevent CM refresh if keydown
document.addEventListener('keydown', (event) => {
  app.refreshCM = !event.repeat
})

document.addEventListener('keyup', () => {
  app.refreshCM = true
})

$('#clearButton').addEventListener('click', () => {
  if (cm.getValue() !== '') {
    cm.setValue('')
    cm.focus()

    calculate()
  }
})

$('#copyButton').addEventListener('click', () => {
  copyAll()
})

$('#udfuButton').addEventListener('click', () => {
  showModal('#dialog-udfu')
})

$('#settingsButton').addEventListener('click', () => {
  showModal('#dialog-settings')
})

$('#aboutButton').addEventListener('click', () => {
  showModal('#dialog-about')
})

// Output panel actions
$('#output').addEventListener('click', (event) => {
  switch (event.target.className) {
    case 'answer':
      navigator.clipboard.writeText(event.target.dataset.copy)

      notify(`Copied '${event.target.dataset.copy}' to clipboard.`)

      break
    case 'plotButton': {
      const func = event.target.getAttribute('data-func')

      app.plotFunction = func.startsWith('line') ? app.mathScope[func] : func

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
    }
    case 'lineError':
      showError('Error on Line ' + event.target.getAttribute('data-line'), event.target.getAttribute('data-error'))

      break
  }

  event.stopPropagation()
})

// Clear input selections when clicked in output panel
$('#output').addEventListener('mousedown', () => {
  const sels = document.getElementsByClassName('CodeMirror-selected')

  while (sels[0]) {
    sels[0].classList.remove('CodeMirror-selected')
  }
})

// Tooltip defaults
UIkit.mixin({ data: { offset: 5 } }, 'tooltip')

// Initiate settings dialog
UIkit.util.on('#dialog-settings', 'beforeshow', settings.prep)

UIkit.util.on('#setswitch', 'beforeshow', (event) => {
  event.stopPropagation()
})

// Prepare user defined dialog inputs
UIkit.util.on('#dialog-udfu', 'shown', () => {
  const udf = store.get('udf').trim()
  const udu = store.get('udu').trim()

  udfInput.setValue(udf)
  uduInput.setValue(udu)
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

// Save page sort order after move
UIkit.util.on('#pageList', 'moved', () => {
  sortPages()
  populatePages()
})

// Save dialog title focus on shown
UIkit.util.on('#dialog-newPage', 'shown', () => {
  $('#newPageTitleInput').setAttribute('placeholder', getPageName())
  $('#newPageTitleInput').focus()
})

// Populate saved calculation
populatePages()

UIkit.util.on('#sidePanel', 'hidden', () => {
  setTimeout(() => {
    cm.focus()
  }, 20)
})

// Panel resizer
let resizeDelay
let isResizing = false

const panel = $('#panel')
const divider = $('#panelDivider')

// Set divider tooltip.
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

divider.addEventListener('mousedown', (event) => {
  isResizing = event.target === divider
})

$('#panel').addEventListener('mouseup', () => {
  isResizing = false
})

$('#panel').addEventListener('mousemove', (event) => {
  if (isResizing) {
    const offset = app.settings.lineNumbers ? 12 : 27
    const pointerRelativeXpos = event.clientX - panel.offsetLeft - offset
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
  exportButton: ['command+e', 'ctrl+e'],
  importButton: ['command+i', 'ctrl+i'],
  newPageButton: ['command+n', 'ctrl+n']
}

for (const [button, command] of Object.entries(traps)) {
  Mousetrap.bindGlobal(command, (event) => {
    event.preventDefault()

    if ($all('.uk-open').length === 0) {
      $('#' + button).click()
    }
  })
}

// Check for updates.
checkUpdates()

// Restart button if update is installed
$('#restartButton').addEventListener('click', () => {
  numara.updateApp()
})

// Developer Tools
if (isElectron) {
  $('#dialog-about-appVersion').addEventListener('click', (event) => {
    if (event.detail === 9) {
      numara.openDevTools()
    }
  })
}

// Print
window.addEventListener('beforeprint', () => {
  const printArea = document.createElement('div')

  printArea.setAttribute('id', 'printArea')
  printArea.className = 'printArea'
  printArea.innerHTML = `
    <div id="printTitle" class="printTitle">${name}</div>
    <table id="printPagele"
      class="printPagele ${app.settings.rulers ? 'printRulers' : ''}"
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
    const row = `
      <tr>
        ${app.settings.lineNumbers ? '<td class="printLineNumCol">' + (lineNo + 1) + '</td>' : ''}
        <td style="width:${app.settings.inputWidth}%;">${input}</td>
        <td class="printAnswer${app.settings.divider ? 'Left' : 'Right'}">${answer}</td>
      </tr>`

    $('#printPagele').innerHTML += row
  })

  printArea.innerHTML += `</table>`
})

window.addEventListener('afterprint', () => {
  $('#printArea').remove()
})
