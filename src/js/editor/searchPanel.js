import CodeMirror from 'codemirror'

import { debounce, escapeRegExp } from '../core/utils.js'
import { dom } from '../dom.js'

let panelEl = null
let findInputEl = null
let replaceInputEl = null
let countEl = null
let replaceRowEl = null
let toggleReplaceBtn = null
let debouncedUpdateSearch = null
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

function selectMatch(cm, index) {
  if (index < 0 || index >= matches.length) return

  const match = matches[index]

  cm.setSelection(match.from, match.to)
  cm.scrollIntoView({ from: match.from, to: match.to }, 50)
}

function refreshMatches(cm, fromPos, select = true) {
  matches = getMatches(cm, currentQuery)

  if (matches.length > 0) {
    const foundIndex = matches.findIndex((m) => CodeMirror.cmpPos(m.from, fromPos) >= 0)

    activeIndex = foundIndex === -1 ? 0 : foundIndex
    countEl.textContent = `${activeIndex + 1} of ${matches.length}`

    if (select) {
      selectMatch(cm, activeIndex)
    }
  } else {
    activeIndex = -1
    countEl.textContent = '0 of 0'
  }
}

function setReplaceModeVisible(cm, visible) {
  replaceRowEl.classList.toggle('hidden', !visible)
  toggleReplaceBtn.classList.toggle('expanded', visible)
  document.body.classList.toggle('numara-search-replace-open', visible)
  cm.refresh()
}

function updateSearch(cm, select = true) {
  if (!panelEl) return

  const queryStr = findInputEl.value

  // Remove previous overlay
  if (currentOverlay) {
    cm.removeOverlay(currentOverlay)
    currentOverlay = null
  }

  if (!queryStr) {
    currentQuery = null
    matches = []
    activeIndex = -1
    countEl.textContent = 'No results'

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

  countEl.textContent = `${activeIndex + 1} of ${matches.length}`
  selectMatch(cm, activeIndex)
}

function replaceCurrent(cm) {
  if (activeIndex < 0 || activeIndex >= matches.length) return

  const replaceVal = replaceInputEl.value
  const match = matches[activeIndex]
  const replaceLines = replaceVal.split('\n')
  const replacedTo = CodeMirror.Pos(
    match.from.line + replaceLines.length - 1,
    replaceLines.length === 1 ? match.from.ch + replaceLines[0].length : replaceLines[replaceLines.length - 1].length
  )

  cm.replaceRange(replaceVal, match.from, match.to)
  debouncedUpdateSearch?.cancel()
  cm.setCursor(replacedTo)

  // Re-evaluate query and rebuild matches
  const queryStr = findInputEl.value

  if (!queryStr) return

  currentQuery = parseQuery(queryStr)
  refreshMatches(cm, replacedTo, true)
}

function replaceAll(cm) {
  const queryStr = findInputEl.value

  if (!queryStr) return

  const replaceVal = replaceInputEl.value
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

  debouncedUpdateSearch?.cancel()
  updateSearch(cm, false)
}

function toggleReplaceMode(cm) {
  if (!panelEl) return

  const isHidden = replaceRowEl.classList.contains('hidden')

  setReplaceModeVisible(cm, isHidden)

  if (isHidden) {
    replaceInputEl.focus()
    replaceInputEl.select()
  } else {
    findInputEl.focus()
  }
}

export function showSearchPanel(cm, replaceMode = false) {
  if (!panelEl) {
    createPanel(cm)
  }

  panelEl.classList.remove('hidden')

  const selection = cm.getSelection()

  if (selection && selection.indexOf('\n') === -1) {
    findInputEl.value = selection
  }

  document.body.classList.add('numara-search-panel-open')
  setReplaceModeVisible(cm, replaceMode)
  updateSearch(cm)

  const input = replaceMode ? replaceInputEl : findInputEl
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

  cm.refresh()
  cm.focus()
}

export function isSearchPanelOpen() {
  return panelEl && !panelEl.classList.contains('hidden')
}

function createPanel(cm) {
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

  dom.mainPanel.insertBefore(panelEl, dom.mainPanel.firstChild)

  findInputEl = panelEl.querySelector('.find-input')
  replaceInputEl = panelEl.querySelector('.replace-input')
  countEl = panelEl.querySelector('.search-count')
  replaceRowEl = panelEl.querySelector('.replace-row')
  toggleReplaceBtn = panelEl.querySelector('.search-toggle-replace')

  findInputEl.addEventListener('input', () => updateSearch(cm))

  findInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      navigateSearch(cm, e.shiftKey)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      hideSearchPanel(cm)
    }
  })

  replaceInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      replaceCurrent(cm)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      hideSearchPanel(cm)
    }
  })

  toggleReplaceBtn.addEventListener('click', () => {
    toggleReplaceMode(cm)
  })

  panelEl.querySelector('.btn-next').addEventListener('click', () => navigateSearch(cm, false))
  panelEl.querySelector('.btn-prev').addEventListener('click', () => navigateSearch(cm, true))
  panelEl.querySelector('.search-close-btn').addEventListener('click', () => hideSearchPanel(cm))
  panelEl.querySelector('.btn-replace').addEventListener('click', () => replaceCurrent(cm))
  panelEl.querySelector('.btn-replace-all').addEventListener('click', () => replaceAll(cm))

  debouncedUpdateSearch = debounce(() => {
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
