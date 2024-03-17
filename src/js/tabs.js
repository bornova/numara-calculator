import { $, $all, app, store } from './common'
import { cm } from './editor'
import { confirm, notify } from './modal'
import { generateIcons } from './icons'

import UIkit from 'uikit'

import { DateTime } from 'luxon'

$('#tabList').addEventListener('click', (event) => {
  if (event.target.parentNode.getAttribute('data-action') === 'load') {
    let tabId = event.target.parentNode.parentNode.id

    loadTab(tabId)
  }

  if (event.target.getAttribute('data-action') === 'delete') {
    let tabId = event.target.parentNode.id

    deleteTab(tabId)
  }
})

export function defaultTab() {
  const tabId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')

  app.activeTab = tabId

  store.set('lastTab', tabId)
  store.set('tabs', [{ id: tabId, title: 'New tab', data: '' }])

  cm.setValue('')
}

export function lastTab() {
  return store.get('lastTab')
}

export function newTab() {
  const id = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
  const tabs = store.get('tabs')
  const title = $('#saveTitle').value.replace(/<|>/g, '').trim() || 'New tab'

  app.activeTab = id

  tabs.push({ id, title, data: '' })

  store.set('tabs', tabs)

  cm.setValue('')

  UIkit.modal('#dialog-save').hide()

  notify(
    `Saved as '${title}' <a class="notificationLink" onclick="document.querySelector('#openButton').click()">View saved calculations</a>`
  )
}

export function populateTabs() {
  let tabs = store.get('tabs')

  if (!tabs || tabs.length === 0) {
    defaultTab()
  }

  $('#tabList').innerHTML = ''

  $('#deleteAllTabsButton').disabled = false

  tabs.forEach((tab) => {
    $('#tabList').innerHTML += `
      <div class="tabListItem uk-flex" id="${tab.id}">
        <div
          id="activeTabIndicator"
          class="${app.activeTab === tab.id ? 'activeTabIndicator' : 'inactiveTabIndicator'}"
        ></div>
        <div class="uk-flex-1" data-action="load">
          <div class="tabListItemTitle" contenteditable="true">${tab.title}</div>
          <div class="dialog-open-date">${DateTime.fromFormat(tab.id, 'yyyyMMddHHmmssSSS').toFormat('FF')}</div>
        </div>
        <div class="deleteTabButton" data-action="rename"><i data-lucide="text-cursor-input"></i></div>
        <div class="deleteTabButton" data-action="delete"><i data-lucide="x"></i></div>
      </div>`
  })

  sortTabs()

  generateIcons()
}

export function loadTab(tabId) {
  app.activeTab = tabId

  store.set('lastTab', tabId)

  cm.setValue(store.get('tabs').find((tab) => tab.id === tabId).data)

  UIkit.offcanvas('#tabsPanel').hide()
}

export function deleteTab(tabId) {
  let tabs = store.get('tabs')

  confirm('Calculation "' + tabs.find((tab) => tab.id === tabId).title + '" will be deleted.', () => {
    tabs = tabs.filter((tab) => tab.id !== tabId)

    store.set('tabs', tabs)

    if (tabs.length === 0) {
      defaultTab()

      UIkit.offcanvas('#tabsPanel').hide()
    } else if (tabId === app.activeTab) {
      loadTab(tabs.pop().id)
    }

    populateTabs()
  })
}

export function sortTabs() {
  let tabs = store.get('tabs')
  let tabList = $all('#tabList > div')

  let sortedTabs = [...tabList].reduce((a, i) => {
    a.push(tabs.find((tab) => tab.id === i.getAttribute('id')))
    return a
  }, [])

  store.set('tabs', sortedTabs)
}

UIkit.util.on('#tabList', 'moved', () => {
  sortTabs()
})

export function renameTab() {}

export function deleteAllTabs() {}
