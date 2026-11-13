import UIkit from 'uikit'

import { author, homepage, version } from '../../../package.json'
import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { isElectron } from '../state/env.js'
import { modal } from './dialogs.js'

/**
 * Configures the "About" dialog contents, version, copyright, and system dependencies info.
 */
export function setupAppInfo() {
  dom.dialogAboutCopyright.textContent = `Copyright © ${new Date().getFullYear()} ${author.name}`
  dom.dialogAboutAppVersion.innerHTML = isElectron
    ? `Version ${version}`
    : `Version ${version}
      <div class="versionCtnr">
        <div>
          <a href="https://github.com/bornova/numara-calculator/releases" target="_blank" rel="noopener noreferrer">Download desktop version</a>
        </div>
      </div>`
  dom.gitLink.href = homepage
  dom.webLink.href = author.url
  dom.licenseLink.href = `${homepage}/blob/master/LICENSE`
  dom.helpLink.href = `${homepage}/wiki`

  if (isElectron) {
    dom.dialogAboutAppVersion.title = `
    <div class="uk-text-small">
      <div><b>Chrome</b>: ${numara.versions.chrome()}</div>
      <div><b>Electron</b>: ${numara.versions.electron()}</div>
      <div><b>Node</b>: ${numara.versions.node()}</div>
      <div><b>V8</b>: ${numara.versions.v8()}</div>
    </div>`

    dom.logsLink.parentElement.style.display = 'block'
    dom.logsLink.addEventListener('click', numara.openLogs)

    // Open developer Tools
    dom.dialogAboutAppVersion.addEventListener('click', (event) => {
      if (event.detail === 9) numara.openDevTools()
    })

    numara.showAbout(() => modal.show('#dialogAbout'))
  }

  UIkit.util.on(
    '#dialogAbout',
    'shown',
    () => {
      checkAppUpdate()
    },
    { self: true }
  )
}

/**
 * Initialize app update listener.
 */
export function initAppUpdate() {
  if (!isElectron) return

  const updateStatusMessage = (message) => {
    dom.dialogAboutUpdateStatus.textContent = message
  }

  numara.updateStatus((status, version, progress) => {
    switch (status) {
      case 'checking':
        updateStatusMessage('Checking for updates...')
        break
      case 'available':
        dom.notificationDot.style.display = 'block'
        dom.notificationDot.setAttribute('uk-tooltip', `New version available`)
        dom.updateMenuLink.style.display = 'inline'
        break

      case 'notAvailable':
        updateStatusMessage('Numara is up to date.')
        break
      case 'downloading':
        updateStatusMessage(`Downloading update... (${Math.round(progress?.percent ?? 0)}%)`)
        break
      case 'downloaded': {
        const notice = `New version ${version} is ready to install.`

        updateStatusMessage(notice)

        app.updateReady = true
        dom.updateMenuLink.style.display = 'inline'
        dom.updateButton.style.display = 'inline-block'
        dom.updateButton.onclick = () => numara.updateApp()
        break
      }
      case 'error':
        updateStatusMessage('Error while checking for updates.')
        break
      default:
        updateStatusMessage('Unable to check for update.')
    }
  })
}

/**
 * Check for app update.
 */
export function checkAppUpdate() {
  if (!isElectron) return
  numara.checkUpdate()
}
