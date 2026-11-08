import { debouncedSavePageState } from '../calc/calcManager.js'
import { dom } from '../dom.js'
import { store } from '../state/store.js'
import { hideOpenDropdowns } from '../ui/dialogs.js'
import { hideTabContextMenu } from './pageTabs.js'

const DRAG_HOLD_DELAY = 250
const DRAG_THRESHOLD = 4
const HYSTERESIS = 4
const SCROLL_ZONE = 36
const MAX_SCROLL_SPEED = 10

let justDraggedPage = false

/**
 * Returns whether a page item or tab was just dragged, to suppress accidental click events.
 * @returns {boolean}
 */
export function isPageDragging() {
  return justDraggedPage
}

/**
 * Persists the current DOM order of page elements into local storage.
 * @param {Element[]} elements Ordered DOM elements with page IDs.
 * @param {(el: Element) => string} getId Extractor for page ID.
 */
function saveOrderedPages(elements, getId) {
  debouncedSavePageState.flush()

  const pages = store.get('pages') || []
  const orderedPages = elements.map((el) => pages.find((page) => page.id === getId(el))).filter(Boolean)
  const seenIds = new Set(orderedPages.map((p) => p.id))

  for (const p of pages) {
    if (!seenIds.has(p.id)) {
      orderedPages.push(p)
    }
  }

  store.set('pages', orderedPages)
}

/**
 * Persists the current DOM order of `#pageList` items into local storage and syncs `#pageTabs`.
 */
function pageOrder() {
  saveOrderedPages([...dom.els('#pageList > div')], (el) => el.getAttribute('id'))

  if (dom.pageTabs) {
    const pages = store.get('pages') || []
    for (const p of pages) {
      const tabEl = dom.pageTabs.querySelector(`.pageTab[data-page="${p.id}"]`)
      if (tabEl) dom.pageTabs.appendChild(tabEl)
    }
  }
}

/**
 * Persists the current DOM order of `#pageTabs` items into local storage and syncs `#pageList`.
 */
function tabOrder() {
  saveOrderedPages([...dom.els('#pageTabs > .pageTab')], (el) => el.dataset.page)

  if (dom.pageList) {
    const pages = store.get('pages') || []

    for (const p of pages) {
      const itemEl = document.getElementById(p.id)
      if (itemEl) dom.pageList.appendChild(itemEl)
    }
  }
}

/**
 * Attaches smooth axis-locked pointer drag-and-drop sorting to a container.
 * @param {object} config
 * @param {HTMLElement} config.container Parent scrollable container element.
 * @param {'x'|'y'} config.axis Drag axis ('y' for vertical list, 'x' for horizontal tabs).
 * @param {string} config.itemSelector Selector for draggable child items.
 * @param {string} config.ignoreSelector Selector for interactive elements to ignore on pointerdown.
 * @param {string} config.dragClass Class added to the floating drag clone.
 * @param {string} config.placeholderClass Class added to the in-place item placeholder.
 * @param {() => void} config.onReorder Callback fired when item order changes.
 */
function setupAxisDragSort({ container, axis, itemSelector, ignoreSelector, dragClass, placeholderClass, onReorder }) {
  if (!container) return

  const isVertical = axis === 'y'

  container.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    if (event.target.closest(ignoreSelector)) return

    const item = event.target.closest(itemSelector)

    if (!item || container.children.length < 2) return

    const startX = event.clientX
    const startY = event.clientY
    const startCoord = isVertical ? startY : startX
    const startIndex = Array.from(container.children).indexOf(item)

    let itemRect = item.getBoundingClientRect()
    let offset = startCoord - (isVertical ? itemRect.top : itemRect.left)
    let itemSize = isVertical ? itemRect.height : itemRect.width
    let isDragging = false
    let dragClone = null
    let autoScrollRaf = null
    let holdTimer = null
    let lastCoord = startCoord

    const updateDragPosition = (coord) => {
      if (!dragClone) return

      const rect = container.getBoundingClientRect()
      const minBound = isVertical ? rect.top : rect.left
      const maxBound = Math.max(minBound, (isVertical ? rect.bottom : rect.right) - itemSize)
      const clampedPos = Math.min(maxBound, Math.max(minBound, coord - offset))

      dragClone.style.left = isVertical ? `${rect.left}px` : `${clampedPos}px`
      dragClone.style.top = isVertical ? `${clampedPos}px` : `${rect.top}px`

      const dragCenter = clampedPos + itemSize / 2
      const siblings = Array.from(container.children).filter((child) => child !== item)
      let insertBeforeNode = null

      for (const sibling of siblings) {
        const sibMid = isVertical
          ? rect.top + container.clientTop + sibling.offsetTop - container.scrollTop + sibling.offsetHeight / 2
          : rect.left + container.clientLeft + sibling.offsetLeft - container.scrollLeft + sibling.offsetWidth / 2
        const isBeforeItem = isVertical ? sibling.offsetTop < item.offsetTop : sibling.offsetLeft < item.offsetLeft
        const halfSpan = itemSize / 2 - HYSTERESIS
        const threshold = isBeforeItem ? sibMid + halfSpan : sibMid - halfSpan

        if (dragCenter < threshold) {
          insertBeforeNode = sibling
          break
        }
      }

      if (item.nextElementSibling !== insertBeforeNode) {
        const prevCoords = new Map()

        for (const sib of siblings) {
          const r = sib.getBoundingClientRect()
          prevCoords.set(sib, isVertical ? r.top : r.left)
        }

        container.insertBefore(item, insertBeforeNode)

        for (const sib of siblings) {
          sib.style.transition = 'none'
          sib.style.transform = ''

          const r = sib.getBoundingClientRect()
          const delta = prevCoords.get(sib) - (isVertical ? r.top : r.left)

          if (Math.abs(delta) > 0.5) {
            sib.style.transform = isVertical ? `translateY(${delta}px)` : `translateX(${delta}px)`
            sib.getBoundingClientRect()
            sib.style.transition = 'transform 150ms cubic-bezier(0.2, 0, 0, 1)'
            sib.style.transform = ''
          }
        }
      }
    }

    const stepAutoScroll = () => {
      if (!isDragging) return

      const rect = container.getBoundingClientRect()
      const startEdge = isVertical ? rect.top : rect.left
      const endEdge = isVertical ? rect.bottom : rect.right
      const scrollPos = isVertical ? container.scrollTop : container.scrollLeft
      const maxScroll = isVertical
        ? container.scrollHeight - container.clientHeight
        : container.scrollWidth - container.clientWidth
      let scrollDelta = 0

      if (lastCoord < startEdge + SCROLL_ZONE && scrollPos > 0) {
        const ratio = Math.min(1, (startEdge + SCROLL_ZONE - lastCoord) / SCROLL_ZONE)
        scrollDelta = -Math.ceil(ratio * MAX_SCROLL_SPEED)
      } else if (lastCoord > endEdge - SCROLL_ZONE && scrollPos < maxScroll) {
        const ratio = Math.min(1, (lastCoord - (endEdge - SCROLL_ZONE)) / SCROLL_ZONE)
        scrollDelta = Math.ceil(ratio * MAX_SCROLL_SPEED)
      }

      if (scrollDelta !== 0) {
        if (isVertical) {
          container.scrollTop += scrollDelta
        } else {
          container.scrollLeft += scrollDelta
        }
        updateDragPosition(lastCoord)
        autoScrollRaf = requestAnimationFrame(stepAutoScroll)
      } else {
        autoScrollRaf = null
      }
    }

    const startDrag = () => {
      holdTimer = null

      if (isDragging || !item.isConnected || item.classList.contains('is-renaming')) return

      itemRect = item.getBoundingClientRect()
      offset = lastCoord - (isVertical ? itemRect.top : itemRect.left)
      itemSize = isVertical ? itemRect.height : itemRect.width

      isDragging = true
      justDraggedPage = true

      hideTabContextMenu()
      hideOpenDropdowns()

      const rect = container.getBoundingClientRect()

      dragClone = item.cloneNode(true)
      dragClone.removeAttribute('id')
      dragClone.querySelectorAll('[uk-dropdown]').forEach((el) => el.remove())
      dragClone.classList.add(dragClass)
      dragClone.style.width = `${itemRect.width}px`
      dragClone.style.height = `${itemRect.height}px`
      dragClone.style.left = `${isVertical ? rect.left : itemRect.left}px`
      dragClone.style.top = `${itemRect.top}px`

      item.classList.add(placeholderClass)
      document.body.classList.add('is-sorting-pages')
      document.body.appendChild(dragClone)
    }

    const onTouchMove = (touchEvent) => {
      if (isDragging && touchEvent.cancelable) {
        touchEvent.preventDefault()
      }
    }

    const onContextMenu = (contextEvent) => {
      if (isDragging || justDraggedPage) {
        contextEvent.preventDefault()
        contextEvent.stopPropagation()
      }
    }

    const onContainerScroll = () => {
      if (!isDragging) {
        onPointerUp()
      }
    }

    const onPointerMove = (moveEvent) => {
      lastCoord = isVertical ? moveEvent.clientY : moveEvent.clientX

      if (!isDragging) {
        if (
          Math.abs(moveEvent.clientX - startX) >= DRAG_THRESHOLD ||
          Math.abs(moveEvent.clientY - startY) >= DRAG_THRESHOLD
        ) {
          onPointerUp()
        }
        return
      }

      moveEvent.preventDefault()
      updateDragPosition(lastCoord)

      if (!autoScrollRaf) {
        autoScrollRaf = requestAnimationFrame(stepAutoScroll)
      }
    }

    const onPointerUp = () => {
      clearTimeout(holdTimer)
      holdTimer = null

      container.removeEventListener('scroll', onContainerScroll)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('contextmenu', onContextMenu, true)

      if (autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf)
        autoScrollRaf = null
      }

      if (!isDragging) return

      isDragging = false

      if (dragClone) {
        dragClone.remove()
        dragClone = null
      }

      item.classList.remove(placeholderClass)
      document.body.classList.remove('is-sorting-pages')

      for (const child of container.children) {
        child.style.transition = ''
        child.style.transform = ''
      }

      const endIndex = Array.from(container.children).indexOf(item)

      if (endIndex !== startIndex) {
        onReorder()
      }

      setTimeout(() => {
        justDraggedPage = false
      }, 0)
    }

    holdTimer = setTimeout(startDrag, DRAG_HOLD_DELAY)

    container.addEventListener('scroll', onContainerScroll, { passive: true })
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('contextmenu', onContextMenu, true)
  })
}

/**
 * Sets up smooth, vertical-axis-locked pointer drag-and-drop reordering for the page list.
 */
export function setupPageListSort() {
  setupAxisDragSort({
    container: dom.pageList,
    axis: 'y',
    itemSelector: '.pageListItem',
    ignoreSelector: '.pageItemActions, .uk-dropdown, .pageListRenameInput, .savePageButton, .is-renaming',
    dragClass: 'pageListItemDrag',
    placeholderClass: 'pageListItemPlaceholder',
    onReorder: pageOrder
  })
}

/**
 * Sets up smooth, horizontal-axis-locked pointer drag-and-drop reordering for page tabs.
 */
export function setupPageTabsSort() {
  setupAxisDragSort({
    container: dom.pageTabs,
    axis: 'x',
    itemSelector: '.pageTab',
    ignoreSelector: '.pageTabRenameInput, .is-renaming',
    dragClass: 'pageTabDrag',
    placeholderClass: 'pageTabPlaceholder',
    onReorder: tabOrder
  })
}
