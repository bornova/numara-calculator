import { DateTime, Settings } from 'luxon'
import UIkit from 'uikit'

Settings.defaultNumberingSystem = 'latn'
Settings.defaultOutputCalendar = 'iso8601'

import { calculate, debouncedSavePageState, renderAnswersToHTML, syncOutputHeights } from '../calc/calcManager.js'
import { escapeHTML, getSafeFilename } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm, debouncedSaveCursor } from '../editor/index.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import { confirm, modal, notify } from '../ui/dialogs.js'
import { setupPageIo } from './pageIo.js'
import { isPageDragging, setupPageListSort } from './pageSort.js'
import { syncPageDelete, syncPageRename, syncPageSave } from './sync.js'

let isScrolling = false
let lastGeneratedPageId = ''

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
  const pageDate = DateTime.fromFormat(pageId, 'yyyyMMddHHmmssSSS').toFormat('FF')
  const tooltipTitle = escapeHTML(`${name} - ${pageDate}`).replace(/;/g, '&#59;')

  dom.pageName.textContent = name
  dom.pageName.removeAttribute('title')
  dom.pageName.setAttribute('uk-tooltip', `title: ${tooltipTitle}; pos: bottom-left; delay: 1000`)
}

/**
 * Show new page dialog.
 */
function newPageDialog() {
  dom.newPageTitleInput.value = ''
  dom.newPageTitleInput.focus()

  modal.show('#dialogNewPage')
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
  const pageId = generatePageId()
  const pages = store.get('pages') || []
  const rawTitle = isImport ? importName || dom.newPageTitleInput.value : dom.newPageTitleInput.value
  let pageName = rawTitle.replace(/<|>/g, '').trim() || (isImport ? `Import #${pageId}` : getPageName())
  const pageData = isImport ? importData : ''

  const sanitizedNew = getSafeFilename(pageName)

  if (pages.some((p) => getSafeFilename(p.name).toLowerCase() === sanitizedNew.toLowerCase())) {
    if (isImport) {
      pageName = getUniquePageName(pages, pageName)
    } else {
      notify(
        `"${escapeHTML(pageName)}" (or a page with a conflicting file name) already exists. Please choose a different page name.`,
        'danger'
      )

      return
    }
  }

  app.activePage = pageId

  pages.push({ id: pageId, name: pageName, data: pageData })

  store.set('pages', pages)
  store.set('lastPage', pageId)

  loadPage(pageId)
  syncPageSave(pageName, pageData)

  const hidePromises = [modal.hide('#dialogNewPage')]

  if (!app.sidebarDocked) {
    hidePromises.push(UIkit.offcanvas('#sideBar').hide())
  }

  Promise.all(hidePromises).then(() => {
    cm.focus()
  })
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

  if (!app.sidebarDocked) {
    UIkit.offcanvas('#sideBar')
      .hide()
      .then(() => {
        cm.focus()
      })
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
 * Rename page.
 * @param {string} pageId Id of the page to rename.
 */
function renamePage(pageId) {
  debouncedSavePageState.flush()
  const pages = store.get('pages') || []
  const page = pages.find((p) => p.id === pageId)

  if (!page) return

  dom.renamePageTitleInput.value = page.name
  dom.dialogRenamePageSave.disabled = !page.name.trim()

  modal.show('#dialogRenamePage')

  function newListener() {
    const newName = dom.renamePageTitleInput.value.replace(/<|>/g, '').trim()

    if (!newName) return

    const currentPages = store.get('pages') || []
    const targetPage = currentPages.find((p) => p.id === pageId)

    if (!targetPage) return

    const sanitizedNew = getSafeFilename(newName)

    // Prevent duplicate page names
    if (
      currentPages.some((p) => getSafeFilename(p.name).toLowerCase() === sanitizedNew.toLowerCase() && p.id !== pageId)
    ) {
      notify(
        `"${escapeHTML(newName)}" (or a page with a conflicting file name) already exists. Please choose a different page name.`,
        'danger'
      )

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

    modal.hide('#dialogRenamePage')
  }

  dom.dialogRenamePageSave.onclick = newListener
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
 * Populate the page list in side bar.
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

    const pageDate = DateTime.fromFormat(page.id, 'yyyyMMddHHmmssSSS').toFormat('FF')

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
      </div>
    `

    dom.pageList.appendChild(pageListItem)
  })
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
  dom.closeSideBarButton.addEventListener('click', () => UIkit.offcanvas('#sideBar').hide())
  dom.newPageButton.addEventListener('click', newPageDialog)
  dom.newPageButtonSB.addEventListener('click', newPageDialog)
  dom.dialogNewPageSave.addEventListener('click', () => newPage(false))

  dom.newPageTitleInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
      dom.dialogNewPageSave.click()
    }
  })

  dom.sortOldNew.addEventListener('click', () => sortPages('oldnew'))
  dom.sortNewOld.addEventListener('click', () => sortPages('newold'))
  dom.sortAZ.addEventListener('click', () => sortPages('az'))
  dom.sortZA.addEventListener('click', () => sortPages('za'))

  dom.renamePageTitleInput.addEventListener('input', () => {
    dom.dialogRenamePageSave.disabled = !dom.renamePageTitleInput.value.replace(/<|>/g, '').trim()
  })

  dom.renamePageTitleInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter' && !dom.dialogRenamePageSave.disabled) {
      dom.dialogRenamePageSave.click()
    }
  })

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

  dom.pageName.addEventListener('click', () => {
    if (!app.sidebarDocked) {
      UIkit.tooltip(dom.pageName)?.hide()
      UIkit.offcanvas('#sideBar').toggle()
    }
  })

  dom.pageName.addEventListener('dblclick', () => {
    if (app.sidebarDocked && app.activePage) {
      renamePage(app.activePage)
    }
  })

  document.addEventListener('click', (event) => {
    if (isPageDragging()) return

    const actionTarget = event.target.closest?.('[data-action]')
    if (!actionTarget) return

    const { page: pageId, action } = actionTarget.dataset

    switch (action) {
      case 'load':
        if (!app.sidebarDocked) {
          UIkit.offcanvas('#sideBar').hide()
        }

        loadPage(pageId)
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
    }
  })
}

/**
 * Initializes pages from storage, sets up drag sorting, file I/O, and page UI events.
 */
export function initializePages() {
  setupPageListSort()
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
