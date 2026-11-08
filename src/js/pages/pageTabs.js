import { debouncedSavePageState } from '../calc/calcManager.js'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import { hideOpenDropdowns } from '../ui/dialogs.js'

let contextTabPageId = null
let contextMenuSource = null

/**
 * Hides the tab/page context menu if open.
 */
export function hideTabContextMenu() {
  dom.tabContextMenu?.classList.remove('uk-open')
  dom.els('.pageMenuButton.is-active').forEach((btn) => btn.classList.remove('is-active'))
  contextTabPageId = null
  contextMenuSource = null
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

  hideOpenDropdowns(dom.tabContextMenu)
  dom.els('.pageMenuButton.is-active').forEach((btn) => btn.classList.remove('is-active'))

  contextTabPageId = pageId
  contextMenuSource = 'list'
  anchorEl.classList.add('is-active')
  dom.tabContextMenu.classList.add('uk-open')

  const menuRect = dom.tabContextMenu.getBoundingClientRect()
  const btnRect = anchorEl.getBoundingClientRect()
  const left = Math.max(8, Math.min(btnRect.right - menuRect.width, window.innerWidth - menuRect.width - 8))
  const spaceBelow = window.innerHeight - btnRect.bottom - 8
  const top =
    spaceBelow >= menuRect.height || btnRect.top < menuRect.height
      ? Math.min(btnRect.bottom + 4, window.innerHeight - menuRect.height - 8)
      : Math.max(8, btnRect.top - menuRect.height - 4)

  dom.tabContextMenu.style.left = `${left}px`
  dom.tabContextMenu.style.top = `${top}px`
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

  dom.pageTabs.innerHTML = ''

  pages.forEach((page) => {
    const pageDate = formatPageDate(page.id)
    const pageTab = document.createElement('div')

    pageTab.className = `pageTab${app.activePage === page.id ? ' activeTab' : ''}`
    pageTab.dataset.page = page.id
    pageTab.dataset.action = 'loadTab'
    pageTab.title = `${page.name} - ${pageDate}`
    pageTab.innerHTML = `<span class="pageTabTitle">${escapeHTML(page.name)}</span>`

    dom.pageTabs.appendChild(pageTab)
  })

  const activeTabEl = dom.pageTabs.querySelector('.activeTab')

  if (activeTabEl) {
    activeTabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

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
export function attachInlineRenameInput(titleEl, initialValue, className, onFinish) {
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
 * Rename page inline within a bottom-bar page tab.
 * @param {string} pageId Id of the page to rename.
 * @param {(pageId: string, originalName: string, rawInput: string, save: boolean) => void} commitRename Callback to validate and persist the new name.
 */
export function renameTab(pageId, commitRename) {
  debouncedSavePageState.flush()

  const pages = store.get('pages') || []
  const page = pages.find((p) => p.id === pageId)

  if (!page || !dom.pageTabs) return

  const tabEl = dom.pageTabs.querySelector(`.pageTab[data-page="${pageId}"]`)
  const titleEl = tabEl?.querySelector('.pageTabTitle')

  if (!tabEl || !titleEl || tabEl.classList.contains('is-renaming')) return

  const tabHeight = tabEl.offsetHeight

  tabEl.style.boxSizing = 'border-box'
  tabEl.style.height = `${tabHeight}px`
  tabEl.classList.add('is-renaming')

  const { input } = attachInlineRenameInput(titleEl, page.name, 'pageTabRenameInput', (rawValue, save) =>
    commitRename(pageId, page.name, rawValue, save)
  )

  tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  updatePageTabsScroll()
  input.focus()
  input.select()
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

    hideOpenDropdowns(dom.tabContextMenu)
    dom.els('.pageMenuButton.is-active').forEach((btn) => btn.classList.remove('is-active'))

    contextTabPageId = tabEl.dataset.page
    contextMenuSource = 'tab'
    dom.tabContextMenu.classList.add('uk-open')

    const menuRect = dom.tabContextMenu.getBoundingClientRect()
    const tabRect = tabEl.getBoundingClientRect()
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuRect.width - 8))
    const top = Math.max(8, tabRect.top - menuRect.height - 6)

    dom.tabContextMenu.style.left = `${left}px`
    dom.tabContextMenu.style.top = `${top}px`
  })

  dom.tabContextRename?.addEventListener('click', (event) => {
    event.stopPropagation()
    const pageId = contextTabPageId
    const source = contextMenuSource
    hideTabContextMenu()
    if (pageId) {
      if (source === 'list' && onRenamePage) {
        onRenamePage(pageId)
      } else {
        onRename(pageId)
      }
    }
  })

  dom.tabContextDuplicate?.addEventListener('click', (event) => {
    event.stopPropagation()
    const pageId = contextTabPageId
    hideTabContextMenu()
    if (pageId) onDuplicate(pageId)
  })

  dom.tabContextDelete?.addEventListener('click', (event) => {
    event.stopPropagation()
    const pageId = contextTabPageId
    hideTabContextMenu()
    if (pageId) onDelete(pageId)
  })

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
}
