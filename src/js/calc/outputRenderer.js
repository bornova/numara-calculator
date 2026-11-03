import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { outputContext } from '../ui/contextMenu.js'

let lastSyncedDocHeight = -1
let lastSyncedLineCount = -1
let lastSyncedLineDivWidth = -1

/**
 * Formats an individual answer HTML string with an optional truncation tooltip.
 * @param {string} result The raw answer HTML string.
 * @returns {string} The display HTML string.
 */
function formatDisplayAnswer(result) {
  const raw = result || ''

  if (app.settings.truncateAnswers && raw && raw.includes('class="answer"') && !raw.includes('uk-tooltip')) {
    const tooltipText = escapeHTML(raw.replace(/<[^>]*>/g, ''))

    return raw.replace('class="answer"', `class="answer" title="${tooltipText}" uk-tooltip`)
  }

  return raw
}

/**
 * Collects folded line indices and fold ranges from the active CodeMirror instance.
 * @returns {{ foldedLines: Set<number>, folds: Array<{ from: number, to: number }> }}
 */
export function getFoldedState() {
  const foldedLines = new Set()
  const folds = []

  if (typeof cm !== 'undefined' && typeof cm.getAllMarks === 'function') {
    for (const mark of cm.getAllMarks()) {
      if (mark.__isFold) {
        const range = mark.find()

        if (range) {
          folds.push({ from: range.from.line, to: range.to.line })

          for (let i = range.from.line + 1; i <= range.to.line; i++) {
            foldedLines.add(i)
          }
        }
      }
    }
  }

  return { foldedLines, folds }
}

/**
 * Update the line widget with the answer when `answerPosition` is `'bottom'`.
 * @param {object} lineHandle The CodeMirror line handle.
 * @param {string} answer The answer to display.
 * @param {number} lineIndex The absolute 0-based line index.
 * @param {boolean} isFolded Whether the line is currently folded.
 */
export function updateLineWidget(lineHandle, answer, lineIndex, isFolded) {
  let widget = app.widgetMap.get(lineHandle)

  if (widget) {
    let changed = false

    if (widget.node.dataset.index !== String(lineIndex)) {
      widget.node.dataset.index = lineIndex
    }

    if (widget.node.dataset.rawHtml !== answer) {
      widget.node.dataset.rawHtml = answer
      widget.node.innerHTML = answer
      changed = true
    }

    const newDisplay = isFolded ? 'none' : ''

    if (widget.node.style.display !== newDisplay) {
      widget.node.style.display = newDisplay
      changed = true
    }

    if (changed) {
      widget.changed()
    }
  } else {
    const node = document.createElement('div')

    node.dataset.index = lineIndex
    node.dataset.rawHtml = answer
    node.innerHTML = answer
    node.addEventListener('contextmenu', outputContext)
    node.style.display = isFolded ? 'none' : ''

    widget = cm.addLineWidget(lineHandle, node, { above: false, coverGutter: false, noHScroll: true })
    widget.node = node

    app.widgetMap.set(lineHandle, widget)
  }
}

/**
 * Synchronizes the heights of output display items with their corresponding CodeMirror inputs.
 * @param {boolean} [force=true] When false, skips full DOM height pass if CodeMirror geometry is unchanged.
 */
export function syncOutputHeights(force = true) {
  const cmScroll = dom.el('.CodeMirror-scroll')

  if (app.settings.answerPosition === 'bottom') {
    const newHeight = cmScroll.scrollHeight - 50
    const currentEl = dom.output.firstElementChild

    if (!currentEl || currentEl.style.height !== `${newHeight}px`) {
      dom.output.innerHTML = `<div style="height: ${newHeight}px;"></div>`
    }

    if (dom.output.scrollTop !== cmScroll.scrollTop) {
      dom.output.scrollTop = cmScroll.scrollTop
    }

    return
  }

  const outputWrapper = dom.output.firstElementChild

  if (!outputWrapper) return

  const outputChildren = outputWrapper.children
  const totalLines = Math.min(cm.lineCount(), outputChildren.length)

  if (totalLines === 0) return

  const docHeight = cm.doc.height
  const lineDivWidth = cm.display.lineDiv.clientWidth

  if (
    !force &&
    docHeight === lastSyncedDocHeight &&
    totalLines === lastSyncedLineCount &&
    lineDivWidth === lastSyncedLineDivWidth
  ) {
    if (dom.output.scrollTop !== cmScroll.scrollTop) {
      dom.output.scrollTop = cmScroll.scrollTop
    }

    return
  }

  lastSyncedDocHeight = docHeight
  lastSyncedLineCount = totalLines
  lastSyncedLineDivWidth = lineDivWidth

  const { foldedLines } = getFoldedState()
  const hasFolds = foldedLines.size > 0
  const visibleChildren = cm.display.lineDiv.children
  const visibleCount = visibleChildren.length

  // Phase 1: Read all line heights from the DOM before any style writes to prevent layout thrashing
  const lineWrap = Boolean(app.settings?.lineWrap)
  let uniformHeightStr = null
  let measuredHeights = null

  if (!lineWrap && !hasFolds) {
    const h = visibleCount > 0 ? visibleChildren[0].clientHeight || 27 : 27
    uniformHeightStr = `${h}px`
  } else {
    measuredHeights = new Array(visibleCount)

    for (let v = 0; v < visibleCount; v++) {
      measuredHeights[v] = `${visibleChildren[v].clientHeight || 27}px`
    }
  }

  // Phase 2: Batch all DOM style writes without interleaving layout reads
  if (uniformHeightStr !== null) {
    if (outputWrapper.dataset.uniformHeight !== uniformHeightStr) {
      outputWrapper.style.setProperty('--output-line-height', uniformHeightStr)
      outputWrapper.dataset.uniformHeight = uniformHeightStr
    }

    if (outputWrapper.dataset.hasCustomLineHeights === 'true') {
      for (let i = 0; i < totalLines; i++) {
        const el = outputChildren[i]

        if (el.style.display !== '') {
          el.style.display = ''
        }

        if (el.style.height !== '') {
          el.style.height = ''
        }
      }

      delete outputWrapper.dataset.hasCustomLineHeights
    }
  } else {
    outputWrapper.dataset.hasCustomLineHeights = 'true'
    let visibleIndex = 0
    let lineIndex = 0

    cm.eachLine((lineHandle) => {
      if (lineIndex >= totalLines) return

      const el = outputChildren[lineIndex]
      const isHidden = Boolean(lineHandle.hidden) || (hasFolds && foldedLines.has(lineIndex))

      if (isHidden) {
        if (el.style.display !== 'none') {
          el.style.display = 'none'
        }
      } else {
        const newHeightStr = visibleIndex < visibleCount ? measuredHeights[visibleIndex++] : '27px'

        if (el.style.display !== '') {
          el.style.display = ''
        }

        if (el.style.height !== newHeightStr) {
          el.style.height = newHeightStr
        }
      }

      lineIndex++
    })
  }

  if (dom.output.scrollTop !== cmScroll.scrollTop) {
    dom.output.scrollTop = cmScroll.scrollTop
  }
}

/**
 * Generate output panel HTML for a list of answers.
 * @param {Array<string>} answers The list of answer HTML strings.
 * @returns {string} The complete outputResults HTML string.
 */
export function renderAnswersToHTML(answers) {
  const classRuler = app.settings.rulers ? 'ruler' : 'noRuler'
  const outputAnswers = new Array(answers.length)

  for (let lineIndex = 0; lineIndex < answers.length; lineIndex++) {
    outputAnswers[lineIndex] =
      `<div class="${classRuler}" data-index="${lineIndex}">${formatDisplayAnswer(answers[lineIndex])}</div>`
  }

  return `<div class="outputWrapper">${outputAnswers.join('')}</div>`
}

/**
 * Incrementally updates the output panel DOM in place to avoid full innerHTML rebuilds and forced reflows.
 * @param {string[]} answers The list of evaluated answer HTML strings.
 */
export function updateOutputDOM(answers) {
  const wrapper = dom.output.firstElementChild

  if (!wrapper || !wrapper.classList.contains('outputWrapper')) {
    dom.output.innerHTML = renderAnswersToHTML(answers)
    return
  }

  const classRuler = app.settings.rulers ? 'ruler' : 'noRuler'
  const children = wrapper.children
  const currentCount = children.length
  const targetCount = answers.length

  for (let i = currentCount - 1; i >= targetCount; i--) {
    children[i].remove()
  }

  const updateCount = Math.min(currentCount, targetCount)

  for (let i = 0; i < updateCount; i++) {
    const row = children[i]
    const displayResult = formatDisplayAnswer(answers[i])

    if (row.className !== classRuler) {
      row.className = classRuler
    }

    if (row.dataset.rawHtml !== displayResult) {
      row.dataset.rawHtml = displayResult
      row.innerHTML = displayResult
    }
  }

  if (targetCount > currentCount) {
    const fragment = document.createDocumentFragment()

    for (let i = currentCount; i < targetCount; i++) {
      const row = document.createElement('div')
      const displayResult = formatDisplayAnswer(answers[i])

      row.className = classRuler
      row.dataset.index = i
      row.dataset.rawHtml = displayResult
      row.innerHTML = displayResult
      fragment.appendChild(row)
    }

    wrapper.appendChild(fragment)
  }
}
