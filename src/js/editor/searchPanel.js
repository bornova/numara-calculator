import CodeMirror from 'codemirror'

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

  const isRE = queryStr.match(/^\/(.*)\/([a-z]*)$/)

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
    const escaped = query.replace(new RegExp('[-/\\\\^$*+?.()|[\\]{}]', 'g'), '\\$&')

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

export function updateSearch(cm) {
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

  matches = getMatches(cm, currentQuery)

  if (matches.length > 0) {
    // Find the first match starting from or after the selection
    const cursor = cm.getCursor('from')
    let foundIndex = 0

    for (let i = 0; i < matches.length; i++) {
      if (comparePos(matches[i].from, cursor) >= 0) {
        foundIndex = i
        break
      }
    }

    activeIndex = foundIndex
    panelEl.querySelector('.search-count').textContent = `${activeIndex + 1} of ${matches.length}`
    selectMatch(cm, activeIndex)
  } else {
    activeIndex = -1
    panelEl.querySelector('.search-count').textContent = '0 of 0'
  }
}

export function navigateSearch(cm, reverse = false) {
  if (matches.length === 0) return

  activeIndex = reverse ? (activeIndex - 1 + matches.length) % matches.length : (activeIndex + 1) % matches.length

  panelEl.querySelector('.search-count').textContent = `${activeIndex + 1} of ${matches.length}`
  selectMatch(cm, activeIndex)
}

export function replaceCurrent(cm) {
  if (activeIndex < 0 || activeIndex >= matches.length) return

  const replaceInput = panelEl.querySelector('.replace-input')
  const replaceVal = replaceInput.value
  const match = matches[activeIndex]

  cm.replaceRange(replaceVal, match.from, match.to)

  // Re-evaluate query and rebuild matches
  const findInput = panelEl.querySelector('.find-input')
  const queryStr = findInput.value

  if (!queryStr) return

  currentQuery = parseQuery(queryStr)
  matches = getMatches(cm, currentQuery)

  if (matches.length > 0) {
    if (activeIndex >= matches.length) {
      activeIndex = 0
    }

    panelEl.querySelector('.search-count').textContent = `${activeIndex + 1} of ${matches.length}`
    selectMatch(cm, activeIndex)
  } else {
    activeIndex = -1
    panelEl.querySelector('.search-count').textContent = '0 of 0'
  }
}

export function replaceAll(cm) {
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

  updateSearch(cm)
}

export function toggleReplaceMode(cm, focusReplace = true) {
  if (!panelEl) return

  const replaceRow = panelEl.querySelector('.replace-row')
  const toggleBtn = panelEl.querySelector('.search-toggle-replace')
  const isHidden = replaceRow.classList.contains('hidden')

  if (isHidden) {
    replaceRow.classList.remove('hidden')
    toggleBtn.classList.add('expanded')
    document.body.classList.add('numara-search-replace-open')

    if (focusReplace) {
      panelEl.querySelector('.replace-input').focus()
      panelEl.querySelector('.replace-input').select()
    }
  } else {
    replaceRow.classList.add('hidden')
    toggleBtn.classList.remove('expanded')
    document.body.classList.remove('numara-search-replace-open')
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

  const replaceRow = panelEl.querySelector('.replace-row')
  const toggleBtn = panelEl.querySelector('.search-toggle-replace')

  document.body.classList.add('numara-search-panel-open')

  if (replaceMode) {
    replaceRow.classList.remove('hidden')
    toggleBtn.classList.add('expanded')
    document.body.classList.add('numara-search-replace-open')

    updateSearch(cm)

    setTimeout(() => {
      panelEl.querySelector('.replace-input').focus()
      panelEl.querySelector('.replace-input').select()
    }, 50)
  } else {
    document.body.classList.remove('numara-search-replace-open')

    updateSearch(cm)

    setTimeout(() => {
      panelEl.querySelector('.find-input').focus()
      panelEl.querySelector('.find-input').select()
    }, 50)
  }
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
    <div class="search-panel-row find-row">
      <button class="search-toggle-replace" title="Toggle Replace (Ctrl+H)">
        <svg class="icon-chevron" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
      <div class="search-input-wrapper">
        <input type="text" class="search-input find-input" placeholder="Find" />
        <span class="search-count">No results</span>
      </div>
      <div class="search-actions">
        <button class="search-btn btn-prev" title="Previous Match (Shift+Enter)">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="18 15 12 9 6 15"></polyline></svg>
        </button>
        <button class="search-btn btn-next" title="Next Match (Enter)">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
      </div>
      <button class="search-close-btn" title="Close (Esc)">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
}
