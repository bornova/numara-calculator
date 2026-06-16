import { dom } from '../dom'
import { cm } from '../editor/editor'
import { calculate, renderAnswersToHTML, syncOutputHeights } from '../eval'
import { confirm, modal, notify } from './modal'
import { app, isElectron, store } from '../utils'
import { escapeHTML } from '../coreUtils.js'
import { syncPageSave, syncPageRename, syncPageDelete } from '../sync'

import { DateTime } from 'luxon'

import UIkit from 'uikit'

// Side bar management
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 400
const SIDEBAR_DEFAULT_WIDTH = 240

/**
 * Adjusts the width styles for the sidebar panel, resize handles, and main app container.
 * @param {number} width - The width in pixels.
 */
function applySidebarWidth(width) {
  const bar = dom.el('#sidePanel .uk-offcanvas-bar')
  const resizer = dom.el('#sidePanelResizer')

  if (bar) {
    bar.style.width = `${width}px`
  }

  if (resizer) {
    resizer.style.left = `${width}px`
  }

  dom.appWrapper.style.left = `${width}px`
}

let sidePanelResizerSetup = false

/**
 * Binds mouse drag and double-click listeners on the side panel resizer bar.
 */
function setupSidePanelResizer() {
  if (sidePanelResizerSetup) return

  sidePanelResizerSetup = true

  const resizer = dom.el('#sidePanelResizer')

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

      store.set('sidePanelWidth', width)

      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      calculate()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  resizer.addEventListener('dblclick', () => {
    applySidebarWidth(SIDEBAR_DEFAULT_WIDTH)

    store.set('sidePanelWidth', SIDEBAR_DEFAULT_WIDTH)

    calculate()
  })
}

let lastDockState = null

/** Setup side panel based on settings and window size.
 *
 * @param {boolean} show - When true, ensure the docked panel is visible.
 *
 */
export function setupSidePanel(show = false) {
  const { pageListPosition } = app.settings
  const isWide = (window.visualViewport?.width ?? window.innerWidth) > 900
  const dock = pageListPosition === 'dock' || (pageListPosition === 'auto' && isWide)
  const dockChanged = dock !== lastDockState

  lastDockState = dock
  app.sidebarDocked = dock

  dom.sidePanel.classList.toggle('sidebar-docked', dock)
  dom.sidePanelButton.style.display = dock ? 'none' : ''
  dom.closeSidePanelButton.style.display = dock ? 'none' : ''
  dom.newPageButton.style.display = dock ? 'none' : ''
  dom.leftActionsDivider.style.display = dock ? 'none' : ''

  if (dock) {
    const width = store.get('sidePanelWidth') ?? SIDEBAR_DEFAULT_WIDTH

    applySidebarWidth(width)
    setupSidePanelResizer()

    const isVisible = dom.sidePanel.classList.contains('uk-open')

    if (!dockChanged && !(show && !isVisible)) return

    const offcanvas = UIkit.offcanvas('#sidePanel', {
      overlay: false,
      mode: 'none',
      escClose: false,
      bgClose: false
    })

    if (!isVisible && (show || dockChanged)) {
      if (document.querySelector('.uk-modal.uk-open')) {
        dom.sidePanel.classList.add('uk-open')
        dom.sidePanel.style.display = 'block'

        const bar = dom.el('#sidePanel .uk-offcanvas-bar')

        if (bar) {
          bar.classList.add('uk-open')
        }
      } else {
        offcanvas.show()
      }
    }
  } else {
    dom.appWrapper.style.left = '0'

    if (!dockChanged) return

    dom.sidePanel.classList.remove('uk-open')
    dom.sidePanel.style.display = ''

    const bar = dom.el('#sidePanel .uk-offcanvas-bar')

    if (bar) {
      bar.classList.remove('uk-open')
    }

    UIkit.offcanvas('#sidePanel', { overlay: true, mode: 'slide', escClose: true, bgClose: true })
  }
}

/**
 * Updates the active page name label display and hover titles in the header.
 * @param {string} name - The page name.
 * @param {string} pageId - The page ID timestamp string.
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
  const pageName =
    dom.newPageTitleInput.value.replace(/<|>/g, '').trim() || (isImport ? `Import #${pageId}` : getPageName())

  const pageNames = pages.map(({ name }) => name)

  if (pageNames.includes(pageName)) {
    notify(`"${pageName}" already exists. Please choose a different page name.`, 'danger')
    return
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

  while (pages.some((p) => p.name === dupPageName)) {
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
    }

    populatePages()
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
    populatePages()
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

    // Prevent duplicate page names
    if (pages.some((p) => p.name === newName && p.id !== pageId)) {
      notify(`"${newName}" already exists. Please choose a different page name.`, 'danger')
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
      app.activePage = store.get('lastPage')
      loadPage(app.activePage)
    }
  } else {
    defaultPage()
  }

  populatePages()
}

/**
 * Populate the page list in side bar.
 */
export function populatePages() {
  const pages = store.get('pages')

  if (!pages || pages.length === 0) defaultPage()

  // Clean up any orphaned UIkit dropdown DOM elements appended to <body> before clearing pageList
  document.querySelectorAll('body > .uk-dropdown').forEach((el) => el.remove())

  dom.pageList.innerHTML = ''

  pages.forEach((page) => {
    const pageListItem = document.createElement('div')

    pageListItem.id = page.id
    pageListItem.classList.add(
      'pageListItem',
      'uk-flex',
      'uk-flex-middle',
      app.activePage === page.id ? 'activePage' : 'inactivePage'
    )
    pageListItem.innerHTML = `
      <div class="uk-flex-1" data-action="load" data-page="${page.id}">
        <div class="pageListItemTitle" title="${escapeHTML(page.name)}">${escapeHTML(page.name)}</div>
        <div class="dialog-open-date">${DateTime.fromFormat(page.id, 'yyyyMMddHHmmssSSS').toFormat('FF')}</div>
      </div>
      <div class="uk-flex-right uk-margin-small-right">
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
export function pageOrder() {
  const pages = store.get('pages')
  const pageList = dom.els('#pageList > div')
  const orderedPages = [...pageList].map((el) => pages.find((page) => page.id === el.getAttribute('id')))

  store.set('pages', orderedPages)
}

/**
 * Show new page dialog.
 */
function newPageDialog() {
  dom.newPageTitleInput.value = ''
  dom.newPageTitleInput.focus()

  modal.show('#dialogNewPage')
}

dom.closeSidePanelButton.addEventListener('click', () => UIkit.offcanvas('#sidePanel').hide())
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

  numara.pageImported((data, msg) => {
    newPage(true)
    cm.setValue(data)
    notify(msg, 'success')
  })
  numara.importDataError((event, error) => notify(error, 'danger'))
  numara.pageExported((msg) => notify(msg, 'success'))
  numara.exportDataError((event, error) => notify(error, 'danger'))

  // Print window from main
  numara.print(() => {
    UIkit.offcanvas('#sidePanel').hide()
    window.print()
  })
} else {
  dom.els('#importPageButton, #spDivider').forEach((el) => el.remove())
}

dom.pageName.addEventListener('dblclick', () => {
  if (app.activePage) renamePage(app.activePage)
})

document.addEventListener('click', (event) => {
  const loadButton = event.target.closest?.('[data-action="load"]')
  if (loadButton) {
    const pageId = loadButton.dataset.page

    loadPage(pageId)

    if (!app.sidebarDocked) {
      UIkit.offcanvas('#sidePanel').hide()
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

          numara.exportPage(page.name, page.data)
          UIkit.dropdown(event.target.parentNode).hide(0)
        }
    }
  }
})
