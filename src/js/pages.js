import { dom } from './dom'
import { cm } from './editor'
import { confirm, modal, notify } from './modal'
import { app, isElectron, store } from './utils'

import { DateTime } from 'luxon'

import UIkit from 'uikit'

/**
 * Get page name/number to use.
 * @returns {string} The page name.
 */
export function getPageName() {
  const pages = store.get('pages') || []
  const usedNumbers = new Set(
    pages.map((page) => Number(page.name.trim().replace(/^Page (\d+)$/, '$1')) || null).filter((n) => n !== null)
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
  localStorage.removeItem('input')

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

  dom.pageName.innerHTML = pageName

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
  const baseName = dupPage.name + ' (copy)'
  let dupPageName = baseName
  let count = 1

  while (pages.some((p) => p.name === dupPageName)) {
    dupPageName = `${baseName} ${count++}`
  }

  app.activePage = dupPageId
  pages.push({ id: dupPageId, name: dupPageName, data: dupPageData })
  store.set('pages', pages)

  loadPage(dupPageId)
}

/**
 * Delete page.
 * @param {string} pageId Id of the page to delete.
 */
export function deletePage(pageId) {
  let pages = store.get('pages')
  const pageName = pages.find((page) => page.id === pageId).name

  confirm(`"${pageName}" will be deleted.`, () => {
    pages = pages.filter((page) => page.id !== pageId)

    store.set('pages', pages)

    if (pages.length === 0) {
      defaultPage()
    } else if (pageId === app.activePage) {
      loadPage(pages[pages.length - 1].id)
    }

    populatePages()
  })
}

/**
 * Delete all pages.
 */
export function deleteAllPages() {
  confirm('All pages will be deleted permanently.', () => {
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

    page.name = newName
    store.set('pages', pages)

    populatePages()

    dom.pageName.innerHTML = page.name

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
  const { name, data, history, cursor } = page

  app.activePage = pageId
  store.set('lastPage', pageId)

  dom.pageName.innerHTML = name
  dom.pageName.title = name

  cm.setValue(data)

  if (history) cm.setHistory(history)

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
        <div class="pageListItemTitle" title="${page.name}">${page.name}</div>
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
  if (event.key === 'Enter') dom.dialogNewPageSave.click()
})
dom.deleteAllPagesButton.addEventListener('click', deleteAllPages)
dom.sortOldNew.addEventListener('click', () => sortPages('oldnew'))
dom.sortNewOld.addEventListener('click', () => sortPages('newold'))
dom.sortAZ.addEventListener('click', () => sortPages('az'))
dom.sortZA.addEventListener('click', () => sortPages('za'))
dom.renamePageTitleInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') dom.dialogRenamePageSave.click()
})

dom.pageList.addEventListener('scroll', () => {
  dom.els('.uk-dropdown').forEach((el) => {
    const dropdown = UIkit.dropdown(el)

    if (dropdown) dropdown.hide(0)
  })
})

if (isElectron) {
  // Import calculations from file
  dom.importPageButton.addEventListener('click', numara.importPage)

  numara.importData((event, data, msg) => {
    newPage(true)
    cm.setValue(data)
    notify(msg, 'success')
  })

  numara.importDataError((event, error) => notify(error, 'danger'))
  numara.main.importPage(numara.importPage)

  numara.exportData((event, msg) => notify(msg, 'success'))
  numara.exportDataError((event, error) => notify(error, 'danger'))
  numara.main.exportPage(() => numara.exportPage(dom.newPageTitleInput.value, cm.getValue()))

  // Print window from main
  numara.main.print(() => {
    UIkit.offcanvas('#sidePanel').hide()
    window.print()
  })
} else {
  dom.els('#importPageButton, #spDivider').forEach((el) => el.remove())
}

document.addEventListener('click', (event) => {
  if (event.target.parentNode?.dataset?.action === 'load') {
    let pageId = event.target.parentNode.parentNode.id
    loadPage(pageId)
    UIkit.offcanvas('#sidePanel').hide()
    return
  }

  let pageId = event.target?.dataset?.page

  switch (event.target.dataset.action) {
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
})
