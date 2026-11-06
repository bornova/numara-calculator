import UIkit from 'uikit'

import { debouncedSavePageState } from '../calc/calcManager.js'
import { dom } from '../dom.js'
import { store } from '../state/store.js'

const DRAG_THRESHOLD = 4
const HYSTERESIS = 4
const SCROLL_ZONE = 36
const MAX_SCROLL_SPEED = 10

let justDraggedPage = false

/**
 * Returns whether a page item was just dragged, to suppress accidental click events.
 * @returns {boolean}
 */
export function isPageDragging() {
  return justDraggedPage
}

/**
 * Persists the current DOM order of `#pageList` items into local storage.
 */
function pageOrder() {
  debouncedSavePageState.flush()
  const pages = store.get('pages') || []
  const pageList = dom.els('#pageList > div')
  const orderedPages = [...pageList]
    .map((el) => pages.find((page) => page.id === el.getAttribute('id')))
    .filter(Boolean)
  const seenIds = new Set(orderedPages.map((p) => p.id))

  for (const p of pages) {
    if (!seenIds.has(p.id)) {
      orderedPages.push(p)
    }
  }

  store.set('pages', orderedPages)
}

/**
 * Sets up smooth, vertical-axis-locked pointer drag-and-drop reordering for the page list.
 */
export function setupPageListSort() {
  dom.pageList.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    if (
      event.target.closest('.pageItemActions') ||
      event.target.closest('.uk-dropdown') ||
      event.target.closest('.pageListRenameInput') ||
      event.target.closest('.savePageButton') ||
      event.target.closest('.is-renaming')
    )
      return

    const item = event.target.closest('.pageListItem')

    if (!item || dom.pageList.children.length < 2) return

    const startY = event.clientY
    const itemRect = item.getBoundingClientRect()
    const offsetY = startY - itemRect.top
    const itemHeight = itemRect.height
    const startIndex = Array.from(dom.pageList.children).indexOf(item)

    let isDragging = false
    let dragClone = null
    let autoScrollRaf = null
    let lastClientY = startY

    const updateDragPosition = (clientY) => {
      if (!dragClone) return

      const listRect = dom.pageList.getBoundingClientRect()
      const minTop = listRect.top
      const maxTop = Math.max(minTop, listRect.bottom - itemHeight)
      const clampedTop = Math.min(maxTop, Math.max(minTop, clientY - offsetY))

      dragClone.style.left = `${listRect.left}px`
      dragClone.style.top = `${clampedTop}px`

      const dragCenterY = clampedTop + itemHeight / 2
      const siblings = Array.from(dom.pageList.children).filter((child) => child !== item)
      let insertBeforeNode = null

      for (const sibling of siblings) {
        const siblingTop = listRect.top - dom.pageList.scrollTop + sibling.offsetTop
        const siblingMid = siblingTop + sibling.offsetHeight / 2
        const isBeforeItem = sibling.offsetTop < item.offsetTop
        const threshold = isBeforeItem
          ? siblingMid + itemHeight / 2 - HYSTERESIS
          : siblingMid - itemHeight / 2 + HYSTERESIS

        if (dragCenterY < threshold) {
          insertBeforeNode = sibling
          break
        }
      }

      if (item.nextElementSibling !== insertBeforeNode) {
        const prevTops = new Map()

        for (const sib of siblings) {
          prevTops.set(sib, sib.getBoundingClientRect().top)
        }

        dom.pageList.insertBefore(item, insertBeforeNode)

        for (const sib of siblings) {
          sib.style.transition = 'none'
          sib.style.transform = ''

          const newTop = sib.getBoundingClientRect().top
          const deltaY = prevTops.get(sib) - newTop

          if (Math.abs(deltaY) > 0.5) {
            sib.style.transform = `translateY(${deltaY}px)`
            sib.getBoundingClientRect()
            sib.style.transition = 'transform 150ms cubic-bezier(0.2, 0, 0, 1)'
            sib.style.transform = ''
          }
        }
      }
    }

    const stepAutoScroll = () => {
      if (!isDragging) return

      const listRect = dom.pageList.getBoundingClientRect()
      let scrollDelta = 0

      if (lastClientY < listRect.top + SCROLL_ZONE && dom.pageList.scrollTop > 0) {
        const ratio = Math.min(1, (listRect.top + SCROLL_ZONE - lastClientY) / SCROLL_ZONE)
        scrollDelta = -Math.ceil(ratio * MAX_SCROLL_SPEED)
      } else if (
        lastClientY > listRect.bottom - SCROLL_ZONE &&
        dom.pageList.scrollTop < dom.pageList.scrollHeight - dom.pageList.clientHeight
      ) {
        const ratio = Math.min(1, (lastClientY - (listRect.bottom - SCROLL_ZONE)) / SCROLL_ZONE)
        scrollDelta = Math.ceil(ratio * MAX_SCROLL_SPEED)
      }

      if (scrollDelta !== 0) {
        dom.pageList.scrollTop += scrollDelta
        updateDragPosition(lastClientY)
        autoScrollRaf = requestAnimationFrame(stepAutoScroll)
      } else {
        autoScrollRaf = null
      }
    }

    const onPointerMove = (moveEvent) => {
      lastClientY = moveEvent.clientY

      if (!isDragging) {
        if (Math.abs(lastClientY - startY) < DRAG_THRESHOLD) return

        isDragging = true
        justDraggedPage = true

        dom.els('.uk-dropdown.uk-open').forEach((el) => UIkit.dropdown(el)?.hide(0))

        const listRect = dom.pageList.getBoundingClientRect()

        dragClone = item.cloneNode(true)
        dragClone.removeAttribute('id')
        dragClone.querySelectorAll('[uk-dropdown]').forEach((el) => el.remove())
        dragClone.classList.add('pageListItemDrag')
        dragClone.style.width = `${itemRect.width}px`
        dragClone.style.height = `${itemHeight}px`
        dragClone.style.left = `${listRect.left}px`
        dragClone.style.top = `${itemRect.top}px`

        item.classList.add('pageListItemPlaceholder')
        document.body.classList.add('is-sorting-pages')
        document.body.appendChild(dragClone)
      }

      moveEvent.preventDefault()
      updateDragPosition(lastClientY)

      if (!autoScrollRaf) {
        autoScrollRaf = requestAnimationFrame(stepAutoScroll)
      }
    }

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)

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

      item.classList.remove('pageListItemPlaceholder')
      document.body.classList.remove('is-sorting-pages')

      for (const child of dom.pageList.children) {
        child.style.transition = ''
        child.style.transform = ''
      }

      const endIndex = Array.from(dom.pageList.children).indexOf(item)

      if (endIndex !== startIndex) {
        pageOrder()
      }

      setTimeout(() => {
        justDraggedPage = false
      }, 0)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  })
}
