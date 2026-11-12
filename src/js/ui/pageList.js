import UIkit from 'uikit'

import { syncOutputHeights } from '../calc/calcManager.js'
import { updatePageTabsScroll } from '../pages/pageTabs.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { checkSize, isElectron } from '../state/env.js'
import { store } from '../state/store.js'
import { modal } from './dialogs.js'

const PAGELIST_MIN_WIDTH = 210
const PAGELIST_MAX_WIDTH = 510
const PAGELIST_DEFAULT_WIDTH = 265
const PAGELIST_TRANSITION_MS = 180

let pageListResizerSetup = false
let lastDockState = null
let pageListTransitionTimer = null

/**
 * Hides the floating `#pageListPanel` offcanvas drawer when undocked and currently open.
 * @returns {Promise<void>|undefined}
 */
export function hideFloatingPageList() {
  if (!app.pageListDocked && dom.pageListPanel?.classList.contains('uk-open')) {
    return UIkit.offcanvas('#pageListPanel')?.hide()
  }
}

/**
 * Returns the clamped width for the docked page list.
 * @returns {number}
 */
export function getDockedPageListWidth() {
  return Math.min(
    PAGELIST_MAX_WIDTH,
    Math.max(PAGELIST_MIN_WIDTH, store.get('pageListWidth') ?? PAGELIST_DEFAULT_WIDTH)
  )
}

/**
 * Adjusts the width styles for the page list panel, resize handles, and main app container.
 * @param {number} width The width in pixels.
 */
function applyPageListWidth(width) {
  const bar = dom.pageListBar
  const resizer = dom.pageListResizer

  if (bar) {
    bar.style.width = `${width}px`
  }

  if (resizer) {
    resizer.style.left = `${width}px`
  }

  dom.appWrapper.style.left = `${width}px`
}

/**
 * Binds mouse drag and double-click listeners on the page list resizer bar.
 */
function setupPageListResizer() {
  if (pageListResizerSetup) return

  pageListResizerSetup = true

  const resizer = dom.pageListResizer

  const resizerTooltip = () => {
    const bar = dom.pageListBar

    resizer.title =
      bar?.style.width === `${PAGELIST_DEFAULT_WIDTH}px` ? 'Drag to resize' : 'Double click to reset position'
  }

  resizer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return

    e.preventDefault()

    const bar = dom.pageListBar
    const startX = e.clientX
    const startWidth = bar ? bar.offsetWidth : (store.get('pageListWidth') ?? PAGELIST_DEFAULT_WIDTH)

    let currentWidth = startWidth
    let isDragging = false

    resizer.classList.add('resizing')

    const onMouseMove = (moveEvent) => {
      if (!isDragging && Math.abs(moveEvent.clientX - startX) < 2) return

      isDragging = true
      currentWidth = Math.min(
        PAGELIST_MAX_WIDTH,
        Math.max(PAGELIST_MIN_WIDTH, startWidth + (moveEvent.clientX - startX))
      )

      applyPageListWidth(currentWidth)
    }

    const onMouseUp = () => {
      resizer.classList.remove('resizing')

      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      if (!isDragging) return

      store.set('pageListWidth', currentWidth)
      resizerTooltip()

      cm.refresh()
      syncOutputHeights()
      checkSize()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  resizer.addEventListener('dblclick', (e) => {
    e.preventDefault()
    window.getSelection()?.removeAllRanges()

    triggerPageListTransition()
    applyPageListWidth(PAGELIST_DEFAULT_WIDTH)

    store.set('pageListWidth', PAGELIST_DEFAULT_WIDTH)
    resizerTooltip()
  })

  resizer.addEventListener('mouseenter', resizerTooltip)
}

function triggerPageListTransition() {
  document.body.classList.add('page-list-width-animating')

  clearTimeout(pageListTransitionTimer)
  pageListTransitionTimer = setTimeout(() => {
    document.body.classList.remove('page-list-width-animating')
    cm.refresh()
    syncOutputHeights()
    checkSize()
  }, PAGELIST_TRANSITION_MS)
}

function getAppWrapperSize() {
  const rect = dom.appWrapper.getBoundingClientRect()

  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
}

function resetWindowToAppWrapper(pageListWidth = 0, appWrapperSize = getAppWrapperSize()) {
  if (!isElectron) return

  numara
    .isMaximized()
    .then(async (maximized) => {
      if (maximized) return

      const targetWidth = Math.max(480, appWrapperSize.width + pageListWidth)
      const targetHeight = Math.max(420, appWrapperSize.height)

      await numara.resetSize(appWrapperSize.width, appWrapperSize.height, pageListWidth)

      modal.centerOpen(true, targetWidth, targetHeight)
      setTimeout(() => {
        checkSize()
      }, PAGELIST_TRANSITION_MS + 40)
    })
    .catch(() => {
      // Ignore
    })
}

/**
 * Updates `.is-scrollable` on `#pageList` when items reach or overflow the bottom of the list.
 */
export function updatePageListScroll() {
  if (!dom.pageList) return

  requestAnimationFrame(() => {
    const lastItem = dom.pageList.lastElementChild
    const isScrollable =
      dom.pageList.scrollHeight > dom.pageList.clientHeight ||
      (lastItem ? lastItem.offsetTop + lastItem.offsetHeight >= dom.pageList.clientHeight - 1 : false)

    dom.pageList.classList.toggle('is-scrollable', isScrollable)
  })
}

/**
 * Setup page list panel based on settings and window size.
 * @param {boolean} [show=false] When true, ensure the docked panel is visible.
 * @param {boolean} [fromResize=false] When true, skip resizing the OS window on dock state changes.
 */
export function setupPageList(show = false, fromResize = false) {
  const appWrapperSize = getAppWrapperSize()
  const { pageListPosition } = app.settings
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth
  const isWide = viewportWidth > 900
  const isTabs = pageListPosition === 'tabs'
  const dock = pageListPosition === 'dock' || (pageListPosition === 'auto' && isWide)
  const dockChanged = dock !== lastDockState
  const shouldAnimateDockChange = lastDockState !== null && dockChanged
  const shouldResizeWindow = shouldAnimateDockChange && !fromResize

  lastDockState = dock

  if (shouldAnimateDockChange) {
    triggerPageListTransition()
  }

  dom.pageListPanel.classList.toggle('page-list-docked', dock)
  dom.pageName.classList.toggle('page-list-docked', dock)
  dom.actions?.classList.toggle('page-tabs-mode', isTabs)

  if (isTabs) {
    updatePageTabsScroll()
  } else {
    updatePageListScroll()
  }

  dom.closePageListButton.style.display = dock ? 'none' : ''
  dom.newPageButton.style.display = dock ? 'none' : ''

  if (dom.dockPageListButton) {
    const showDockButton = !isWide && (pageListPosition === 'auto' || pageListPosition === 'dock')

    dom.dockPageListButton.style.display = showDockButton ? '' : 'none'
    dom.dockPageListButton.innerHTML = dock ? dom.icons.PanelLeftClose : dom.icons.PanelLeft
    dom.dockPageListButton.title = dock ? 'Auto page list' : 'Dock page list'
  }

  if (dock) {
    const width = getDockedPageListWidth()

    if (shouldResizeWindow) {
      resetWindowToAppWrapper(width, appWrapperSize)
    }

    applyPageListWidth(width)
    setupPageListResizer()

    const isVisible = dom.pageListPanel.classList.contains('uk-open')

    if (!dockChanged && !(show && !isVisible)) {
      app.pageListDocked = true
      return
    }

    app.pageListDocked = false

    const offcanvas = UIkit.offcanvas('#pageListPanel', {
      overlay: false,
      mode: 'none',
      escClose: false,
      bgClose: false
    })

    app.pageListDocked = true

    if (show || dockChanged) {
      if (document.querySelector('.uk-modal.uk-open')) {
        dom.pageListPanel.classList.add('uk-open')
        dom.pageListPanel.style.display = 'block'

        const bar = dom.pageListBar

        if (bar) {
          bar.classList.add('uk-open')
        }
      } else {
        offcanvas.show()
      }
    }
  } else {
    app.pageListDocked = false

    if (shouldResizeWindow) {
      resetWindowToAppWrapper(0, appWrapperSize)
    }

    dom.appWrapper.style.left = '0'

    if (!dockChanged) {
      if (isTabs) {
        hideFloatingPageList()
      }
      return
    }

    UIkit.offcanvas('#pageListPanel', { overlay: true, mode: 'slide', escClose: true, bgClose: true })

    dom.pageListPanel.classList.remove('uk-open')
    dom.pageListPanel.style.display = ''

    const bar = dom.pageListBar

    if (bar) {
      bar.style.width = ''
      bar.classList.remove('uk-open')
    }
  }
}

/**
 * Initializes the page list panel settings, offcanvas drawer, and handles window resize changes.
 */
export function initializePageList() {
  let resizeTimer

  if (dom.pageList && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => updatePageListScroll())
    ro.observe(dom.pageList)
  }

  if (dom.pageListPanel) {
    UIkit.util.on(dom.pageListPanel, 'beforeshow shown', updatePageListScroll)
  }

  dom.dockPageListButton?.addEventListener('click', () => {
    app.settings.pageListPosition = app.pageListDocked ? 'auto' : 'dock'
    store.set('settings', app.settings)
    setupPageList(true)
  })

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)

    resizeTimer = setTimeout(() => {
      setupPageList(true, true)
      modal.centerOpen(true)
      syncOutputHeights()
      checkSize()
    }, 100)
  })
}
