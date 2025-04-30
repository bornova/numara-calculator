import { app, store } from './common'
import { dom } from './dom'
import { cm } from './editor'
import { generateIcons } from './icons'
import { confirm, modal, notify } from './modal'
import { isElectron } from './utils'

import { DateTime } from 'luxon'

import UIkit from 'uikit'

/**
 * Migrate old saved calculations to pages.
 */
export function migrateSaved() {
  const saved = store.get('saved')
  const pages = store.get('pages')

  if (saved) {
    Object.entries(saved).forEach(([id, val]) => {
      pages.push({ id, name: val[0], data: val[1] })
    })

    store.set('pages', pages)
    localStorage.removeItem('saved')
  }
}

/**
 * Get page name/number to use.
 * @returns {string} The page name.
 */
export function getPageName() {
  const pages = store.get('pages')
  let pageNo = 1

  if (pages) {
    const regex = new RegExp(/\b(Page \d+)$\b/)
    const pageNos = pages
      .filter((page) => regex.test(page.name.trim()))
      .map((page) => +page.name.split(' ')[1])
      .sort((a, b) => a - b)

    const max = Math.max(...pageNos)

    if (pageNos[0] === 1) {
      for (let i = 0; i < max; i++) {
        if (pageNos[i + 1] !== pageNos[i] + 1) {
          pageNo = pageNos[i] + 1
          break
        }
      }
    }
  }

  return 'Page ' + pageNo
}

/**
 * Get last page from store.
 * @returns {string} The last page ID.
 */
export const lastPage = () => store.get('lastPage')

/**
 * Populate the page list in side bar.
 */
export function populatePages() {
  const pages = store.get('pages')

  if (!pages || pages.length === 0) {
    defaultPage()
  }

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
      <div class="uk-flex-1" data-action="load">
        <div id="page-${page.id}" class="pageListItemTitle" title="${page.name}">${page.name}</div>
        <div class="dialog-open-date">${DateTime.fromFormat(page.id, 'yyyyMMddHHmmssSSS').toFormat('FF')}</div>
      </div>
      <div class="uk-flex-right uk-margin-small-right">
        <span class="drop-parent-icon"><i data-lucide="ellipsis-vertical"></i></span>
        <div uk-dropdown="mode: click; pos: right-top; bg-scroll: false; close-on-scroll: true">
          <div class="renamePageButton uk-flex uk-flex-column" data-action="rename" title="Rename">Rename</div>
          <div class="dupPageButton uk-flex uk-flex-column" data-action="duplicate" title="Duplicate">Duplicate</div>
          <div class="deletePageButton uk-flex uk-flex-column" data-action="delete" title="Delete">Delete</div>
        </div>
      </div>
    `

    pageListItem.addEventListener('click', (event) => {
      if (event.target.parentNode.dataset.action === 'load') {
        loadPage(page.id)
        UIkit.offcanvas('#sidePanel').hide()
      }

      switch (event.target.dataset.action) {
        case 'rename':
          UIkit.dropdown(event.target.parentNode).hide(0)
          renamePage(page.id)
          break
        case 'delete':
          deletePage(page.id)
          break
        case 'duplicate':
          duplicatePage(page.id)
          break
      }
    })

    dom.pageList.appendChild(pageListItem)
  })

  generateIcons()
}

/**
 * Load page.
 * @param {string} pageId Id of the page to load.
 */
export function loadPage(pageId) {
  const page = store.get('pages').find((page) => page.id === pageId)
  const cursor = page.cursor

  app.activePage = pageId
  store.set('lastPage', pageId)

  dom.pageName.innerHTML = page.name
  dom.pageName.title = page.name

  cm.setValue(page.data)

  if (page.history) {
    cm.setHistory(page.history)
  }

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
    dom.newPageTitleInput.value.replace(/<|>/g, '').trim() || (isImport ? 'Imported page' : getPageName())

  const pageNames = pages.map((p) => p.name)

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
 * Delete page.
 * @param {string} pageId Id of the page to delete.
 */
export function deletePage(pageId) {
  let pages = store.get('pages')

  confirm('"' + pages.find((page) => page.id === pageId).name + '" will be deleted.', () => {
    pages = pages.filter((page) => page.id !== pageId)

    store.set('pages', pages)

    if (pages.length === 0) {
      defaultPage()
    } else if (pageId === app.activePage) {
      loadPage(pages.pop().id)
    }

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
  const newListener = function rename() {
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
    dom.dialogRenamePageSave.removeEventListener('click', newListener)
    modal.hide('#dialogRenamePage')
  }

  dom.dialogRenamePageSave.addEventListener('click', newListener)
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
  let dupPageName = dupPage.name + ' (copy)'
  // Ensure unique name for duplicate
  const baseName = dupPage.name + ' (copy)'
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
 * Sort page list.
 * @param {string} by Sort by argument - oldnew | newold | az | za
 */
export function sortPages(by) {
  const pages = store.get('pages')
  let sortedPages

  switch (by) {
    case 'oldnew':
      sortedPages = [...pages].sort((a, b) => a.id.localeCompare(b.id))
      break
    case 'newold':
      sortedPages = [...pages].sort((a, b) => b.id.localeCompare(a.id))
      break
    case 'az':
      sortedPages = [...pages].sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'za':
      sortedPages = [...pages].sort((a, b) => b.name.localeCompare(a.name))
      break
    default:
      sortedPages = pages
  }

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
 * Show new page dialog.
 */
function newPageDialog() {
  dom.newPageTitleInput.value = ''
  dom.newPageTitleInput.focus()

  modal.show('#dialogNewPage')
}

// Event listeners
dom.newPageButton.addEventListener('click', newPageDialog)
dom.newPageButtonSP.addEventListener('click', newPageDialog)
dom.dialogNewPageSave.addEventListener('click', () => {
  newPage(false)
})
dom.newPageTitleInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter' || event.keyCode === 13) {
    dom.dialogNewPageSave.click()
  }
})
dom.deleteAllPagesButton.addEventListener('click', deleteAllPages)
dom.renamePageTitleInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter' || event.keyCode === 13) {
    dom.dialogRenamePageSave.click()
  }
})
dom.sortOldNew.addEventListener('click', () => {
  sortPages('oldnew')
})
dom.sortNewOld.addEventListener('click', () => {
  sortPages('newold')
})
dom.sortAZ.addEventListener('click', () => {
  sortPages('az')
})
dom.sortZA.addEventListener('click', () => {
  sortPages('za')
})
dom.closeSidePanelButton.addEventListener('click', () => {
  UIkit.offcanvas('#sidePanel').hide()
})
dom.printButton.addEventListener('click', () => {
  window.print()
})

if (isElectron) {
  // Import calculations from file
  dom.importButton.addEventListener('click', numara.import)

  numara.importData((event, data, msg) => {
    newPage(true)
    cm.setValue(data)
    notify(msg, 'success')
  })

  numara.importDataError((event, error) => {
    notify(error, 'danger')
  })

  numara.main.import(numara.import)

  // Export calculations to file
  dom.exportButton.addEventListener('click', () => {
    const pages = store.get('pages')
    const page = pages.find((page) => page.id === app.activePage).name
    numara.export(page, cm.getValue())
  })

  numara.exportData((event, msg) => {
    notify(msg, 'success')
  })

  numara.exportDataError((event, error) => {
    notify(error, 'danger')
  })

  numara.main.export(() => {
    numara.export(dom.newPageTitleInput.value, cm.getValue())
  })

  // Print window from main
  numara.main.print(() => {
    UIkit.offcanvas('#sidePanel').hide()
    window.print()
  })
} else {
  dom.els('#exportButton, #importButton, #spDivider').forEach((el) => el.remove())
}
