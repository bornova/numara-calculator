import { app, BrowserWindow, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const userDataDir = process.env.NUMARA_TEST_USERDATA
const serverOrigin = process.env.NUMARA_TEST_ORIGIN
const syncTestDir = process.env.NUMARA_TEST_SYNCDIR

app.getAppPath = () => repoRoot

if (userDataDir) {
  app.setPath('userData', userDataDir)
}

app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})

if (!process.argv.includes('--hidden')) {
  process.argv.push('--hidden')
}

function formatErr(error) {
  if (!error) return null
  if (error.stack || error.message) return String(error.stack || error.message)
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function reportResult(name, ok, error = null) {
  process.stdout.write(`E2E_RESULT:${JSON.stringify({ name, ok, error: formatErr(error) })}\n`)
}

async function runStep(name, fn) {
  try {
    await fn()
    reportResult(name, true)
  } catch (err) {
    reportResult(name, false, err)
  }
}

function mockExternalHttps(ses) {
  ses.protocol.handle('https', () => {
    const mockRates = {
      amount: 1,
      base: 'USD',
      date: '2026-05-01',
      rates: { EUR: 0.8, GBP: 0.75, JPY: 150, CAD: 1.35 }
    }

    return new Response(JSON.stringify(mockRates), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      }
    })
  })
}

async function evalIn(win, fnOrCode, arg) {
  const expr = typeof fnOrCode === 'function' ? `(${fnOrCode.toString()})(${JSON.stringify(arg)})` : fnOrCode

  return win.webContents.executeJavaScript(expr, true)
}

app.whenReady().then(async () => {
  try {
    // =========================================================================
    // PART A: Web / PWA E2E (Real HTTP origin, Web Worker SAB & non-SAB, SW)
    // =========================================================================
    const webSession = session.fromPartition('persist:numara-web-e2e')
    mockExternalHttps(webSession)

    const webWin = new BrowserWindow({
      width: 1080,
      height: 760,
      show: false,
      webPreferences: {
        session: webSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    await runStep('Web/PWA: SharedArrayBuffer Web Worker & live CodeMirror evaluation', async () => {
      await webWin.loadURL(`${serverOrigin}/sab/index.html`)

      const res = await evalIn(webWin, async () => {
        const waitFor = async (pred, timeout = 8000) => {
          const start = Date.now()
          while (Date.now() - start < timeout) {
            const val = await pred()
            if (val) return val
            await new Promise((r) => setTimeout(r, 40))
          }
          throw new Error('Timed out waiting for condition')
        }

        const cmEl = await waitFor(() => document.querySelector('.CodeMirror'))
        const cm = cmEl.CodeMirror

        cm.setValue('price = $120\ntax = 15% of price\nprice + tax\ntotal')

        const answers = await waitFor(() => {
          const els = [...document.querySelectorAll('#output [data-index] .answer')]
          if (els.length < 4) return null
          const texts = els.map((e) => e.textContent.trim())
          return texts[3] === '$276.00' ? texts : null
        })

        return {
          crossOriginIsolated: window.crossOriginIsolated,
          hasSAB: typeof SharedArrayBuffer === 'function',
          answers
        }
      })

      if (!res.crossOriginIsolated || !res.hasSAB) {
        throw new Error(`Expected crossOriginIsolated SAB context, got ${JSON.stringify(res)}`)
      }
      if (JSON.stringify(res.answers) !== JSON.stringify(['$120.00', '$18.00', '$138.00', '$276.00'])) {
        throw new Error(`Unexpected SAB worker answers: ${JSON.stringify(res.answers)}`)
      }
    })

    await runStep('Web/PWA: Service Worker precache, excluded desktop icons, & offline reload', async () => {
      await webWin.loadURL(`${serverOrigin}/index.html`)

      const swInfo = await evalIn(webWin, async () => {
        const reg = await navigator.serviceWorker.ready
        const start = Date.now()
        while (reg.active?.state !== 'activated' && Date.now() - start < 5000) {
          await new Promise((r) => setTimeout(r, 50))
        }

        const keys = await caches.keys()
        const numaraKey = keys.find((k) => k.startsWith('numara-v'))
        const cache = await caches.open(numaraKey)
        const cachedRequests = await cache.keys()
        const urls = cachedRequests.map((r) => new URL(r.url).pathname)

        return {
          crossOriginIsolated: window.crossOriginIsolated,
          state: reg.active?.state,
          numaraKey,
          hasIndex: urls.some((u) => u.endsWith('/index.html')),
          hasBundle: urls.some((u) => u.endsWith('/js/numara.js')),
          hasIco: urls.some((u) => u.endsWith('.ico')),
          hasLinuxPng: urls.some((u) => u.endsWith('/assets/icon.png'))
        }
      })

      if (swInfo.crossOriginIsolated !== false) {
        throw new Error('Expected non-SAB context on standard /index.html route')
      }
      if (swInfo.state !== 'activated' || !swInfo.hasIndex || !swInfo.hasBundle) {
        throw new Error(`Service Worker failed to precache app shell: ${JSON.stringify(swInfo)}`)
      }
      if (swInfo.hasIco || swInfo.hasLinuxPng) {
        throw new Error(`Desktop icons should be excluded from SW precache: ${JSON.stringify(swInfo)}`)
      }

      // Emulate full network offline mode via Chromium DevTools Protocol and reload
      webWin.webContents.debugger.attach('1.3')
      try {
        await webWin.webContents.debugger.sendCommand('Network.enable')
        await webWin.webContents.debugger.sendCommand('Network.emulateNetworkConditions', {
          offline: true,
          latency: 0,
          downloadThroughput: 0,
          uploadThroughput: 0
        })

        await webWin.webContents.reload()

        const offlineCalc = await evalIn(webWin, async () => {
          const start = Date.now()
          while (Date.now() - start < 8000) {
            const cm = document.querySelector('.CodeMirror')?.CodeMirror
            if (cm) {
              cm.setValue('40 + 2')
              break
            }
            await new Promise((r) => setTimeout(r, 40))
          }

          const startAns = Date.now()
          while (Date.now() - startAns < 8000) {
            const ans = document.querySelector('#output [data-index="0"] .answer')?.textContent?.trim()
            if (ans === '42') return ans
            await new Promise((r) => setTimeout(r, 40))
          }
          return null
        })

        if (offlineCalc !== '42') {
          throw new Error(`Offline PWA reload evaluation failed, got: ${offlineCalc}`)
        }
      } finally {
        await webWin.webContents.debugger
          .sendCommand('Network.emulateNetworkConditions', {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1
          })
          .catch(() => {})
        webWin.webContents.debugger.detach()
      }
    })

    await runStep(
      'UI & Layout Settings: theme, zoomLevel, answerPosition (left/right/bottom), pageListPosition (dock/float/tabs/auto), rulers, truncate, lineErrors, toggleSubs',
      async () => {
        await webWin.setSize(1080, 760)
        await webWin.loadURL(`${serverOrigin}/index.html`)

        const layoutChecks = await evalIn(webWin, async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms))
          const waitFor = async (pred, timeout = 8000) => {
            const start = Date.now()
            while (Date.now() - start < timeout) {
              const val = await pred()
              if (val) return val
              await wait(40)
            }
            throw new Error('Timed out in UI & Layout Settings')
          }

          const setSetting = async (id, value) => {
            const el = document.getElementById(id)
            if (el.type === 'checkbox') {
              el.checked = value
            } else {
              el.value = value
            }
            el.dispatchEvent(new Event('change', { bubbles: true }))
            await wait(80)
          }

          const cm = (await waitFor(() => document.querySelector('.CodeMirror')))?.CodeMirror
          cm.setValue('100 + 200\nunknown_ident')
          await waitFor(() => document.querySelector('#output [data-index="0"] .answer')?.textContent === '300')

          // Open Settings modal
          document.getElementById('settingsButton').click()
          await waitFor(() => document.getElementById('dialogSettings').classList.contains('uk-open'))

          // 1. Theme pills (dark -> light)
          document.querySelector('.theme-pill-button[data-theme-value="dark"]').click()
          await wait(80)
          const darkScheme = document.documentElement.style.colorScheme
          const darkLogo = document.getElementById('numaraLogo').getAttribute('src')

          document.querySelector('.theme-pill-button[data-theme-value="light"]').click()
          await wait(80)
          const lightScheme = document.documentElement.style.colorScheme

          // 2. Zoom levels
          await setSetting('zoomLevel', 'larger')
          const zoomDataset = document.documentElement.dataset.zoom
          const largerFontSize = document.querySelector('.input .CodeMirror').style.fontSize
          await setSetting('zoomLevel', 'normal')

          // 3. Typography & Rulers & Line Numbers & Line Wrap
          await setSetting('fontSize', '16px')
          await setSetting('fontWeight', '700')
          await setSetting('lineHeight', '30px')
          await setSetting('rulers', true)
          await setSetting('lineWrap', false)
          await setSetting('lineNumbers', false)

          const hasRulers = document.getElementById('mainPanel').classList.contains('showRulers')
          const cmLineNumbers = cm.getOption('lineNumbers')
          const cmLineWrapping = cm.getOption('lineWrapping')

          await setSetting('lineNumbers', true)
          await setSetting('lineWrap', true)

          // 4. Answer position: right -> bottom -> left + truncateAnswers
          await setSetting('truncateAnswers', true)
          await setSetting('answerPosition', 'right')
          const rightDividerDisplay = document.getElementById('panelDivider').style.display
          const rightAlign = document.getElementById('output').style.textAlign

          await setSetting('answerPosition', 'bottom')
          await waitFor(() => document.querySelector('.CodeMirror-linewidget .answer')?.textContent === '300')
          const mainPanelTruncate = document.getElementById('mainPanel').classList.contains('truncateAnswers')

          await setSetting('answerPosition', 'left')
          await waitFor(() => document.querySelector('#output [data-index="0"] .answer')?.textContent === '300')
          const leftDividerDisplay = document.getElementById('panelDivider').style.display

          // 5. Line errors toggle + clicking Error opens #dialogError
          await setSetting('lineErrors', true)
          await waitFor(() => document.querySelector('#output [data-index="1"] .lineError')?.textContent === 'Error')

          // 6. toggleSubs opacity check (must be 0.5, NOT 0.25 double-multiplied)
          await setSetting('syntax', false)
          const keywordTipsOpacity = document.getElementById('keywordTips').parentNode.style.opacity
          const keywordTipsParentOpacity = document.getElementById('keywordTips').parentNode.parentNode.style.opacity
          await setSetting('syntax', true)

          await setSetting('notation', 'fixed')
          const expUpperLabelOpacity = document.getElementById('expUpperLabel').style.opacity
          await setSetting('notation', 'auto')

          await setSetting('currency', false)
          const currencyIntervalDisabled = document.getElementById('currencyInterval').disabled
          const currencyIntervalOpacity = document.getElementById('currencyInterval').style.opacity
          await setSetting('currency', true)

          // 7. Page list positions: dock -> float -> tabs (plus inline tab rename)
          await setSetting('pageListPosition', 'dock')
          const dockLeft = document.getElementById('appWrapper').style.left
          const isDockedClass = document.getElementById('pageListPanel').classList.contains('page-list-docked')

          await setSetting('pageListPosition', 'float')
          const floatLeft = document.getElementById('appWrapper').style.left

          await setSetting('pageListPosition', 'tabs')
          const isTabsMode = document.getElementById('actions').classList.contains('page-tabs-mode')
          const tabCount = document.querySelectorAll('#pageTabs .pageTab').length

          // Close Settings modal
          document.querySelector('#dialogSettings .uk-modal-close-default').click()
          await wait(150)

          // Click .lineError to verify #dialogError opens with details
          document.querySelector('#output [data-index="1"] .lineError').click()
          await waitFor(() => document.getElementById('dialogError').classList.contains('uk-open'))
          const errTitle = document.getElementById('errTitle').textContent
          document.querySelector('#dialogError .uk-modal-close-default').click()
          await wait(150)

          // Double-click active page tab in tabs mode to rename inline
          const activeTab = document.querySelector('#pageTabs .pageTab.activeTab')
          activeTab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
          const renameInput = await waitFor(() => document.querySelector('.pageTabRenameInput'))
          renameInput.value = 'Q4 Forecast'
          renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          await wait(80)
          const renamedTabText = document.querySelector('#pageTabs .pageTab.activeTab .pageTabTitle')?.textContent

          // Reset to auto so we can verify responsive resize docking
          document.getElementById('settingsButton').click()
          await waitFor(() => document.getElementById('dialogSettings').classList.contains('uk-open'))
          await setSetting('pageListPosition', 'auto')
          document.querySelector('#dialogSettings .uk-modal-close-default').click()
          await wait(150)

          return {
            darkScheme,
            darkLogo,
            lightScheme,
            zoomDataset,
            largerFontSize,
            hasRulers,
            cmLineNumbers,
            cmLineWrapping,
            rightDividerDisplay,
            rightAlign,
            mainPanelTruncate,
            leftDividerDisplay,
            keywordTipsOpacity,
            keywordTipsParentOpacity,
            expUpperLabelOpacity,
            currencyIntervalDisabled,
            currencyIntervalOpacity,
            dockLeft,
            isDockedClass,
            floatLeft,
            isTabsMode,
            tabCount,
            errTitle,
            renamedTabText,
            wideAutoDocked: document.getElementById('pageListPanel').classList.contains('page-list-docked')
          }
        })

        if (layoutChecks.darkScheme !== 'dark' || !layoutChecks.darkLogo.includes('logo-dark.png')) {
          throw new Error(`Dark theme check failed: ${JSON.stringify(layoutChecks)}`)
        }
        if (layoutChecks.lightScheme !== 'light') {
          throw new Error(`Light theme check failed: ${JSON.stringify(layoutChecks)}`)
        }
        if (layoutChecks.zoomDataset !== 'larger' || layoutChecks.largerFontSize !== '15px') {
          throw new Error(`Zoom level scaling failed: ${JSON.stringify(layoutChecks)}`)
        }
        if (!layoutChecks.hasRulers || layoutChecks.cmLineNumbers !== false || layoutChecks.cmLineWrapping !== false) {
          throw new Error(`Editor display toggles failed: ${JSON.stringify(layoutChecks)}`)
        }
        if (
          layoutChecks.rightDividerDisplay !== 'none' ||
          layoutChecks.rightAlign !== 'right' ||
          !layoutChecks.mainPanelTruncate ||
          layoutChecks.leftDividerDisplay !== 'block'
        ) {
          throw new Error(`Answer position layout checks failed: ${JSON.stringify(layoutChecks)}`)
        }
        if (
          layoutChecks.keywordTipsOpacity !== '0.5' ||
          layoutChecks.keywordTipsParentOpacity === '0.5' ||
          layoutChecks.expUpperLabelOpacity !== '0.5' ||
          !layoutChecks.currencyIntervalDisabled ||
          layoutChecks.currencyIntervalOpacity !== '0.5'
        ) {
          throw new Error(`toggleSubs opacity/disabled checks failed: ${JSON.stringify(layoutChecks)}`)
        }
        if (
          !layoutChecks.isDockedClass ||
          layoutChecks.dockLeft !== '265px' ||
          layoutChecks.floatLeft !== '0px' ||
          !layoutChecks.isTabsMode ||
          layoutChecks.tabCount < 1 ||
          !layoutChecks.errTitle.includes('Line 2') ||
          layoutChecks.renamedTabText !== 'Q4 Forecast' ||
          !layoutChecks.wideAutoDocked
        ) {
          throw new Error(`Page list / error / rename checks failed: ${JSON.stringify(layoutChecks)}`)
        }

        // Narrow window to <= 900px and verify 'auto' undocks automatically
        await webWin.setSize(700, 600)
        const undockedOnNarrow = await evalIn(webWin, async () => {
          const start = Date.now()
          while (Date.now() - start < 4000) {
            if (!document.getElementById('pageListPanel').classList.contains('page-list-docked')) {
              return true
            }
            await new Promise((r) => setTimeout(r, 50))
          }
          return false
        })
        if (!undockedOnNarrow) {
          throw new Error('Expected pageListPanel to undock automatically when viewport <= 900px')
        }
        await webWin.setSize(1080, 760)
      }
    )

    await runStep(
      'Editor Features: syntax tokenizer, markdown folding, search/replace, & selection stats',
      async () => {
        const editorRes = await evalIn(webWin, async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms))
          const waitFor = async (pred, timeout = 8000) => {
            const start = Date.now()
            while (Date.now() - start < timeout) {
              const val = await pred()
              if (val) return val
              await wait(40)
            }
            throw new Error('Timed out in Editor Features')
          }

          const cm = document.querySelector('.CodeMirror').CodeMirror
          cm.setValue('# Budget Section\nurl = "https://numara.io#top" // comment\nx = 100\ny = 250\n#!\nz = 50')

          await waitFor(() => document.querySelector('#output [data-index="5"] .answer')?.textContent === '50')

          // 1. Verify string literal with '#' and '//' is tokenized as .cm-text, NOT .cm-comment
          const line1Tokens = cm.getLineTokens(1)
          const stringToken = line1Tokens.find((t) => t.string.includes('https://numara.io#top'))
          const commentToken = line1Tokens.find((t) => t.string.includes('// comment'))

          // 2. Fold section from line 2 (inside section) using Ctrl-Q scanUp behavior
          cm.setCursor({ line: 2, ch: 0 })
          cm.execCommand('Ctrl-Q')
          if (cm.getAllMarks().length === 0) {
            cm.foldCode(cm.getCursor(), { scanUp: true })
          }
          await wait(80)

          const foldedRow2Display = document.querySelector('#output [data-index="2"]')?.style.display
          const outsideRow5Display = document.querySelector('#output [data-index="5"]')?.style.display

          // Unfold
          cm.foldCode({ line: 0, ch: 0 })
          await wait(80)
          const unfoldedRow2Display = document.querySelector('#output [data-index="2"]')?.style.display

          // 3. Selection stats across lines 2..3 (100 and 250)
          cm.setSelection({ line: 2, ch: 0 }, { line: 3, ch: 7 })
          await wait(80)
          const statsText = document.getElementById('selectionStats').textContent
          const statsCopy = document.getElementById('selectionStats').dataset.copy
          cm.setCursor({ line: 0, ch: 0 })

          // 4. Search & Replace (/\b100\b/ -> 150)
          document.getElementById('searchButton').click()
          const findInput = await waitFor(() => document.querySelector('.numara-search-panel:not(.hidden) .find-input'))
          document.querySelector('.search-toggle-replace').click()
          const replaceInput = document.querySelector('.numara-search-panel .replace-input')

          findInput.value = '/\\b100\\b/'
          findInput.dispatchEvent(new Event('input', { bubbles: true }))
          await wait(150)

          replaceInput.value = '150'
          document.querySelector('.numara-search-panel .btn-replace').click()
          await waitFor(() => document.querySelector('#output [data-index="2"] .answer')?.textContent === '150')
          document.querySelector('.numara-search-panel .search-close-btn').click()

          return {
            stringTokenType: stringToken?.type,
            commentTokenType: commentToken?.type,
            foldedRow2Display,
            outsideRow5Display,
            unfoldedRow2Display,
            statsText,
            statsCopy
          }
        })

        if (editorRes.stringTokenType !== 'text' || editorRes.commentTokenType !== 'comment') {
          throw new Error(`Tokenizer failed on URL/hash inside string: ${JSON.stringify(editorRes)}`)
        }
        if (
          editorRes.foldedRow2Display !== 'none' ||
          editorRes.outsideRow5Display === 'none' ||
          editorRes.unfoldedRow2Display !== ''
        ) {
          throw new Error(`Section folding output sync failed: ${JSON.stringify(editorRes)}`)
        }
        if (!editorRes.statsText.includes('Sum: 350') || editorRes.statsCopy !== '350') {
          throw new Error(`Selection stats failed: ${JSON.stringify(editorRes)}`)
        }
      }
    )

    await runStep(
      'Plotting & Print: BigNumber multi-series SVG plot + Dark-Theme @media print legibility',
      async () => {
        const plotCheck = await evalIn(webWin, async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms))
          const waitFor = async (pred, timeout = 8000) => {
            const start = Date.now()
            while (Date.now() - start < timeout) {
              const val = await pred()
              if (val) return val
              await wait(40)
            }
            throw new Error('Timed out in Plotting test')
          }

          // Switch to Dark Theme + BigNumber mode to stress-test both Plot and Dark Print!
          document.getElementById('settingsButton').click()
          await waitFor(() => document.getElementById('dialogSettings').classList.contains('uk-open'))
          document.querySelector('.theme-pill-button[data-theme-value="dark"]').click()
          const numOut = document.getElementById('numericOutput')
          numOut.value = 'BigNumber'
          numOut.dispatchEvent(new Event('change', { bubbles: true }))
          await wait(100)
          document.querySelector('#dialogSettings .uk-modal-close-default').click()
          await wait(150)

          const cm = document.querySelector('.CodeMirror').CodeMirror
          cm.setValue('a = 2\nf(x) = a * x^2 - 4\ng(θ) = 10% of θ + 1')

          const plotBtn = await waitFor(() => document.querySelector('#output [data-index="1"] .plotButton'))
          plotBtn.click()

          await waitFor(() => document.getElementById('dialogPlot').classList.contains('uk-open'))
          await waitFor(() => document.querySelector('#plot svg.function-plot'))
          const chips = [...document.querySelectorAll('#plotSeriesList .plotSeriesChip')]

          // Click second series chip g(θ) to overlay both functions
          if (chips[1]) {
            chips[1].click()
            await wait(100)
          }

          // Toggle derivative
          const derivToggle = document.getElementById('plotDerivativeModal')
          derivToggle.checked = true
          derivToggle.dispatchEvent(new Event('change', { bubbles: true }))
          await wait(100)

          const pathCount = document.querySelectorAll('#plot svg.function-plot path.line').length
          const errorModalOpen = document.getElementById('dialogError').classList.contains('uk-open')

          document.querySelector('#dialogPlot .uk-modal-close-default').click()
          await wait(150)

          // Trigger beforeprint while in Dark Theme
          window.dispatchEvent(new Event('beforeprint'))

          return {
            chipCount: chips.length,
            pathCount,
            errorModalOpen,
            hasPrintArea: Boolean(document.querySelector('.printArea'))
          }
        })

        if (
          plotCheck.errorModalOpen ||
          plotCheck.chipCount !== 2 ||
          plotCheck.pathCount < 2 ||
          !plotCheck.hasPrintArea
        ) {
          throw new Error(`Plot / beforeprint check failed: ${JSON.stringify(plotCheck)}`)
        }

        // Emulate @media print in Chromium while Dark Theme is active!
        webWin.webContents.debugger.attach('1.3')
        try {
          await webWin.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })

          const printStyles = await evalIn(webWin, () => {
            const area = document.querySelector('.printArea')
            const cell = document.querySelector('.printPage td:not(.printLineNumCol)')
            const appWrap = document.getElementById('appWrapper')

            return {
              areaDisplay: getComputedStyle(area).display,
              areaBg: getComputedStyle(area).backgroundColor,
              cellColor: getComputedStyle(cell).color,
              appWrapDisplay: getComputedStyle(appWrap).display
            }
          })

          if (
            printStyles.areaDisplay !== 'block' ||
            printStyles.areaBg !== 'rgb(255, 255, 255)' ||
            printStyles.cellColor !== 'rgb(0, 0, 0)' ||
            printStyles.appWrapDisplay !== 'none'
          ) {
            throw new Error(`Dark-theme @media print styles failed: ${JSON.stringify(printStyles)}`)
          }
        } finally {
          await webWin.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: '' }).catch(() => {})
          webWin.webContents.debugger.detach()
        }

        const cleanedPrint = await evalIn(webWin, () => {
          window.dispatchEvent(new Event('afterprint'))
          return document.querySelector('.printArea') === null
        })
        if (!cleanedPrint) {
          throw new Error('Expected afterprint to remove .printArea')
        }
      }
    )

    await runStep('UDFU Dialog: adding, evaluating, and deleting control-flow UDF & custom UDU', async () => {
      const udfuRes = await evalIn(webWin, async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        const waitFor = async (pred, timeout = 8000) => {
          const start = Date.now()
          while (Date.now() - start < timeout) {
            const val = await pred()
            if (val) return val
            await wait(40)
          }
          throw new Error('Timed out in UDFU Dialog test')
        }

        // Reset numericOutput back to number
        document.getElementById('settingsButton').click()
        await waitFor(() => document.getElementById('dialogSettings').classList.contains('uk-open'))
        const numOut = document.getElementById('numericOutput')
        numOut.value = 'number'
        numOut.dispatchEvent(new Event('change', { bubbles: true }))
        await wait(80)
        document.querySelector('#dialogSettings .uk-modal-close-default').click()
        await wait(150)

        // Open UDFU dialog
        document.getElementById('udfuButton').click()
        await waitFor(() => document.getElementById('dialogUdfu').classList.contains('uk-open'))

        // Add control-flow UDF
        document.getElementById('udfNameInput').value = 'clampPos'
        document.getElementById('udfParamsInput').value = 'x'
        document.getElementById('udfBodyInput').value = 'if (x > 0) {\n  return x * 3\n}\nreturn 0'
        document.getElementById('udfSaveButton').click()
        await waitFor(() => document.querySelectorAll('#udfList .udfuItem').length === 1)

        // Switch to Units tab and add UDU
        document.querySelectorAll('#dialogUdfu [uk-tab] a')[1].click()
        await wait(80)
        document.getElementById('uduNameInput').value = 'xunit'
        document.getElementById('uduDefInput').value = '12 foot'
        document.getElementById('uduAliasesInput').value = 'xunits, xu'
        document.getElementById('uduPrefixesSelect').value = 'short'
        document.getElementById('uduSaveButton').click()
        await waitFor(() => document.querySelectorAll('#uduList .udfuItem').length === 1)

        document.querySelector('#dialogUdfu .uk-modal-close-default').click()
        await wait(150)

        const cm = document.querySelector('.CodeMirror').CodeMirror
        cm.setValue('clampPos(4)\nclampPos(-5)\n2 xunit to ft')

        const answers = await waitFor(() => {
          const els = [...document.querySelectorAll('#output [data-index] .answer')]
          if (els.length < 3) return null
          const texts = els.map((e) => e.textContent.trim())
          return texts[2] === '24 ft' ? texts : null
        })

        // Re-open UDFU dialog to verify delete confirmation (Cancel + Confirm + edit-state adjustment)
        document.getElementById('udfuButton').click()
        await waitFor(() => document.getElementById('dialogUdfu').classList.contains('uk-open'))
        document.querySelectorAll('#dialogUdfu [uk-tab] a')[0].click()
        await wait(80)

        // Add a second UDF and begin editing it so index-shift & active-edit reset on delete are exercised
        document.getElementById('udfNameInput').value = 'doubleIt'
        document.getElementById('udfParamsInput').value = 'x'
        document.getElementById('udfBodyInput').value = 'x * 2'
        document.getElementById('udfSaveButton').click()
        await waitFor(() => document.querySelectorAll('#udfList .udfuItem').length === 2)

        document.querySelectorAll('#udfList .editUdfuButton')[1].click()
        await waitFor(() => document.getElementById('udfSaveLabel').textContent === 'Save')

        // 1. Click Delete on clampPos (index 0) and choose No -> item remains, dialog stays open
        document.querySelectorAll('#udfList .deleteUdfuButton')[0].click()
        await waitFor(() => document.getElementById('dialogConfirm').classList.contains('uk-open'))
        const udfConfirmMsg = document.getElementById('confirmMsg').textContent
        document.getElementById('confirmNo').click()
        await waitFor(() => !document.getElementById('dialogConfirm').classList.contains('uk-open'))
        const countAfterUdfCancel = document.querySelectorAll('#udfList .udfuItem').length
        const udfuOpenAfterCancel = document.getElementById('dialogUdfu').classList.contains('uk-open')

        // 2. Click Delete on clampPos (index 0) and choose Yes -> removed, doubleIt shifts to index 0 still editing
        document.querySelectorAll('#udfList .deleteUdfuButton')[0].click()
        await waitFor(() => document.getElementById('dialogConfirm').classList.contains('uk-open'))
        document.getElementById('confirmYes').click()
        await waitFor(() => !document.getElementById('dialogConfirm').classList.contains('uk-open'))
        await waitFor(() => document.querySelectorAll('#udfList .udfuItem').length === 1)
        const shiftedStillEditing =
          document.querySelector('#udfList .udfuItem')?.classList.contains('is-editing') &&
          document.getElementById('udfSaveLabel').textContent === 'Save'

        // 3. Delete doubleIt while actively editing it -> form resets back to Add and list becomes empty
        document.querySelector('#udfList .deleteUdfuButton').click()
        await waitFor(() => document.getElementById('dialogConfirm').classList.contains('uk-open'))
        const udfSecondConfirmMsg = document.getElementById('confirmMsg').textContent
        document.getElementById('confirmYes').click()
        await waitFor(() => !document.getElementById('dialogConfirm').classList.contains('uk-open'))
        await waitFor(() => Boolean(document.querySelector('#udfList .udfuEmpty')))
        const formResetAfterDelete = document.getElementById('udfSaveLabel').textContent === 'Add'

        // 4. Switch to Units tab -> test Cancel then Confirm delete on custom unit xunit
        document.querySelectorAll('#dialogUdfu [uk-tab] a')[1].click()
        await wait(80)
        document.querySelector('#uduList .deleteUdfuButton').click()
        await waitFor(() => document.getElementById('dialogConfirm').classList.contains('uk-open'))
        const uduConfirmMsg = document.getElementById('confirmMsg').textContent
        document.getElementById('confirmNo').click()
        await waitFor(() => !document.getElementById('dialogConfirm').classList.contains('uk-open'))
        const countAfterUduCancel = document.querySelectorAll('#uduList .udfuItem').length

        document.querySelector('#uduList .deleteUdfuButton').click()
        await waitFor(() => document.getElementById('dialogConfirm').classList.contains('uk-open'))
        document.getElementById('confirmYes').click()
        await waitFor(() => !document.getElementById('dialogConfirm').classList.contains('uk-open'))
        await waitFor(() => Boolean(document.querySelector('#uduList .udfuEmpty')))

        document.querySelector('#dialogUdfu .uk-modal-close-default').click()
        await wait(150)

        return {
          answers,
          udfConfirmMsg,
          countAfterUdfCancel,
          udfuOpenAfterCancel,
          shiftedStillEditing,
          udfSecondConfirmMsg,
          formResetAfterDelete,
          uduConfirmMsg,
          countAfterUduCancel
        }
      })

      if (
        JSON.stringify(udfuRes.answers) !== JSON.stringify(['12', '0', '24 ft']) ||
        udfuRes.udfConfirmMsg !== '"clampPos" will be deleted.' ||
        udfuRes.countAfterUdfCancel !== 2 ||
        !udfuRes.udfuOpenAfterCancel ||
        !udfuRes.shiftedStillEditing ||
        udfuRes.udfSecondConfirmMsg !== '"doubleIt" will be deleted.' ||
        !udfuRes.formResetAfterDelete ||
        udfuRes.uduConfirmMsg !== '"xunit" will be deleted.' ||
        udfuRes.countAfterUduCancel !== 1
      ) {
        throw new Error(`UDFU evaluation or delete-confirmation mismatch: ${JSON.stringify(udfuRes)}`)
      }
    })

    webWin.destroy()

    // =========================================================================
    // PART B: Desktop Electron Integration (fileHandlers, syncWatcher, preload)
    // =========================================================================
    mockExternalHttps(session.defaultSession)

    const { config } = await import('../src/electron/config.js')
    const { getNumFilePath, queueOrOpenFile, resetRendererReady, setupFileHandlers } =
      await import('../src/electron/fileHandlers.js')
    const { setupSyncHandlers, stopSyncWatcher } = await import('../src/electron/syncWatcher.js')
    const { setupAutoUpdater } = await import('../src/electron/updater.js')
    const { createAppWindow, getWindow, setupWindowHandlers } = await import('../src/electron/window.js')

    await runStep(
      'Desktop Electron: getNumFilePath, multi-file startup queue, & real two-way fs.watch Folder Sync',
      async () => {
        // 1. Verify getNumFilePath resolves relative .num files and rejects directories ending in .num
        const fakeNumDir = path.join(syncTestDir, 'Folder.num')
        fs.mkdirSync(fakeNumDir, { recursive: true })

        const startupDir = path.join(userDataDir, 'startup-files')
        fs.mkdirSync(startupDir, { recursive: true })
        const file1 = path.join(startupDir, 'Alpha.num')
        const file2 = path.join(startupDir, 'Beta.num')
        fs.writeFileSync(file1, '10 + 15', 'utf8')
        fs.writeFileSync(file2, '20 * 3', 'utf8')

        if (getNumFilePath(['--flag', 'Folder.num'], syncTestDir) !== null) {
          throw new Error('getNumFilePath must reject directories ending in .num')
        }
        if (getNumFilePath(['electron', 'Alpha.num'], startupDir) !== file1) {
          throw new Error('getNumFilePath failed to resolve relative .num against baseDir')
        }
        fs.rmSync(fakeNumDir, { recursive: true, force: true })

        // 2. Queue TWO .num files before creating the window so renderer-ready drains both
        config.set('showTray', true)
        setupWindowHandlers({ onBeforeReset: stopSyncWatcher })
        setupFileHandlers()
        setupSyncHandlers()
        setupAutoUpdater()

        queueOrOpenFile(file1)
        queueOrOpenFile(file2)

        createAppWindow({ onWindowClosed: resetRendererReady })
        const desktopWin = getWindow()

        await new Promise((resolve) => {
          if (desktopWin.webContents.isLoading()) {
            desktopWin.webContents.once('did-finish-load', resolve)
          } else {
            resolve()
          }
        })

        // Verify both Alpha and Beta were imported into local pages
        const importedPages = await evalIn(desktopWin, async () => {
          const start = Date.now()
          while (Date.now() - start < 8000) {
            const raw = JSON.parse(localStorage.getItem('numara') || '{}')
            const names = (raw.pages || []).map((p) => p.name)
            if (names.includes('Alpha') && names.includes('Beta')) {
              return names
            }
            await new Promise((r) => setTimeout(r, 50))
          }
          return []
        })

        if (!importedPages.includes('Alpha') || !importedPages.includes('Beta')) {
          throw new Error(`Expected startup queue to import both Alpha and Beta, got: ${JSON.stringify(importedPages)}`)
        }

        // 3. Enable real two-way Folder Sync pointing to syncTestDir
        await evalIn(
          desktopWin,
          async (dir) => {
            const wait = (ms) => new Promise((r) => setTimeout(r, ms))
            document.getElementById('settingsButton').click()
            await wait(100)
            const syncEnabled = document.getElementById('syncDirEnabled')
            const syncDirInput = document.getElementById('syncDir')
            syncDirInput.value = dir
            syncEnabled.checked = true
            syncEnabled.dispatchEvent(new Event('change', { bubbles: true }))
            await wait(300)
            document.querySelector('#dialogSettings .uk-modal-close-default').click()
          },
          syncTestDir
        )

        // Wait for local pages Alpha.num & Beta.num to be written to syncTestDir
        const startWrite = Date.now()
        while (Date.now() - startWrite < 6000) {
          if (fs.existsSync(path.join(syncTestDir, 'Alpha.num')) && fs.existsSync(path.join(syncTestDir, 'Beta.num'))) {
            break
          }
          await new Promise((r) => setTimeout(r, 50))
        }

        if (!fs.existsSync(path.join(syncTestDir, 'Alpha.num'))) {
          throw new Error('Local page Alpha.num was not synced to disk')
        }

        // 4. Write an external file ExternalSync.num on disk and verify fs.watch imports & evaluates it
        fs.writeFileSync(path.join(syncTestDir, 'ExternalSync.num'), '100 + 23', 'utf8')

        const syncedAnswer = await evalIn(desktopWin, async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms))
          const start = Date.now()
          while (Date.now() - start < 8000) {
            const raw = JSON.parse(localStorage.getItem('numara') || '{}')
            const extPage = (raw.pages || []).find((p) => p.name === 'ExternalSync')
            if (extPage && extPage.data === '100 + 23') {
              document.getElementById(extPage.id)?.querySelector('.pageListItemTitle')?.click()
              await wait(150)
              const ans = document.querySelector('#output [data-index="0"] .answer')?.textContent?.trim()
              if (ans === '123') return ans
            }
            await wait(60)
          }
          return null
        })

        if (syncedAnswer !== '123') {
          throw new Error(`External fs.watch folder sync failed, got answer: ${syncedAnswer}`)
        }

        stopSyncWatcher()
        desktopWin.destroy()
      }
    )

    app.exit(0)
  } catch (fatalErr) {
    reportResult('Fatal E2E Runner', false, fatalErr)
    app.exit(1)
  }
})
