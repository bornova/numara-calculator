import { $, $all, app, store } from './common'
import { cm } from './editor'
import { confirm, notify, showModal } from './modal'
import { generateIcons } from './icons'
import { isElectron } from './utils'

import UIkit from 'uikit'

import { DateTime } from 'luxon'

export function defaultPage() {
  const pageId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')

  app.activePage = pageId

  store.set('lastPage', pageId)
  store.set('pages', [{ id: pageId, title: 'Untitled page', data: '' }])

  cm.setValue(store.get('input') || '')

  $('#pageName').innerHTML = 'Untitled page'
}

export function lastPage() {
  return store.get('lastPage')
}

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

export function loadPage(pageId) {
  const page = store.get('pages').find((page) => page.id === pageId)

  app.activePage = pageId

  store.set('lastPage', pageId)

  $('#pageName').innerHTML = page.title

  cm.setValue(page.data)
}

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
      <div class="renamePageButton" data-action="rename" title="Rename">
        <i data-lucide="text-cursor-input"></i>
      </div>
      <div class="deletePageButton" data-action="delete" title="Delete">
        <i data-lucide="x"></i>
      </div>
    `

    pageListItem.addEventListener('click', (event) => {
      if (event.target.parentNode.dataset.action === 'load') {
        loadPage(page.id)

        UIkit.offcanvas('#pagesPanel').hide()
      }

      if (event.target.dataset.action === 'rename') {
        renamePage(page.id)
      }

      if (event.target.dataset.action === 'delete') {
        deletePage(page.id)
      }
    })

    $('#pageList').appendChild(pageListItem)
  })

  sortPages()

  generateIcons()
}

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

export function sortPages() {
  const pages = store.get('pages')
  const pageList = $all('#pageList > div')

  let sortedPages = [...pageList].reduce((a, i) => {
    a.push(pages.find((page) => page.id === i.getAttribute('id')))
    return a
  }, [])

  store.set('pages', sortedPages)
}

$('#closepagesPanelButton').addEventListener('click', () => {
  UIkit.offcanvas('#pagesPanel').hide()
})

$('#newPageButton').addEventListener('click', () => {
  $('#newPageTitleInput').value = ''
  $('#newPageTitleInput').focus()

  showModal('#dialog-newPage')
})

$('#dialog-newPage-save').addEventListener('click', () => {
  newPage()
})

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
  $('#importButton').addEventListener('click', () => {
    numara.import()
  })

  numara.importData((event, data, msg) => {
    newPage(true)

    cm.setValue(data)

    notify(msg, 'success')
  })

  numara.importDataError((event, error) => {
    notify(error, 'danger')
  })

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
} else {
  $('#exportButton').remove()
  $('#importButton').remove()
}
