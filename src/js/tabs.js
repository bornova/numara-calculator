import { $, $all, app, store } from './common'
import { cm } from './editor'
import { confirm, notify, showModal } from './modal'
import { generateIcons } from './icons'
import { isElectron } from './utils'

import UIkit from 'uikit'

import { DateTime } from 'luxon'

export function defaultTab() {
  const tabId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')

  app.activeTab = tabId

  store.set('lastTab', tabId)
  store.set('tabs', [{ id: tabId, title: 'New tab', data: '' }])

  cm.setValue(store.get('input') || '')
}

export function lastTab() {
  return store.get('lastTab')
}

export function populateTabs() {
  const tabs = store.get('tabs')

  if (!tabs || tabs.length === 0) {
    defaultTab()
  }

  $('#tabList').innerHTML = ''

  tabs.forEach((tab) => {
    const tabItem = document.createElement('div')

    tabItem.id = tab.id
    tabItem.classList.add('tabListItem', 'uk-flex-middle', app.activeTab === tab.id ? 'activeTab' : 'inactiveTab')
    tabItem.innerHTML = `
      <div class="uk-flex-1" data-action="load">
        <div id="tab-${tab.id}"class="tabListItemTitle" title="${tab.title}">${tab.title}</div>
        <div class="dialog-open-date">${DateTime.fromFormat(tab.id, 'yyyyMMddHHmmssSSS').toFormat('FF')}</div>
      </div>
      <div class="renameTabButton uk-hidden" data-action="rename" title="Rename">
        <i data-lucide="text-cursor-input"></i>
      </div>
      <div class="deleteTabButton uk-hidden" data-action="delete" title="Delete">
        <i data-lucide="x"></i>
      </div>
    `

    tabItem.addEventListener('mouseenter', (event) => {
      Array.from(event.target.children)
        .slice(-2)
        .forEach((el) => {
          el.classList.remove('uk-hidden')
        })
    })

    tabItem.addEventListener('mouseleave', (event) => {
      Array.from(event.target.children)
        .slice(-2)
        .forEach((el) => {
          el.classList.add('uk-hidden')
        })
    })

    $('#tabList').appendChild(tabItem)
  })

  sortTabs()

  generateIcons()
}

export function newTab(isImport) {
  const id = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
  const tabs = store.get('tabs')
  const title = $('#newTabTitleInput').value.replace(/<|>/g, '').trim() || (isImport ? 'Imported tab' : 'New tab')

  app.activeTab = id

  tabs.push({ id, title, data: '' })

  store.set('tabs', tabs)

  cm.setValue('')

  populateTabs()

  UIkit.modal('#dialog-newTab').hide()
}

export function loadTab(tabId) {
  const tab = store.get('tabs').find((tab) => tab.id === tabId)

  app.activeTab = tabId

  store.set('lastTab', tabId)

  cm.setValue(tab.data)
}

export function deleteTab(tabId) {
  let tabs = store.get('tabs')

  confirm('"' + tabs.find((tab) => tab.id === tabId).title + '" will be deleted.', () => {
    tabs = tabs.filter((tab) => tab.id !== tabId)

    store.set('tabs', tabs)

    if (tabs.length === 0) {
      defaultTab()
    } else if (tabId === app.activeTab) {
      loadTab(tabs.pop().id)
    }

    populateTabs()
  })
}

export function renameTab(tabId) {
  const tabs = store.get('tabs')
  const tab = tabs.find((tab) => tab.id === tabId)

  $('#renameTabTitleInput').value = tab.title

  showModal('#dialog-renameTab')

  function rename() {
    tab.title = $('#renameTabTitleInput').value.replace(/<|>/g, '').trim() || 'Untitled tab'

    store.set('tabs', tabs)

    populateTabs()

    UIkit.modal('#dialog-renameTab').hide()

    $('#dialog-renameTab-save').removeEventListener('click', rename)
  }

  $('#dialog-renameTab-save').addEventListener('click', rename)
}

export function sortTabs() {
  const tabs = store.get('tabs')
  const tabList = $all('#tabList > div')

  let sortedTabs = [...tabList].reduce((a, i) => {
    a.push(tabs.find((tab) => tab.id === i.getAttribute('id')))
    return a
  }, [])

  store.set('tabs', sortedTabs)
}

$('#tabList').addEventListener('click', (event) => {
  if (event.target.parentNode.dataset.action === 'load') {
    let tabId = event.target.parentNode.parentNode.id

    loadTab(tabId)

    UIkit.offcanvas('#tabsPanel').hide()
  }

  if (event.target.getAttribute('data-action') === 'rename') {
    renameTab(event.target.parentNode.id)
  }

  if (event.target.getAttribute('data-action') === 'delete') {
    deleteTab(event.target.parentNode.id)
  }
})

$('#closetabsPanelButton').addEventListener('click', () => {
  UIkit.offcanvas('#tabsPanel').hide()
})

$('#newTabButton').addEventListener('click', () => {
  $('#newTabTitleInput').value = ''
  $('#newTabTitleInput').focus()

  showModal('#dialog-newTab')
})

$('#dialog-newTab-save').addEventListener('click', () => {
  newTab()
})

$('#newTabTitleInput').addEventListener('keyup', (event) => {
  if (event.key === 'Enter' || event.keyCode === 13) {
    $('#dialog-newTab-save').click()
  }
})

$('#renameTabTitleInput').addEventListener('keyup', (event) => {
  if (event.key === 'Enter' || event.keyCode === 13) {
    $('#dialog-renameTab-save').click()
  }
})

if (isElectron) {
  // Import calculations from file
  $('#importButton').addEventListener('click', () => {
    numara.import()
  })

  numara.importData((event, data, msg) => {
    newTab(true)

    cm.setValue(data)

    notify(msg, 'success')
  })

  numara.importDataError((event, error) => {
    notify(error, 'danger')
  })

  // Export calculations to file
  $('#exportButton').addEventListener('click', () => {
    numara.export($('#newTabTitleInput').value, cm.getValue())
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
