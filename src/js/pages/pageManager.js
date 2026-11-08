import { DateTime, Settings } from 'luxon'
import UIkit from 'uikit'

Settings.defaultNumberingSystem = 'latn'
Settings.defaultOutputCalendar = 'iso8601'

import { calculate, debouncedSavePageState, renderAnswersToHTML, syncOutputHeights } from '../calc/calcManager.js'
import { escapeHTML, getSafeFilename, sanitizePageName } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm, debouncedSaveCursor } from '../editor/index.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import { confirm, hideOpenDropdowns, notify } from '../ui/dialogs.js'
import { updatePageListScroll } from '../ui/pageList.js'
import { setupPageIo } from './pageIo.js'
import { isPageDragging, setupPageListSort, setupPageTabsSort } from './pageSort.js'
import {
  attachInlineRenameInput,
  hideTabContextMenu,
  populatePageTabs,
  renameTab,
  setupPageTabsEvents,
  togglePageListContextMenu
} from './pageTabs.js'
import { syncPageDelete, syncPageRename, syncPageSave } from './sync.js'

let isScrolling = false
let lastGeneratedPageId = ''
let pageNameFlashTimer = null

/**
 * Triggers a subtle highlight flash on the active page name or tab when a page is created.
 */
function flashPageName() {
  const target =
    app.settings.pageListPosition === 'tabs' ? dom.pageTabs?.querySelector('.pageTab.activeTab') : dom.pageName

  if (!target) return

  clearTimeout(pageNameFlashTimer)
  target.classList.remove('page-created')
  void target.offsetWidth
  target.classList.add('page-created')

  pageNameFlashTimer = setTimeout(() => {
    target.classList.remove('page-created')
  }, 650)
}

/**
 * Formats a 17-digit page timestamp ID into a localized date/time string.
 * @param {string} pageId The page ID timestamp string.
 * @returns {string} Formatted date string.
 */
function formatPageDate(pageId) {
  return DateTime.fromFormat(pageId, 'yyyyMMddHHmmssSSS').toFormat('FF')
}

/**
 * Generates a unique 17-digit timestamp page ID (`yyyyMMddHHmmssSSS`),
 * guaranteeing strictly increasing uniqueness across rapid calls.
 * @returns {string} The unique page ID.
 */
export function generatePageId() {
  let pageId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')

  if (pageId <= lastGeneratedPageId) {
    const nextDt = DateTime.fromFormat(lastGeneratedPageId, 'yyyyMMddHHmmssSSS').plus({ milliseconds: 1 })

    pageId = nextDt.isValid
      ? nextDt.toFormat('yyyyMMddHHmmssSSS')
      : String(BigInt(lastGeneratedPageId) + 1n).padStart(17, '0')
  }

  lastGeneratedPageId = pageId

  return pageId
}

/**
 * Updates the active page name label display and tooltip in the bottom bar.
 * @param {string} name The page name.
 * @param {string} pageId The page ID timestamp string.
 */
export function updatePageName(name, pageId) {
  const pageDate = formatPageDate(pageId)
  const tooltipTitle = escapeHTML(`${name} - ${pageDate}`).replace(/;/g, '&#59;')

  dom.pageName.textContent = name
  dom.pageName.removeAttribute('title')
  dom.pageName.setAttribute('uk-tooltip', `title: ${tooltipTitle}; delay: 1000`)
}

/**
 * Get page name/number to use.
 * @returns {string} The page name.
 */
function getPageName() {
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
  const pageId = generatePageId()
  const pageName = getPageName()

  store.set('pages', [{ id: pageId, name: pageName, data: '' }])

  loadPage(pageId)
}

/**
 * Returns a unique page name that does not conflict with existing pages' safe filenames.
 * @param {Array<{name: string}>} pages Existing pages list.
 * @param {string} baseName Initial candidate name.
 * @returns {string} A non-conflicting page name.
 */
function getUniquePageName(pages, baseName) {
  let candidate = baseName
  let count = 1

  while (pages.some((p) => getSafeFilename(p.name).toLowerCase() === getSafeFilename(candidate).toLowerCase())) {
    candidate = `${baseName} (${count++})`
  }

  return candidate
}

/**
 * Create new page.
 * @param {boolean} [isImport=false] Whether the new page is imported.
 * @param {string} [importName=''] Imported page name when `isImport` is true.
 * @param {string} [importData=''] Imported page content when `isImport` is true.
 */
export function newPage(isImport = false, importName = '', importData = '') {
  debouncedSavePageState.flush()
  debouncedSaveCursor.flush()

  if (app.activePage) {
    app.pageHistory.set(app.activePage, cm.getHistory())
  }

  hideTabContextMenu()
  hideOpenDropdowns()
  UIkit.tooltip(app.pageListDocked ? dom.newPageButtonPL : dom.newPageButton)?.hide()

  const pageId = generatePageId()
  const pages = store.get('pages') || []
  const baseName = sanitizePageName(isImport ? importName : '', isImport ? `Import #${pageId}` : getPageName())
  const pageName = getUniquePageName(pages, baseName)
  const pageData = isImport ? importData : ''

  app.activePage = pageId

  pages.push({ id: pageId, name: pageName, data: pageData })

  store.set('pages', pages)
  store.set('lastPage', pageId)

  loadPage(pageId)
  syncPageSave(pageName, pageData)

  if (!app.pageListDocked && dom.pageListPanel.classList.contains('uk-open')) {
    UIkit.offcanvas('#pageListPanel')
      .hide()
      .then(() => {
        flashPageName()
        cm.focus()
      })
  } else {
    flashPageName()
    cm.focus()
  }
}

/**
 * Duplicate page.
 * @param {string} pageId Id of the page to duplicate.
 */
function duplicatePage(pageId) {
  debouncedSavePageState.flush()

  const dupPageId = generatePageId()
  const pages = store.get('pages')
  const dupPage = pages.find((page) => page.id === pageId)

  if (!dupPage) {
    notify('Page not found.', 'danger')
    return
  }

  const dupPageData = dupPage.data
  const dupPageName = getUniquePageName(pages, `${dupPage.name} - Copy`)

  app.activePage = dupPageId
  pages.push({ id: dupPageId, name: dupPageName, data: dupPageData })
  store.set('pages', pages)

  loadPage(dupPageId)
  syncPageSave(dupPageName, dupPageData)

  if (!app.pageListDocked && dom.pageListPanel.classList.contains('uk-open')) {
    UIkit.offcanvas('#pageListPanel')
      .hide()
      .then(() => {
        flashPageName()
        cm.focus()
      })
  } else {
    flashPageName()
  }
}

/**
 * Delete page.
 * @param {string} pageId Id of the page to delete.
 */
function deletePage(pageId) {
  debouncedSavePageState.flush()

  let pages = store.get('pages')
  const found = pages.find((page) => page.id === pageId)

  if (!found) return

  const pageName = found.name

  confirm(`"${pageName}" will be deleted.`, () => {
    debouncedSavePageState.flush()
    app.pageHistory.delete(pageId)
    app.pageAnswers.delete(pageId)
    pages = store.get('pages').filter((page) => page.id !== pageId)

    store.set('pages', pages)

    if (pages.length === 0) {
      app.activePage = null
      defaultPage()
    } else if (pageId === app.activePage) {
      app.activePage = null
      loadPage(pages[pages.length - 1].id)
    } else {
      populatePages()
    }

    syncPageDelete(pageName)
  })
}

/**
 * Validates and commits a renamed page title to storage and sync.
 * @param {string} pageId Id of the page being renamed.
 * @param {string} originalName Original page name.
 * @param {string} rawInput Raw user input string.
 * @param {boolean} save Whether to commit or cancel.
 */
function commitPageRename(pageId, originalName, rawInput, save) {
  const newName = sanitizePageName(rawInput)

  if (!save || !newName || newName === originalName) {
    populatePages()
    return
  }

  const currentPages = store.get('pages') || []
  const targetPage = currentPages.find((p) => p.id === pageId)

  if (!targetPage) {
    populatePages()
    return
  }

  const sanitizedNew = getSafeFilename(newName)

  if (
    currentPages.some((p) => getSafeFilename(p.name).toLowerCase() === sanitizedNew.toLowerCase() && p.id !== pageId)
  ) {
    notify(
      `"${escapeHTML(newName)}" (or a page with a conflicting file name) already exists. Please choose a different page name.`,
      'danger'
    )
    populatePages()
    return
  }

  const oldName = targetPage.name

  targetPage.name = newName
  store.set('pages', currentPages)

  populatePages()

  if (pageId === app.activePage) {
    updatePageName(targetPage.name, pageId)
  }

  syncPageRename(oldName, newName)
}

/**
 * Rename page inline within the page list.
 * @param {string} pageId Id of the page to rename.
 */
function renamePage(pageId) {
  debouncedSavePageState.flush()

  const pages = store.get('pages') || []
  const page = pages.find((p) => p.id === pageId)

  if (!page) return

  const itemEl = document.getElementById(pageId)
  const titleEl = itemEl?.querySelector('.pageListItemTitle')

  if (!itemEl || !titleEl || itemEl.classList.contains('is-renaming')) return

  const itemHeight = itemEl.offsetHeight
  const titleHeight = titleEl.offsetHeight

  itemEl.scrollIntoView({ block: 'nearest' })
  itemEl.style.boxSizing = 'border-box'
  itemEl.style.height = `${itemHeight}px`
  itemEl.classList.add('is-renaming')

  const { input, finish } = attachInlineRenameInput(titleEl, page.name, 'pageListRenameInput', (rawValue, save) =>
    commitPageRename(pageId, page.name, rawValue, save)
  )
  input.style.height = `${titleHeight}px`

  const saveBtn = document.createElement('span')
  saveBtn.className = 'savePageButton uk-flex-right uk-margin-small-right'
  saveBtn.title = 'Save page name'
  saveBtn.innerHTML = dom.icons.Save

  itemEl.appendChild(saveBtn)
  input.focus()
  input.select()

  saveBtn.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })

  saveBtn.addEventListener('click', (event) => {
    event.stopPropagation()
    finish(true)
  })
}

/**
 * Load page.
 * @param {string} pageId Id of the page to load.
 */
export function loadPage(pageId) {
  if (app.activePage && app.activePage !== pageId) {
    app.pageHistory.set(app.activePage, cm.getHistory())
    debouncedSavePageState.flush()
    debouncedSaveCursor.flush()
  }

  const page = store.get('pages').find((p) => p.id === pageId)

  if (!page) {
    notify('Page not found.', 'danger')
    return
  }

  const { name, data, cursor, folds } = page
  const history = app.pageHistory.get(pageId) || page.history
  const answers = app.pageAnswers.get(pageId) || page.answers

  if (page.history && !app.pageHistory.has(pageId)) {
    app.pageHistory.set(pageId, page.history)
  }

  if (page.answers && !app.pageAnswers.has(pageId)) {
    app.pageAnswers.set(pageId, page.answers)
  }

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

  if (history) {
    cm.setHistory(history)
  } else {
    cm.clearHistory()
  }

  if (folds && folds.length > 0) {
    for (const fold of folds) {
      if (typeof fold.from === 'number') {
        cm.foldCode({ line: fold.from, ch: 0 }, null, 'fold')
      }
    }
  }

  if (cursor) {
    cm.setCursor(cursor)
  } else {
    cm.execCommand('goDocEnd')
  }

  app.loadingPage = false

  if (answers && answers.length > 0 && app.settings.answerPosition !== 'bottom') {
    syncOutputHeights()
  }

  calculate()
  populatePages()
  cm.focus()

  const targetCursor = cm.getCursor()

  setTimeout(() => {
    try {
      cm.scrollIntoView({ ch: targetCursor.ch, line: targetCursor.line + 1 })
    } catch {
      cm.scrollIntoView(targetCursor)
    }

    cm.focus()
  }, 100)
}

/**
 * Populate the page list and bottom-bar page tabs.
 */
export function populatePages() {
  const pages = store.get('pages')

  if (!pages || pages.length === 0) {
    defaultPage()
    return
  }

  dom.pageList.innerHTML = ''

  pages.forEach((page) => {
    const pageListItem = document.createElement('div')

    pageListItem.id = page.id
    pageListItem.classList.add('pageListItem', 'uk-flex', 'uk-flex-middle')

    if (app.activePage === page.id) {
      pageListItem.classList.add('activePage')
    }

    const pageDate = formatPageDate(page.id)

    pageListItem.innerHTML = `
      <div class="uk-flex-1" data-action="load" data-page="${page.id}">
        <div class="pageListItemTitle" title="${escapeHTML(page.name)} - ${pageDate}">${escapeHTML(page.name)}</div>
      </div>
      <div class="pageItemActions uk-flex-right uk-margin-small-right">
        <span
          class="renamePageButton"
          data-page="${page.id}"
          data-action="rename"
          title="Rename page">${dom.icons.Pencil}</span>
        <span
          class="dupPageButton"
          data-page="${page.id}"
          data-action="duplicate"
          title="Duplicate page">${dom.icons.CopyPlus}</span>
        <span
          class="deletePageButton"
          data-page="${page.id}"
          data-action="delete"
          title="Delete page">${dom.icons.Trash2}</span>
        <span
          class="pageMenuButton"
          data-page="${page.id}"
          data-action="pageMenu"
          title="Page actions">${dom.icons.EllipsisVertical}</span>
      </div>
    `

    dom.pageList.appendChild(pageListItem)
  })

  updatePageListScroll()
  populatePageTabs(pages, formatPageDate)
}

/**
 * Sort page list.
 * @param {string} by Sort by argument - oldnew | newold | az | za
 */
function sortPages(by) {
  debouncedSavePageState.flush()
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
 * Binds UI event listeners for page creation, sorting, renaming, and list actions.
 */
function setupPageEvents() {
  dom.closePageListButton.addEventListener('click', () => UIkit.offcanvas('#pageListPanel').hide())
  dom.newPageButton.addEventListener('click', () => newPage(false))
  dom.newPageButtonPL.addEventListener('click', () => newPage(false))

  dom.sortOldNew.addEventListener('click', () => sortPages('oldnew'))
  dom.sortNewOld.addEventListener('click', () => sortPages('newold'))
  dom.sortAZ.addEventListener('click', () => sortPages('az'))
  dom.sortZA.addEventListener('click', () => sortPages('za'))

  dom.pageList.addEventListener('dblclick', (event) => {
    const itemEl = event.target.closest('.pageListItem')

    if (itemEl && !event.target.closest('.pageItemActions')) {
      renamePage(itemEl.id)
    }
  })

  dom.pageList.addEventListener('scroll', () => {
    if (isScrolling) return

    isScrolling = true

    requestAnimationFrame(() => {
      hideTabContextMenu()
      hideOpenDropdowns()
      isScrolling = false
    })
  })

  dom.pageName.addEventListener('click', () => {
    if (!app.pageListDocked) {
      UIkit.tooltip(dom.pageName)?.hide()
      UIkit.offcanvas('#pageListPanel').toggle()
    }
  })

  setupPageTabsEvents({
    onRename: (pageId) => renameTab(pageId, commitPageRename),
    onRenamePage: renamePage,
    onDuplicate: duplicatePage,
    onDelete: deletePage
  })

  document.addEventListener('click', (event) => {
    if (isPageDragging()) return

    const actionTarget = event.target.closest?.('[data-action]')
    if (!actionTarget) return

    const { page: pageId, action } = actionTarget.dataset

    switch (action) {
      case 'load':
        if (!app.pageListDocked) {
          UIkit.offcanvas('#pageListPanel').hide()
        }

        if (pageId !== app.activePage) {
          loadPage(pageId)
        }
        break
      case 'loadTab':
        if (pageId !== app.activePage) {
          loadPage(pageId)
        }
        break
      case 'rename':
        renamePage(pageId)
        break
      case 'delete':
        deletePage(pageId)
        break
      case 'duplicate':
        duplicatePage(pageId)
        break
      case 'pageMenu':
        togglePageListContextMenu(pageId, actionTarget)
        break
    }
  })
}

/**
 * Initializes pages from storage, sets up drag sorting, file I/O, and page UI events.
 */
export function initializePages() {
  setupPageListSort()
  setupPageTabsSort()
  setupPageEvents()
  setupPageIo()

  const pages = store.get('pages')

  if (pages) {
    if (app.settings.newPageOnStart) {
      const blankPage = pages.find((page) => page.data === '')

      if (blankPage) {
        app.activePage = blankPage.id
        loadPage(blankPage.id)
      } else {
        newPage()
      }
    } else {
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
