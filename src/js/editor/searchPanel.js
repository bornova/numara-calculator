import CodeMirror from 'codemirror'

import { debounce, escapeRegExp } from '../core/utils.js'
import { dom } from '../dom.js'

let panelEl = null
let currentQuery = null
let currentOverlay = null
let matches = []
let activeIndex = -1

function queryCaseInsensitive(query) {
  if (typeof query === 'string') return query === query.toLowerCase()

  return query.ignoreCase
}

function parseQuery(queryStr) {
  if (!queryStr) return null

  const isRE = queryStr.match(/^\/(.+)\/([a-z]*)$/)

  if (isRE) {
    try {
      return new RegExp(isRE[1], isRE[2].indexOf('i') === -1 ? '' : 'i')
    } catch {
      // ignore invalid regex, treat as string search
    }
  }

  return queryStr
}

function makeOverlay(query, caseInsensitive) {
  let regex

  if (typeof query === 'string') {
    const escaped = escapeRegExp(query)

    regex = new RegExp(escaped, caseInsensitive ? 'gi' : 'g')
  } else {
    const flags = query.ignoreCase ? 'gi' : 'g'

    regex = new RegExp(query.source, flags)
  }

  return {
    token: function (stream) {
      regex.lastIndex = stream.pos

      const match = regex.exec(stream.string)

      if (match && match.index === stream.pos) {
        stream.pos += match[0].length || 1

        return 'searching'
      } else if (match) {
        stream.pos = match.index
      } else {
        stream.skipToEnd()
      }
    }
  }
}

function getMatches(cm, query) {
  const list = []

  if (!query) return list

  const cursor = cm.getSearchCursor(query, CodeMirror.Pos(cm.firstLine(), 0), {
    caseFold: queryCaseInsensitive(query)
  })

  while (cursor.find(false)) {
    list.push({ from: cursor.from(), to: cursor.to() })
  }

  return list
}

function comparePos(a, b) {
  return a.line - b.line || a.ch - b.ch
}

function selectMatch(cm, index) {
  if (index < 0 || index >= matches.length) return

  const match = matches[index]

  cm.setSelection(match.from, match.to)
  cm.scrollIntoView({ from: match.from, to: match.to }, 50)
}

function refreshMatches(cm, fromPos, select = true) {
  matches = getMatches(cm, currentQuery)

  if (matches.length > 0) {
    const foundIndex = matches.findIndex((m) => comparePos(m.from, fromPos) >= 0)

    activeIndex = foundIndex === -1 ? 0 : foundIndex
    panelEl.querySelector('.search-count').textContent = `${activeIndex + 1} of ${matches.length}`

    if (select) {
      selectMatch(cm, activeIndex)
    }
  } else {
    activeIndex = -1
    panelEl.querySelector('.search-count').textContent = '0 of 0'
  }
}

function setReplaceModeVisible(visible) {
  const replaceRow = panelEl.querySelector('.replace-row')
  const toggleBtn = panelEl.querySelector('.search-toggle-replace')

  replaceRow.classList.toggle('hidden', !visible)
  toggleBtn.classList.toggle('expanded', visible)
  document.body.classList.toggle('numara-search-replace-open', visible)
}

function updateSearch(cm, select = true) {
  if (!panelEl) return

  const findInput = panelEl.querySelector('.find-input')
  const queryStr = findInput.value

  // Remove previous overlay
  if (currentOverlay) {
    cm.removeOverlay(currentOverlay)
    currentOverlay = null
  }

  if (!queryStr) {
    currentQuery = null
    matches = []
    activeIndex = -1
    panelEl.querySelector('.search-count').textContent = 'No results'

    return
  }

  currentQuery = parseQuery(queryStr)

  const caseInsensitive = queryCaseInsensitive(currentQuery)

  currentOverlay = makeOverlay(currentQuery, caseInsensitive)

  cm.addOverlay(currentOverlay)

  refreshMatches(cm, cm.getCursor('from'), select)
}

function navigateSearch(cm, reverse = false) {
  if (matches.length === 0) return

  activeIndex = reverse ? (activeIndex - 1 + matches.length) % matches.length : (activeIndex + 1) % matches.length

  panelEl.querySelector('.search-count').textContent = `${activeIndex + 1} of ${matches.length}`
  selectMatch(cm, activeIndex)
}

function replaceCurrent(cm) {
  if (activeIndex < 0 || activeIndex >= matches.length) return

  const replaceInput = panelEl.querySelector('.replace-input')
  const replaceVal = replaceInput.value
  const match = matches[activeIndex]
  const replaceLines = replaceVal.split('\n')
  const replacedTo = CodeMirror.Pos(
    match.from.line + replaceLines.length - 1,
    replaceLines.length === 1 ? match.from.ch + replaceLines[0].length : replaceLines[replaceLines.length - 1].length
  )

  cm.replaceRange(replaceVal, match.from, match.to)
  cm.setCursor(replacedTo)

  // Re-evaluate query and rebuild matches
  const findInput = panelEl.querySelector('.find-input')
  const queryStr = findInput.value

  if (!queryStr) return

  currentQuery = parseQuery(queryStr)
  refreshMatches(cm, replacedTo, true)
}

function replaceAll(cm) {
  const findInput = panelEl.querySelector('.find-input')
  const queryStr = findInput.value

  if (!queryStr) return

  const replaceInput = panelEl.querySelector('.replace-input')
  const replaceVal = replaceInput.value

  const query = parseQuery(queryStr)
  const caseInsensitive = queryCaseInsensitive(query)

  cm.operation(() => {
    const cursor = cm.getSearchCursor(query, CodeMirror.Pos(cm.firstLine(), 0), {
      caseFold: caseInsensitive
    })

    while (cursor.find(false)) {
      cursor.replace(replaceVal)
    }
  })

  updateSearch(cm, false)
}

function toggleReplaceMode(cm, focusReplace = true) {
  if (!panelEl) return

  const replaceRow = panelEl.querySelector('.replace-row')
  const isHidden = replaceRow.classList.contains('hidden')

  setReplaceModeVisible(isHidden)

  if (isHidden) {
    if (focusReplace) {
      panelEl.querySelector('.replace-input').focus()
      panelEl.querySelector('.replace-input').select()
    }
  } else {
    panelEl.querySelector('.find-input').focus()
  }
}

export function showSearchPanel(cm, replaceMode = false) {
  if (!panelEl) {
    createPanel(cm)
  }

  panelEl.classList.remove('hidden')

  const selection = cm.getSelection()

  if (selection && selection.indexOf('\n') === -1) {
    panelEl.querySelector('.find-input').value = selection
  }

  document.body.classList.add('numara-search-panel-open')
  setReplaceModeVisible(replaceMode)
  updateSearch(cm)

  const input = panelEl.querySelector(replaceMode ? '.replace-input' : '.find-input')
  input.focus()
  input.select()

  setTimeout(() => {
    input.focus()
    input.select()
  }, 50)
}

export function hideSearchPanel(cm) {
  if (!panelEl || panelEl.classList.contains('hidden')) return

  panelEl.classList.add('hidden')

  document.body.classList.remove('numara-search-panel-open')
  document.body.classList.remove('numara-search-replace-open')

  if (currentOverlay) {
    cm.removeOverlay(currentOverlay)
    currentOverlay = null
  }

  currentQuery = null
  matches = []
  activeIndex = -1

  cm.focus()
}

export function isSearchPanelOpen() {
  return panelEl && !panelEl.classList.contains('hidden')
}

function createPanel(cm) {
  const wrapper = cm.getWrapperElement()

  panelEl = document.createElement('div')
  panelEl.className = 'numara-search-panel hidden'
  panelEl.innerHTML = `
    <div class="search-panel-row">
      <button class="search-toggle-replace" title="Toggle Replace (Ctrl+H)">
        ${dom.icons.ChevronRight}
      </button>
      <div class="search-input-wrapper">
        <input type="text" class="search-input find-input" placeholder="Find" />
        <span class="search-count">No results</span>
      </div>
      <div class="search-actions">
        <button class="search-btn btn-prev" title="Previous Match (Shift+Enter)">
          ${dom.icons.ChevronUp}
        </button>
        <button class="search-btn btn-next" title="Next Match (Enter)">
          ${dom.icons.ChevronDown}
        </button>
      </div>
      <button class="search-close-btn" title="Close (Esc)">
        ${dom.icons.X}
      </button>
    </div>
    <div class="search-panel-row replace-row hidden">
      <div class="replace-spacer"></div>
      <div class="search-input-wrapper">
        <input type="text" class="search-input replace-input" placeholder="Replace with" />
      </div>
      <div class="search-actions">
        <button class="search-action-btn btn-replace" title="Replace Current Match">Replace</button>
        <button class="search-action-btn btn-replace-all" title="Replace All Matches">Replace All</button>
      </div>
    </div>
  `

  wrapper.insertBefore(panelEl, wrapper.firstChild)

  const findInput = panelEl.querySelector('.find-input')
  const replaceInput = panelEl.querySelector('.replace-input')

  findInput.addEventListener('input', () => updateSearch(cm))

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      navigateSearch(cm, e.shiftKey)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      hideSearchPanel(cm)
    }
  })

  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      replaceCurrent(cm)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      hideSearchPanel(cm)
    }
  })

  panelEl.querySelector('.search-toggle-replace').addEventListener('click', () => {
    toggleReplaceMode(cm, true)
  })

  panelEl.querySelector('.btn-next').addEventListener('click', () => navigateSearch(cm, false))
  panelEl.querySelector('.btn-prev').addEventListener('click', () => navigateSearch(cm, true))
  panelEl.querySelector('.search-close-btn').addEventListener('click', () => hideSearchPanel(cm))
  panelEl.querySelector('.btn-replace').addEventListener('click', () => replaceCurrent(cm))
  panelEl.querySelector('.btn-replace-all').addEventListener('click', () => replaceAll(cm))

  const debouncedUpdateSearch = debounce(() => {
    if (isSearchPanelOpen()) {
      updateSearch(cm, false)
    }
  }, 120)

  cm.on('changes', () => {
    if (isSearchPanelOpen()) {
      debouncedUpdateSearch()
    }
  })
}
