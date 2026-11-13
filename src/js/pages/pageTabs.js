import { debouncedSavePageState } from '../calc/calcManager.js'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { events } from '../state/events.js'
import { store } from '../state/store.js'
import { hideOpenDropdowns } from '../ui/dialogs.js'

let contextTabPageId = null
let contextMenuSource = null
let activeMenuBtn = null

/**
 * Hides the tab/page context menu if open.
 */
export function hideTabContextMenu() {
  dom.tabContextMenu?.classList.remove('uk-open')
  activeMenuBtn?.classList.remove('is-active')
  activeMenuBtn = null
  contextTabPageId = null
  contextMenuSource = null
}

/**
 * Opens and viewport-clamps `#tabContextMenu` for a page list button or bottom tab.
 * @param {string} pageId Id of the target page.
 * @param {'list'|'tab'} source Trigger origin.
 * @param {(menuRect: DOMRect) => { left: number, top: number }} getPosition Computes desired coordinates.
 * @param {HTMLElement|null} [anchorEl=null] Optional trigger button to mark `.is-active`.
 */
function openPageContextMenu(pageId, source, getPosition, anchorEl = null) {
  hideOpenDropdowns(dom.tabContextMenu)
  activeMenuBtn?.classList.remove('is-active')
  activeMenuBtn = anchorEl
  activeMenuBtn?.classList.add('is-active')

  contextTabPageId = pageId
  contextMenuSource = source
  dom.tabContextMenu.classList.add('uk-open')

  const menuRect = dom.tabContextMenu.getBoundingClientRect()
  const { left, top } = getPosition(menuRect)

  dom.tabContextMenu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8))}px`
  dom.tabContextMenu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - menuRect.height - 8))}px`
}

/**
 * Toggles the shared page actions context menu anchored to a page list item's menu button.
 * @param {string} pageId Id of the target page.
 * @param {HTMLElement} anchorEl The clicked menu trigger button element.
 */
export function togglePageListContextMenu(pageId, anchorEl) {
  if (!dom.tabContextMenu || !anchorEl) return

  if (dom.tabContextMenu.classList.contains('uk-open') && contextMenuSource === 'list' && contextTabPageId === pageId) {
    hideTabContextMenu()
    return
  }

  openPageContextMenu(
    pageId,
    'list',
    (menuRect) => {
      const btnRect = anchorEl.getBoundingClientRect()
      const spaceBelow = window.innerHeight - btnRect.bottom - 8

      return {
        left: btnRect.right - menuRect.width,
        top:
          spaceBelow >= menuRect.height || btnRect.top < menuRect.height
            ? btnRect.bottom + 4
            : btnRect.top - menuRect.height - 4
      }
    },
    anchorEl
  )
}

/**
 * Updates the visibility and disabled states of the left/right tab scroll arrows.
 */
export function updatePageTabsScroll() {
  if (!dom.pageTabs || !dom.pageTabsLeft || !dom.pageTabsRight) return

  requestAnimationFrame(() => {
    const { scrollLeft, scrollWidth, clientWidth } = dom.pageTabs
    const hasOverflow = scrollWidth > clientWidth + 1

    dom.pageTabsLeft.style.display = hasOverflow ? 'inline-flex' : 'none'
    dom.pageTabsRight.style.display = hasOverflow ? 'inline-flex' : 'none'

    if (hasOverflow) {
      dom.pageTabsLeft.setAttribute('disabled', scrollLeft <= 1)
      dom.pageTabsRight.setAttribute('disabled', scrollLeft + clientWidth >= scrollWidth - 1)
    }
  })
}

/**
 * Renders the bottom-bar page tabs and scrolls the active tab into view.
 * @param {Array<{id: string, name: string}>} pages List of pages.
 * @param {(pageId: string) => string} formatPageDate Formatter for page timestamp ID.
 */
export function populatePageTabs(pages, formatPageDate) {
  if (!dom.pageTabs) return

  const fragment = document.createDocumentFragment()
  let activeTabEl = null

  for (const page of pages) {
    const pageDate = formatPageDate(page.id)
    const isActive = app.activePage === page.id
    const pageTab = document.createElement('div')

    pageTab.className = `pageTab${isActive ? ' activeTab' : ''}`
    pageTab.dataset.page = page.id
    pageTab.dataset.action = 'loadTab'
    pageTab.title = `${page.name} - ${pageDate}`
    pageTab.innerHTML = `<span class="pageTabTitle">${escapeHTML(page.name)}</span>`

    if (isActive) {
      activeTabEl = pageTab
    }

    fragment.appendChild(pageTab)
  }

  dom.pageTabs.replaceChildren(fragment)
  activeTabEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' })

  updatePageTabsScroll()
}

/**
 * Replaces a title element with an inline rename `<input>` and wires Enter, Escape, blur, and click events.
 * @param {HTMLElement} titleEl Title element to replace.
 * @param {string} initialValue Initial input value.
 * @param {string} className CSS class for the input element.
 * @param {(rawValue: string, save: boolean) => void} onFinish Callback invoked once on completion.
 * @returns {{ input: HTMLInputElement, finish: (save: boolean) => void }}
 */
function attachInlineRenameInput(titleEl, initialValue, className, onFinish) {
  const input = document.createElement('input')
  input.type = 'text'
  input.className = className
  input.maxLength = 50
  input.autocomplete = 'off'
  input.value = initialValue

  titleEl.replaceWith(input)

  let finished = false

  const finish = (save) => {
    if (finished) return

    finished = true

    onFinish(input.value, save)
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      finish(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    }
  })

  input.addEventListener('blur', () => finish(true))
  input.addEventListener('click', (event) => event.stopPropagation())
  input.addEventListener('dblclick', (event) => event.stopPropagation())

  return { input, finish }
}

/**
 * Prepares a page list item or tab container for inline renaming and mounts the rename `<input>`.
 * @param {object} params
 * @param {string} params.pageId Id of the page being renamed.
 * @param {HTMLElement|null|undefined} params.containerEl Item or tab element.
 * @param {string} params.titleSelector Selector for the inner title element to replace.
 * @param {string} params.inputClass CSS class for the rename `<input>`.
 * @param {(pageId: string, originalName: string, rawInput: string, save: boolean) => void} params.commitRename Commit callback.
 * @returns {{ input: HTMLInputElement, finish: (save: boolean) => void, titleHeight: number }|null}
 */
export function startInlinePageRename({ pageId, containerEl, titleSelector, inputClass, commitRename }) {
  debouncedSavePageState.flush()

  const page = (store.get('pages') || []).find((p) => p.id === pageId)
  const titleEl = containerEl?.querySelector(titleSelector)

  if (!page || !containerEl || !titleEl || containerEl.classList.contains('is-renaming')) return null

  const containerHeight = containerEl.offsetHeight
  const titleHeight = titleEl.offsetHeight

  containerEl.style.boxSizing = 'border-box'
  containerEl.style.height = `${containerHeight}px`
  containerEl.classList.add('is-renaming')

  const { input, finish } = attachInlineRenameInput(titleEl, page.name, inputClass, (rawValue, save) =>
    commitRename(pageId, page.name, rawValue, save)
  )

  return { input, finish, titleHeight }
}

/**
 * Rename page inline within a bottom-bar page tab.
 * @param {string} pageId Id of the page to rename.
 * @param {(pageId: string, originalName: string, rawInput: string, save: boolean) => void} commitRename Callback to validate and persist the new name.
 */
export function renameTab(pageId, commitRename) {
  const tabEl = dom.pageTabs?.querySelector(`.pageTab[data-page="${pageId}"]`)
  const session = startInlinePageRename({
    pageId,
    containerEl: tabEl,
    titleSelector: '.pageTabTitle',
    inputClass: 'pageTabRenameInput',
    commitRename
  })

  if (!session) return

  tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  updatePageTabsScroll()
  session.input.focus()
  session.input.select()
}

/**
 * Binds scroll, wheel, resize, double-click, and right-click context menu events for page tabs.
 * @param {object} handlers
 * @param {(pageId: string) => void} handlers.onRename Callback to rename a tab inline.
 * @param {(pageId: string) => void} [handlers.onRenamePage] Callback to rename a page list item inline.
 * @param {(pageId: string) => void} handlers.onDuplicate Callback to duplicate a tab's page.
 * @param {(pageId: string) => void} handlers.onDelete Callback to delete a tab's page.
 */
export function setupPageTabsEvents({ onRename, onRenamePage, onDuplicate, onDelete }) {
  if (!dom.pageTabs) return

  dom.pageTabs.addEventListener(
    'wheel',
    (event) => {
      if (event.deltaY !== 0 || event.deltaX !== 0) {
        event.preventDefault()
        dom.pageTabs.scrollLeft += event.deltaY !== 0 ? event.deltaY : event.deltaX
        updatePageTabsScroll()
      }
    },
    { passive: false }
  )

  dom.pageTabs.addEventListener('scroll', () => {
    hideTabContextMenu()
    updatePageTabsScroll()
  })

  dom.pageTabsLeft?.addEventListener('click', () => {
    dom.pageTabs.scrollBy({ left: -140, behavior: 'smooth' })
  })

  dom.pageTabsRight?.addEventListener('click', () => {
    dom.pageTabs.scrollBy({ left: 140, behavior: 'smooth' })
  })

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => updatePageTabsScroll())
    ro.observe(dom.pageTabs)
  }

  dom.pageTabs.addEventListener('dblclick', (event) => {
    const tabEl = event.target.closest('.pageTab')

    if (tabEl) {
      onRename(tabEl.dataset.page)
    }
  })

  dom.pageTabs.addEventListener('contextmenu', (event) => {
    const tabEl = event.target.closest('.pageTab')

    if (!tabEl || tabEl.classList.contains('is-renaming')) return

    event.preventDefault()
    event.stopPropagation()

    openPageContextMenu(tabEl.dataset.page, 'tab', (menuRect) => ({
      left: event.clientX,
      top: tabEl.getBoundingClientRect().top - menuRect.height - 6
    }))
  })

  const bindContextAction = (el, handler) => {
    el?.addEventListener('click', (event) => {
      event.stopPropagation()
      const pageId = contextTabPageId
      const source = contextMenuSource
      hideTabContextMenu()
      if (pageId) handler(pageId, source)
    })
  }

  bindContextAction(dom.tabContextRename, (pageId, source) => {
    if (source === 'list' && onRenamePage) {
      onRenamePage(pageId)
    } else {
      onRename(pageId)
    }
  })
  bindContextAction(dom.tabContextDuplicate, (pageId) => onDuplicate(pageId))
  bindContextAction(dom.tabContextDelete, (pageId) => onDelete(pageId))

  document.addEventListener('pointerdown', (event) => {
    if (
      dom.tabContextMenu?.classList.contains('uk-open') &&
      !event.target.closest('#tabContextMenu, [data-action="pageMenu"]')
    ) {
      hideTabContextMenu()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.tabContextMenu?.classList.contains('uk-open')) {
      hideTabContextMenu()
    }
  })

  window.addEventListener('resize', hideTabContextMenu)

  events.on('ui:hideDropdowns', (excludeEl) => {
    if (excludeEl !== dom.tabContextMenu) {
      hideTabContextMenu()
    }
  })
}
