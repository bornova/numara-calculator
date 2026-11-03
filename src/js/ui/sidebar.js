import UIkit from 'uikit'

import { syncOutputHeights } from '../calc/calcManager.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { checkSize, isElectron } from '../state/env.js'
import { store } from '../state/store.js'
import { modal } from './dialogs.js'

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 480
export const SIDEBAR_DEFAULT_WIDTH = 250
const SIDEBAR_TRANSITION_MS = 180

let sideBarResizerSetup = false
let lastDockState = null
let sidebarTransitionTimer = null

/**
 * Adjusts the width styles for the sidebar panel, resize handles, and main app container.
 * @param {number} width The width in pixels.
 */
function applySidebarWidth(width) {
  const bar = dom.sideBarBar
  const resizer = dom.sideBarResizer

  if (bar) {
    bar.style.width = `${width}px`
  }

  if (resizer) {
    resizer.style.left = `${width}px`
  }

  dom.appWrapper.style.left = `${width}px`
}

/**
 * Binds mouse drag and double-click listeners on the side panel resizer bar.
 */
function setupSideBarResizer() {
  if (sideBarResizerSetup) return

  sideBarResizerSetup = true

  const resizer = dom.sideBarResizer

  const resizerTooltip = () => {
    const bar = dom.sideBarBar

    resizer.title =
      bar?.style.width === `${SIDEBAR_DEFAULT_WIDTH}px` ? 'Drag to resize' : 'Double click to reset position'
  }

  resizer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return

    e.preventDefault()

    const bar = dom.sideBarBar
    const startX = e.clientX
    const startWidth = bar ? bar.offsetWidth : (store.get('sideBarWidth') ?? SIDEBAR_DEFAULT_WIDTH)

    let currentWidth = startWidth
    let isDragging = false

    resizer.classList.add('resizing')

    const onMouseMove = (moveEvent) => {
      if (!isDragging && Math.abs(moveEvent.clientX - startX) < 2) return

      isDragging = true
      currentWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + (moveEvent.clientX - startX)))

      applySidebarWidth(currentWidth)
    }

    const onMouseUp = () => {
      resizer.classList.remove('resizing')

      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      if (!isDragging) return

      store.set('sideBarWidth', currentWidth)
      resizerTooltip()

      cm.refresh()
      syncOutputHeights()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  resizer.addEventListener('dblclick', (e) => {
    e.preventDefault()
    window.getSelection()?.removeAllRanges()

    triggerSidebarTransition()
    applySidebarWidth(SIDEBAR_DEFAULT_WIDTH)

    store.set('sideBarWidth', SIDEBAR_DEFAULT_WIDTH)
    resizerTooltip()

    setTimeout(() => {
      cm.refresh()
      syncOutputHeights()
    }, SIDEBAR_TRANSITION_MS)
  })

  resizer.addEventListener('mousemove', resizerTooltip)
}

function triggerSidebarTransition() {
  document.body.classList.add('sidebar-width-animating')

  clearTimeout(sidebarTransitionTimer)
  sidebarTransitionTimer = setTimeout(() => {
    document.body.classList.remove('sidebar-width-animating')
  }, SIDEBAR_TRANSITION_MS)
}

function getAppWrapperSize() {
  const rect = dom.appWrapper.getBoundingClientRect()

  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
}

function resetWindowToAppWrapper(sidebarWidth = 0, appWrapperSize = getAppWrapperSize()) {
  if (!isElectron) return

  numara
    .isMaximized()
    .then((maximized) => {
      if (maximized) return

      const targetWidth = Math.max(420, appWrapperSize.width + sidebarWidth)
      const targetHeight = Math.max(360, appWrapperSize.height)

      numara.resetSize(appWrapperSize.width, appWrapperSize.height, sidebarWidth)

      dom.els('.modal.uk-open .uk-modal-dialog').forEach((dialog) => {
        modal.center(dialog, true, targetWidth, targetHeight)
      })
      setTimeout(() => {
        checkSize()
      }, SIDEBAR_TRANSITION_MS + 40)
    })
    .catch(() => {
      // Ignore
    })
}

/**
 * Setup side panel based on settings and window size.
 * @param {boolean} [show=false] When true, ensure the docked panel is visible.
 * @param {boolean} [fromResize=false] When true, skip resizing the OS window on dock state changes.
 */
export function setupSideBar(show = false, fromResize = false) {
  const appWrapperSize = getAppWrapperSize()
  const { pageListPosition } = app.settings
  const isWide = (window.visualViewport?.width ?? window.innerWidth) > 900
  const dock = pageListPosition === 'dock' || (pageListPosition === 'auto' && isWide)
  const dockChanged = dock !== lastDockState
  const shouldAnimateDockChange = lastDockState !== null && dockChanged
  const shouldResizeWindow = shouldAnimateDockChange && !fromResize

  lastDockState = dock
  app.sidebarDocked = dock

  if (shouldAnimateDockChange) {
    triggerSidebarTransition()
  }

  dom.sideBar.classList.toggle('sidebar-docked', dock)
  dom.pageName.classList.toggle('sidebar-docked', dock)
  dom.closeSideBarButton.style.display = dock ? 'none' : ''
  dom.newPageButton.style.display = dock ? 'none' : ''

  if (dock) {
    const width = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, store.get('sideBarWidth') ?? SIDEBAR_DEFAULT_WIDTH)
    )

    if (shouldResizeWindow) {
      resetWindowToAppWrapper(width, appWrapperSize)
    }

    applySidebarWidth(width)
    setupSideBarResizer()

    const isVisible = dom.sideBar.classList.contains('uk-open')

    if (!dockChanged && !(show && !isVisible)) return

    const offcanvas = UIkit.offcanvas('#sideBar', {
      overlay: false,
      mode: 'none',
      escClose: false,
      bgClose: false
    })

    if (!isVisible && (show || dockChanged)) {
      if (document.querySelector('.uk-modal.uk-open')) {
        dom.sideBar.classList.add('uk-open')
        dom.sideBar.style.display = 'block'

        const bar = dom.sideBarBar

        if (bar) {
          bar.classList.add('uk-open')
        }
      } else {
        offcanvas.show()
      }
    }
  } else {
    if (shouldResizeWindow) {
      resetWindowToAppWrapper(0, appWrapperSize)
    }

    dom.appWrapper.style.left = '0'

    if (!dockChanged) return

    dom.sideBar.classList.remove('uk-open')
    dom.sideBar.style.display = ''

    const bar = dom.sideBarBar

    if (bar) {
      bar.style.width = ''
      bar.classList.remove('uk-open')
    }

    UIkit.offcanvas('#sideBar', { overlay: true, mode: 'slide', escClose: true, bgClose: true })
  }
}

/**
 * Initializes the side panel settings, offcanvas drawer, and handles window resize changes.
 */
export function initializeSideBar() {
  let resizeTimer

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)

    resizeTimer = setTimeout(() => {
      setupSideBar(true, true)
      dom.els('.modal.uk-open .uk-modal-dialog').forEach((dialog) => {
        modal.center(dialog, true)
      })
      syncOutputHeights()
      checkSize()
    }, 100)
  })
}
