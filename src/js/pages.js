import { $, $all, app, store } from './common'
import { cm } from './editor'
import { generateIcons } from './icons'
import { confirm, notify, showModal } from './modal'
import { isElectron } from './utils'

import { DateTime } from 'luxon'

import UIkit from 'uikit'

/** Generate default page */
export function defaultPage() {
  const pageId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')

  app.activePage = pageId

  store.set('lastPage', pageId)
  store.set('pages', [{ id: pageId, title: 'Untitled page', data: '' }])

  cm.setValue(store.get('input') || '')

  $('#pageName').innerHTML = 'Untitled page'
}

/** Get last page from store */
export function lastPage() {
  return store.get('lastPage')
}

/**
 * Create new page
 *
 * @param {boolean} isImport Is the new page imported? true | false
 */
export function newPage(isImport) {
  const id = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
  const pages = store.get('pages')
  const title =
    $('#newPageTitleInput').value.replace(/<|>/g, '').trim() || (isImport ? 'Imported page' : 'Untitled page')

  app.activePage = id

  pages.push({ id, title, data: '' })

  store.set('pages', pages)

  cm.setValue('')

  populatePages()

  $('#pageName').innerHTML = title

  UIkit.modal('#dialog-newPage').hide()
}

/**
 * Load page
 *
 * @param {*} pageId Id of the page to load
 */
export function loadPage(pageId) {
  const page = store.get('pages').find((page) => page.id === pageId)
  const cursor = page.cursor

  app.activePage = pageId

  store.set('lastPage', pageId)

  $('#pageName').innerHTML = page.title

  cm.setValue(page.data)
  cm.setHistory(page?.history)
  cm.focus()

  if (cursor) {
    cm.setCursor(cursor)
  }

  populatePages()
}

/** Populate the page list in side bar */
export function populatePages() {
  const pages = store.get('pages')

  if (!pages || pages.length === 0) {
    defaultPage()
  }

  $('#pageList').innerHTML = ''

  pages.forEach((page) => {
    const pageListItem = document.createElement('div')

    pageListItem.id = page.id
    pageListItem.classList.add(
      'pageListItem',
      'uk-flex-middle',
      app.activePage === page.id ? 'activePage' : 'inactivePage'
    )
    pageListItem.innerHTML = `
      <div class="uk-flex-1" data-action="load">
        <div id="page-${page.id}"class="pageListItemTitle" title="${page.title}">${page.title}</div>
        <div class="dialog-open-date">${DateTime.fromFormat(page.id, 'yyyyMMddHHmmssSSS').toFormat('FF')}</div>
      </div>
      <div class="uk-flex-right uk-margin-small-right">
        <span class="drop-parent-icon"><i data-lucide="ellipsis-vertical"></i></span>
        <div uk-dropdown="mode: click; pos: left-top; offset: 0; bg-scroll: false; close-on-scroll: true">
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

    $('#pageList').appendChild(pageListItem)
  })

  sortPages()

  generateIcons()
}

/**
 * Delete page
 *
 * @param {*} pageId Id of the page to delete
 */
export function deletePage(pageId) {
  let pages = store.get('pages')

  confirm('"' + pages.find((page) => page.id === pageId).title + '" will be deleted.', () => {
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
 * Rename page
 *
 * @param {*} pageId Id of the page to rename
 */
export function renamePage(pageId) {
  const pages = store.get('pages')
  const page = pages.find((page) => page.id === pageId)

  $('#renamePageTitleInput').value = page.title

  showModal('#dialog-renamePage')

  function rename() {
    page.title = $('#renamePageTitleInput').value.replace(/<|>/g, '').trim() || 'Untitled page'

    store.set('pages', pages)

    populatePages()

    $('#pageName').innerHTML = page.title

    UIkit.modal('#dialog-renamePage').hide()

    $('#dialog-renamePage-save').removeEventListener('click', rename)
  }

  $('#dialog-renamePage-save').addEventListener('click', rename)
}

/**
 * Duplicate page
 *
 * @param {*} pageId Id of the page to duplicate
 */
export function duplicatePage(pageId) {
  const id = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
  const pages = store.get('pages')
  const dupPage = pages.find((page) => page.id === pageId)
  const dupPageData = dupPage.data
  const dupPageTitle = dupPage.title
  const title = dupPageTitle + ' (copy)'

  app.activePage = id

  pages.push({ id, title, data: dupPageData })

  store.set('pages', pages)

  cm.setValue(dupPageData)

  populatePages()

  $('#pageName').innerHTML = title
}

/** Sort page list */
export function sortPages() {
  const pages = store.get('pages')
  const pageList = $all('#pageList > div')

  let sortedPages = [...pageList].reduce((a, i) => {
    a.push(pages.find((page) => page.id === i.getAttribute('id')))
    return a
  }, [])

  store.set('pages', sortedPages)
}

$('#closeSidePanelButton').addEventListener('click', () => {
  UIkit.offcanvas('#sidePanel').hide()
})

$('#newPageButton').addEventListener('click', () => {
  $('#newPageTitleInput').value = ''
  $('#newPageTitleInput').focus()

  showModal('#dialog-newPage')
})

$('#dialog-newPage-save').addEventListener('click', newPage)

$('#newPageTitleInput').addEventListener('keyup', (event) => {
  if (event.key === 'Enter' || event.keyCode === 13) {
    $('#dialog-newPage-save').click()
  }
})

$('#renamePageTitleInput').addEventListener('keyup', (event) => {
  if (event.key === 'Enter' || event.keyCode === 13) {
    $('#dialog-renamePage-save').click()
  }
})

if (isElectron) {
  // Import calculations from file
  $('#importButton').addEventListener('click', numara.import)

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
  $('#exportButton').addEventListener('click', () => {
    numara.export($('#newPageTitleInput').value, cm.getValue())
  })

  numara.exportData((event, msg) => {
    notify(msg, 'success')
  })

  numara.exportDataError((event, error) => {
    notify(error, 'danger')
  })

  numara.main.export(() => {
    numara.export($('#newPageTitleInput').value, cm.getValue())
  })

  // Print window from main
  numara.main.print(() => {
    window.print()
  })

  // Log messages from main
  numara.logMessage((event, message) => {
    console.log(message)
  })
} else {
  $('#exportButton').remove()
  $('#importButton').remove()
}
