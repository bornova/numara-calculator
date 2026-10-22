import { dom } from '../dom'
import { cm } from '../editor'
import { calculate, renderAnswersToHTML, syncOutputHeights } from '../calc/calcManager'
import { confirm, modal, notify } from './dialogs'
import { app, checkSize, isElectron, store } from '../appState'
import { escapeHTML } from '../core/utils.js'
import { syncPageSave, syncPageRename, syncPageDelete, getSafeFilename } from '../calc/sync'

import { DateTime } from 'luxon'

import UIkit from 'uikit'

// Side bar management
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 400
const SIDEBAR_DEFAULT_WIDTH = 240
const SIDEBAR_TRANSITION_MS = 180

/**
 * Adjusts the width styles for the sidebar panel, resize handles, and main app container.
 * @param {number} width The width in pixels.
 */
function applySidebarWidth(width) {
  const bar = dom.el('#sideBar .uk-offcanvas-bar')
  const resizer = dom.el('#sideBarResizer')

  if (bar) {
    bar.style.width = `${width}px`
  }

  if (resizer) {
    resizer.style.left = `${width}px`
  }

  dom.appWrapper.style.left = `${width}px`
}

let sideBarResizerSetup = false

/**
 * Binds mouse drag and double-click listeners on the side panel resizer bar.
 */
function setupSideBarResizer() {
  if (sideBarResizerSetup) return

  sideBarResizerSetup = true

  const resizer = dom.el('#sideBarResizer')

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault()

    resizer.classList.add('resizing')

    const onMouseMove = (e) => {
      const width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, e.clientX))

      applySidebarWidth(width)
    }

    const onMouseUp = (e) => {
      resizer.classList.remove('resizing')

      const width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, e.clientX))

      store.set('sideBarWidth', width)

      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      cm.refresh()
      syncOutputHeights()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  resizer.addEventListener('dblclick', () => {
    applySidebarWidth(SIDEBAR_DEFAULT_WIDTH)

    store.set('sideBarWidth', SIDEBAR_DEFAULT_WIDTH)

    cm.refresh()
    syncOutputHeights()
  })
}

let lastDockState = null
let sidebarTransitionTimer = null

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

      numara.resetSize(appWrapperSize.width, appWrapperSize.height, sidebarWidth)
      setTimeout(() => {
        checkSize()
      }, SIDEBAR_TRANSITION_MS + 40)
    })
    .catch(() => {
      // Ignore
    })
}

/** Setup side panel based on settings and window size.
 *
 * @param {boolean} show When true, ensure the docked panel is visible.
 *
 */
export function setupSideBar(show = false) {
  const appWrapperSize = getAppWrapperSize()
  const { pageListPosition } = app.settings
  const isWide = (window.visualViewport?.width ?? window.innerWidth) > 900
  const dock = pageListPosition === 'dock' || (pageListPosition === 'auto' && isWide)
  const dockChanged = dock !== lastDockState
  const shouldAnimateDockChange = lastDockState !== null && dockChanged

  lastDockState = dock
  app.sidebarDocked = dock

  if (shouldAnimateDockChange) {
    triggerSidebarTransition()
  }

  dom.sideBar.classList.toggle('sidebar-docked', dock)
  dom.sideBarButton.style.display = dock ? 'none' : ''
  dom.closeSideBarButton.style.display = dock ? 'none' : ''
  dom.newPageButton.style.display = dock ? 'none' : ''
  dom.leftActionsDivider.style.display = dock ? 'none' : ''

  if (dock) {
    const width = store.get('sideBarWidth') ?? SIDEBAR_DEFAULT_WIDTH

    if (shouldAnimateDockChange) {
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

        const bar = dom.el('#sideBar .uk-offcanvas-bar')

        if (bar) {
          bar.classList.add('uk-open')
        }
      } else {
        offcanvas.show()
      }
    }
  } else {
    if (shouldAnimateDockChange) {
      resetWindowToAppWrapper(0, appWrapperSize)
    }

    dom.appWrapper.style.left = '0'

    if (!dockChanged) return

    dom.sideBar.classList.remove('uk-open')
    dom.sideBar.style.display = ''

    const bar = dom.el('#sideBar .uk-offcanvas-bar')

    if (bar) {
      bar.classList.remove('uk-open')
    }

    UIkit.offcanvas('#sideBar', { overlay: true, mode: 'slide', escClose: true, bgClose: true })
  }
}

/**
 * Updates the active page name label display and hover titles in the header.
 * @param {string} name The page name.
 * @param {string} pageId The page ID timestamp string.
 */
function updatePageName(name, pageId) {
  const pageDate = DateTime.fromFormat(pageId, 'yyyyMMddHHmmssSSS').toFormat('FF')

  dom.pageName.textContent = name
  dom.pageName.title = `${name} - ${pageDate}`
}

/**
 * Get page name/number to use.
 * @returns {string} The page name.
 */
export function getPageName() {
  const pages = store.get('pages') || []
  const usedNumbers = new Set(
    pages
      .map((page) => {
        const match = page.name.trim().match(/^Page (\d+)$/)
        return match ? Number(match[1]) : null
      })
      .filter((n) => n !== null)
  )

  let pageNo = 1

  while (usedNumbers.has(pageNo)) pageNo++

  return `Page ${pageNo}`
}

/**
 * Generate default page.
 */
export function defaultPage() {
  const pageId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
  const pageName = getPageName()

  store.set('pages', [{ id: pageId, name: pageName, data: store.get('input') || '' }])
  store.remove('input')

  loadPage(pageId)
}

/**
 * Create new page.
 * @param {boolean} isImport Is the new page imported? true | false
 */
export function newPage(isImport) {
  const pageId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
  const pages = store.get('pages')
  let pageName =
    dom.newPageTitleInput.value.replace(/<|>/g, '').trim() || (isImport ? `Import #${pageId}` : getPageName())

  const sanitizedNew = getSafeFilename(pageName)

  if (pages.some((p) => getSafeFilename(p.name) === sanitizedNew)) {
    if (isImport) {
      let counter = 1
      let uniqueName = `${pageName} (${counter})`

      while (pages.some((p) => getSafeFilename(p.name) === getSafeFilename(uniqueName))) {
        counter++
        uniqueName = `${pageName} (${counter})`
      }

      pageName = uniqueName
    } else {
      notify(
        `"${pageName}" (or a page with a conflicting file name) already exists. Please choose a different page name.`,
        'danger'
      )

      return
    }
  }

  app.activePage = pageId

  pages.push({ id: pageId, name: pageName, data: '' })

  store.set('pages', pages)
  store.set('lastPage', pageId)

  cm.setValue('')

  populatePages()
  updatePageName(pageName, pageId)
  syncPageSave(pageName, '')

  modal.hide('#dialogNewPage')
}

/**
 * Duplicate page.
 * @param {string} pageId Id of the page to duplicate.
 */
export function duplicatePage(pageId) {
  const dupPageId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
  const pages = store.get('pages')
  const dupPage = pages.find((page) => page.id === pageId)

  if (!dupPage) {
    notify('Page not found.', 'danger')
    return
  }

  const dupPageData = dupPage.data
  const baseName = dupPage.name + ' - Copy'
  let dupPageName = baseName
  let count = 1

  while (pages.some((p) => getSafeFilename(p.name) === getSafeFilename(dupPageName))) {
    dupPageName = `${baseName} (${count++})`
  }

  app.activePage = dupPageId
  pages.push({ id: dupPageId, name: dupPageName, data: dupPageData })
  store.set('pages', pages)

  loadPage(dupPageId)
  syncPageSave(dupPageName, dupPageData)
}

/**
 * Delete page.
 * @param {string} pageId Id of the page to delete.
 */
export function deletePage(pageId) {
  let pages = store.get('pages')
  const found = pages.find((page) => page.id === pageId)

  if (!found) return

  const pageName = found.name

  confirm(`"${pageName}" will be deleted.`, () => {
    pages = pages.filter((page) => page.id !== pageId)

    store.set('pages', pages)

    if (pages.length === 0) {
      defaultPage()
    } else if (pageId === app.activePage) {
      loadPage(pages[pages.length - 1].id)
    } else {
      populatePages()
    }

    syncPageDelete(pageName)
  })
}

/**
 * Delete all pages.
 */
export function deleteAllPages() {
  confirm('All pages will be deleted permanently.', () => {
    const pages = store.get('pages') || []
    pages.forEach((p) => syncPageDelete(p.name))

    store.set('pages', [])

    defaultPage()
  })
}

/**
 * Rename page.
 * @param {string} pageId Id of the page to rename.
 */
export function renamePage(pageId) {
  const pages = store.get('pages')
  const page = pages.find((page) => page.id === pageId)

  dom.renamePageTitleInput.value = page.name

  modal.show('#dialogRenamePage')

  // Remove previous event listener to avoid stacking
  function newListener() {
    const newName = dom.renamePageTitleInput.value.replace(/<|>/g, '').trim() || getPageName()
    const sanitizedNew = getSafeFilename(newName)

    // Prevent duplicate page names
    if (pages.some((p) => getSafeFilename(p.name) === sanitizedNew && p.id !== pageId)) {
      notify(
        `"${newName}" (or a page with a conflicting file name) already exists. Please choose a different page name.`,
        'danger'
      )

      return
    }

    const oldName = page.name

    page.name = newName
    store.set('pages', pages)

    populatePages()

    if (pageId === app.activePage) {
      updatePageName(page.name, pageId)
    }

    syncPageRename(oldName, newName)

    modal.hide('#dialogRenamePage')
  }

  dom.dialogRenamePageSave.onclick = newListener
}

/**
 * Load page.
 * @param {string} pageId Id of the page to load.
 */
export function loadPage(pageId) {
  const page = store.get('pages').find((p) => p.id === pageId)

  if (!page) {
    notify('Page not found.', 'danger')
    return
  }

  const { name, data, history, cursor, folds, answers } = page

  app.activePage = pageId
  store.set('lastPage', pageId)

  updatePageName(name, pageId)

  app.loadingPage = true

  if (answers && answers.length > 0 && app.settings.answerPosition !== 'bottom') {
    dom.output.innerHTML = renderAnswersToHTML(answers)
  } else {
    dom.output.innerHTML = ''
  }

  cm.setValue(data)

  if (history) cm.setHistory(history)

  if (folds && folds.length > 0) {
    for (const fold of folds) {
      if (typeof fold.from === 'number') {
        cm.foldCode({ line: fold.from, ch: 0 }, null, 'fold')
      }
    }
  }

  app.loadingPage = false

  if (answers && answers.length > 0 && app.settings.answerPosition !== 'bottom') {
    syncOutputHeights()
  }

  calculate()

  cm.execCommand('goLineEnd')

  if (cursor) {
    cm.setCursor(cursor)

    setTimeout(() => {
      try {
        cm.scrollIntoView({ ch: cursor.ch, line: cursor.line + 1 })
      } catch {
        cm.scrollIntoView(cursor)
      }
    }, 100)
  }

  populatePages()
}

/**
 * Initialize pages.
 */
export function initializePages() {
  if (store.get('pages')) {
    if (app.settings.newPageOnStart) {
      const pages = store.get('pages')
      const blankExists = pages.some((page) => page.data === '')

      if (blankExists) {
        const blankPage = pages.find((page) => page.data === '')

        app.activePage = blankPage.id
        loadPage(blankPage.id)
      } else {
        newPage()
      }
    } else {
      const pages = store.get('pages')
      const lastPageId = store.get('lastPage')
      const pageExists = pages.some((p) => p.id === lastPageId)

      app.activePage = pageExists ? lastPageId : pages[0]?.id || null

      if (app.activePage) {
        loadPage(app.activePage)
      } else {
        defaultPage()
      }
    }
  } else {
    defaultPage()
  }
}

/**
 * Populate the page list in side bar.
 */
export function populatePages() {
  const pages = store.get('pages')

  if (!pages || pages.length === 0) defaultPage()

  // Clean up any orphaned UIkit dropdown DOM elements appended to <body> before clearing pageList
  document.querySelectorAll('body > .uk-dropdown:not(#sortDropdown)').forEach((el) => el.remove())

  dom.pageList.innerHTML = ''

  pages.forEach((page) => {
    const pageListItem = document.createElement('div')

    pageListItem.id = page.id
    pageListItem.classList.add('pageListItem', 'uk-flex', 'uk-flex-middle')
    if (app.activePage === page.id) {
      pageListItem.classList.add('activePage')
    }
    pageListItem.innerHTML = `
      <div class="uk-flex-1" data-action="load" data-page="${page.id}">
        <div class="pageListItemTitle" title="${escapeHTML(page.name)}">${escapeHTML(page.name)}</div>
        <div class="dialog-open-date">${DateTime.fromFormat(page.id, 'yyyyMMddHHmmssSSS').toFormat('FF')}</div>
      </div>
      <div class="pageItemActions uk-flex-right uk-margin-small-right">
        <span class="drop-parent-icon">${dom.icons.EllipsisVertical}</span>
        <div uk-dropdown="mode: click; pos: right-top; bg-scroll: false; container: body">
          <div 
            class="renamePageButton uk-flex uk-flex-column"
            data-page="${page.id}"
            data-action="rename"
            title="Rename">Rename
          </div>
          <div 
            class="dupPageButton uk-flex uk-flex-column"
            data-page="${page.id}"
            data-action="duplicate"
            title="Duplicate">Duplicate
          </div>
          <div class="deletePageButton uk-flex uk-flex-column"
            data-page="${page.id}"
            data-action="delete"
            title="Delete">Delete
          </div>
          ${
            isElectron
              ? `<hr class="sortListDivider" />
                <div class="exportPageButton uk-flex uk-flex-column"
                  data-page="${page.id}"
                  data-action="export"
                  title="Export">Export
                </div>`
              : ''
          }
        </div>
      </div>
    `

    dom.pageList.appendChild(pageListItem)
  })
}

/**
 * Sort page list.
 * @param {string} by Sort by argument - oldnew | newold | az | za
 */
export function sortPages(by) {
  const pages = store.get('pages')
  const sorters = {
    oldnew: (a, b) => a.id.localeCompare(b.id),
    newold: (a, b) => b.id.localeCompare(a.id),
    az: (a, b) => a.name.localeCompare(b.name),
    za: (a, b) => b.name.localeCompare(a.name)
  }

  const sorter = sorters[by]
  const sortedPages = sorter ? [...pages].sort(sorter) : pages

  store.set('pages', sortedPages)
  populatePages()
  UIkit.dropdown('#sortDropdown').hide(0)
}

/**
 * Sort page list after drag.
 */
function pageOrder() {
  const pages = store.get('pages')
  const pageList = dom.els('#pageList > div')
  const orderedPages = [...pageList]
    .map((el) => pages.find((page) => page.id === el.getAttribute('id')))
    .filter(Boolean)

  store.set('pages', orderedPages)
}

let justDraggedPage = false

/**
 * Sets up smooth, vertical-axis-locked pointer drag-and-drop reordering for the page list.
 */
function setupPageListSort() {
  const DRAG_THRESHOLD = 4
  const HYSTERESIS = 4
  const SCROLL_ZONE = 36
  const MAX_SCROLL_SPEED = 10

  dom.pageList.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    if (event.target.closest('.pageItemActions') || event.target.closest('.uk-dropdown')) return

    const item = event.target.closest('.pageListItem')

    if (!item || dom.pageList.children.length < 2) return

    const startY = event.clientY
    const itemRect = item.getBoundingClientRect()
    const offsetY = startY - itemRect.top
    const itemHeight = itemRect.height
    const startIndex = Array.from(dom.pageList.children).indexOf(item)

    let isDragging = false
    let dragClone = null
    let autoScrollRaf = null
    let lastClientY = startY

    const updateDragPosition = (clientY) => {
      if (!dragClone) return

      const listRect = dom.pageList.getBoundingClientRect()
      const minTop = listRect.top
      const maxTop = Math.max(minTop, listRect.bottom - itemHeight)
      const clampedTop = Math.min(maxTop, Math.max(minTop, clientY - offsetY))

      dragClone.style.left = `${listRect.left}px`
      dragClone.style.top = `${clampedTop}px`

      const dragCenterY = clampedTop + itemHeight / 2
      const siblings = Array.from(dom.pageList.children).filter((child) => child !== item)
      let insertBeforeNode = null

      for (const sibling of siblings) {
        const siblingTop = listRect.top - dom.pageList.scrollTop + sibling.offsetTop
        const siblingMid = siblingTop + sibling.offsetHeight / 2
        const isBeforeItem = sibling.offsetTop < item.offsetTop
        const threshold = isBeforeItem
          ? siblingMid + itemHeight / 2 - HYSTERESIS
          : siblingMid - itemHeight / 2 + HYSTERESIS

        if (dragCenterY < threshold) {
          insertBeforeNode = sibling
          break
        }
      }

      if (item.nextElementSibling !== insertBeforeNode) {
        const prevTops = new Map()

        for (const sib of siblings) {
          prevTops.set(sib, sib.getBoundingClientRect().top)
        }

        dom.pageList.insertBefore(item, insertBeforeNode)

        for (const sib of siblings) {
          sib.style.transition = 'none'
          sib.style.transform = ''

          const newTop = sib.getBoundingClientRect().top
          const deltaY = prevTops.get(sib) - newTop

          if (Math.abs(deltaY) > 0.5) {
            sib.style.transform = `translateY(${deltaY}px)`
            sib.getBoundingClientRect()
            sib.style.transition = 'transform 150ms cubic-bezier(0.2, 0, 0, 1)'
            sib.style.transform = ''
          }
        }
      }
    }

    const stepAutoScroll = () => {
      if (!isDragging) return

      const listRect = dom.pageList.getBoundingClientRect()
      let scrollDelta = 0

      if (lastClientY < listRect.top + SCROLL_ZONE && dom.pageList.scrollTop > 0) {
        const ratio = Math.min(1, (listRect.top + SCROLL_ZONE - lastClientY) / SCROLL_ZONE)
        scrollDelta = -Math.ceil(ratio * MAX_SCROLL_SPEED)
      } else if (
        lastClientY > listRect.bottom - SCROLL_ZONE &&
        dom.pageList.scrollTop < dom.pageList.scrollHeight - dom.pageList.clientHeight
      ) {
        const ratio = Math.min(1, (lastClientY - (listRect.bottom - SCROLL_ZONE)) / SCROLL_ZONE)
        scrollDelta = Math.ceil(ratio * MAX_SCROLL_SPEED)
      }

      if (scrollDelta !== 0) {
        dom.pageList.scrollTop += scrollDelta
        updateDragPosition(lastClientY)
        autoScrollRaf = requestAnimationFrame(stepAutoScroll)
      } else {
        autoScrollRaf = null
      }
    }

    const onPointerMove = (moveEvent) => {
      lastClientY = moveEvent.clientY

      if (!isDragging) {
        if (Math.abs(lastClientY - startY) < DRAG_THRESHOLD) return

        isDragging = true
        justDraggedPage = true

        dom.els('.uk-dropdown.uk-open').forEach((el) => UIkit.dropdown(el)?.hide(0))

        const listRect = dom.pageList.getBoundingClientRect()

        dragClone = item.cloneNode(true)
        dragClone.removeAttribute('id')
        dragClone.querySelectorAll('[uk-dropdown]').forEach((el) => el.remove())
        dragClone.classList.add('pageListItemDrag')
        dragClone.style.width = `${itemRect.width}px`
        dragClone.style.height = `${itemHeight}px`
        dragClone.style.left = `${listRect.left}px`
        dragClone.style.top = `${itemRect.top}px`

        item.classList.add('pageListItemPlaceholder')
        document.body.classList.add('is-sorting-pages')
        document.body.appendChild(dragClone)
      }

      moveEvent.preventDefault()
      updateDragPosition(lastClientY)

      if (!autoScrollRaf) {
        autoScrollRaf = requestAnimationFrame(stepAutoScroll)
      }
    }

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)

      if (autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf)
        autoScrollRaf = null
      }

      if (!isDragging) return

      isDragging = false

      if (dragClone) {
        dragClone.remove()
        dragClone = null
      }

      item.classList.remove('pageListItemPlaceholder')
      document.body.classList.remove('is-sorting-pages')

      for (const child of dom.pageList.children) {
        child.style.transition = ''
        child.style.transform = ''
      }

      const endIndex = Array.from(dom.pageList.children).indexOf(item)

      if (endIndex !== startIndex) {
        pageOrder()
      }

      setTimeout(() => {
        justDraggedPage = false
      }, 0)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  })
}

setupPageListSort()

/**
 * Show new page dialog.
 */
function newPageDialog() {
  dom.newPageTitleInput.value = ''
  dom.newPageTitleInput.focus()

  modal.show('#dialogNewPage')
}

dom.closeSideBarButton.addEventListener('click', () => UIkit.offcanvas('#sideBar').hide())
dom.newPageButton.addEventListener('click', newPageDialog)
dom.newPageButtonSP.addEventListener('click', newPageDialog)
dom.dialogNewPageSave.addEventListener('click', () => newPage(false))
dom.newPageTitleInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') {
    dom.dialogNewPageSave.click()
  }
})
dom.deleteAllPagesButton.addEventListener('click', deleteAllPages)
dom.sortOldNew.addEventListener('click', () => sortPages('oldnew'))
dom.sortNewOld.addEventListener('click', () => sortPages('newold'))
dom.sortAZ.addEventListener('click', () => sortPages('az'))
dom.sortZA.addEventListener('click', () => sortPages('za'))
dom.renamePageTitleInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') dom.dialogRenamePageSave.click()
})

let isScrolling = false

dom.pageList.addEventListener('scroll', () => {
  if (isScrolling) return

  isScrolling = true

  requestAnimationFrame(() => {
    const openDropdowns = dom.els('.uk-dropdown.uk-open')

    if (openDropdowns.length > 0) {
      openDropdowns.forEach((el) => {
        const dropdown = UIkit.dropdown(el)

        if (dropdown) {
          dropdown.hide(0)
        }
      })
    }

    isScrolling = false
  })
})

if (isElectron) {
  // Import calculations from file
  dom.importPageButton.addEventListener('click', numara.importPage)

  numara.pageImported((data, msg, name) => {
    if (name) {
      dom.newPageTitleInput.value = name
    }

    newPage(true)
    dom.newPageTitleInput.value = ''
    cm.setValue(data)
    notify(msg, 'success')
  })
  numara.importDataError((error) => notify(error, 'danger'))
  numara.pageExported((msg) => notify(msg, 'success'))
  numara.exportDataError((error) => notify(error, 'danger'))
  numara.requestExportPage(() => {
    const pages = store.get('pages') || []
    const page = pages.find((p) => p.id === app.activePage)

    if (page) {
      numara.exportPage(getSafeFilename(page.name), page.data)
    }
  })

  // Print window from main
  numara.print(() => {
    UIkit.offcanvas('#sideBar').hide()
    window.print()
  })
} else {
  dom.els('#importPageButton').forEach((el) => el.remove())
}

dom.pageName.addEventListener('dblclick', () => {
  if (app.activePage) renamePage(app.activePage)
})

document.addEventListener('click', (event) => {
  if (justDraggedPage) return

  const loadButton = event.target.closest?.('[data-action="load"]')
  if (loadButton) {
    const pageId = loadButton.dataset.page

    loadPage(pageId)

    if (!app.sidebarDocked) {
      UIkit.offcanvas('#sideBar').hide()
    }

    return
  }

  const pageId = event.target?.dataset?.page
  const action = event.target?.dataset?.action

  if (action) {
    switch (action) {
      case 'rename':
        UIkit.dropdown(event.target.parentNode).hide(0)
        renamePage(pageId)
        break
      case 'delete':
        deletePage(pageId)
        break
      case 'duplicate':
        duplicatePage(pageId)
        UIkit.dropdown(event.target.parentNode).hide(0)
        break
      case 'export':
        if (isElectron) {
          const pages = store.get('pages')
          const page = pages.find((page) => page.id === pageId)

          numara.exportPage(getSafeFilename(page.name), page.data)
          UIkit.dropdown(event.target.parentNode).hide(0)
        }
    }
  }
})
