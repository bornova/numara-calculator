import UIkit from 'uikit'

import { math } from '../core/mathInstance.js'
import {
  applyUdfuToMath,
  compileUdfItems,
  compileUduItems,
  formatUdfPreview,
  RESERVED_KEYS,
  VALID_IDENTIFIER,
  validateUdfParams
} from '../core/udfu.js'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { highlightJsCode, refreshEditor, udfCodeEditor, udfEditor, uduCodeEditor } from '../editor/index.js'
import { app } from '../state/appState.js'
import { events } from '../state/events.js'
import { parseLegacyUdf, parseLegacyUdu } from '../state/migration.js'
import { store } from '../state/store.js'
import { confirm, notify } from '../ui/dialogs.js'
import { calculate, clearEvaluationCache, validateUdfInWorker } from './calcManager.js'

const udfuState = {
  previouslyImportedUDFs: [],
  previouslyCreatedUnits: []
}

const editingIndex = {
  func: null,
  unit: null
}

let udfuMode = 'form'
let isSavingUdfu = false

function getCodeEditor(type) {
  return type === 'func' ? udfCodeEditor : uduCodeEditor
}

function getCodeTextarea(type) {
  return type === 'func' ? dom.udfCodeInput : dom.uduCodeInput
}

function getCodeEditorValue(type) {
  const editor = getCodeEditor(type)
  const textarea = getCodeTextarea(type)

  return editor ? editor.getValue() : (textarea?.value ?? '')
}

function setCodeEditorValue(type, value) {
  const editor = getCodeEditor(type)
  const textarea = getCodeTextarea(type)

  if (editor) {
    editor.setValue(value)
    editor.clearHistory()
  } else if (textarea) {
    textarea.value = value
  }
}

function getRawUdfuSource(type) {
  const isFunc = type === 'func'
  const raw = store.get(isFunc ? 'udf' : 'udu')

  if (typeof raw === 'string') {
    return raw
  }

  const items = store.get(isFunc ? 'udfItems' : 'uduItems') || []

  return isFunc ? compileUdfItems(items) : compileUduItems(items)
}

function applyUdfuMode(mode, persist = false) {
  udfuMode = mode === 'code' ? 'code' : 'form'

  dom.dialogUdfu?.classList.toggle('is-code-mode', udfuMode === 'code')

  dom.els('.udfuModeButton').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.udfuMode === udfuMode)
  })

  if (persist) {
    store.set('udfuMode', udfuMode)
  }
}

function getUdfBodyValue() {
  return udfEditor ? udfEditor.getValue() : dom.udfBodyInput.value
}

function setUdfBodyValue(value) {
  if (udfEditor) {
    udfEditor.setValue(value)
    udfEditor.clearHistory()
  } else {
    dom.udfBodyInput.value = value
  }
}

function focusUdfBody() {
  if (udfEditor) {
    udfEditor.focus()
  } else {
    dom.udfBodyInput.focus()
  }
}

/**
 * Returns DOM element references and item-rendering config for the `'func'` or `'unit'` tab.
 * @param {'func'|'unit'} type Definition type.
 */
function getTabConfig(type) {
  if (type === 'func') {
    return {
      storeKey: 'udfItems',
      listEl: dom.udfList,
      emptyText: 'No user-defined functions or constants.',
      nameInput: dom.udfNameInput,
      saveIcon: dom.udfSaveIcon,
      saveLabel: dom.udfSaveLabel,
      cancelBtn: dom.udfCancelButton,
      clearInputs: () => {
        dom.udfNameInput.value = ''
        dom.udfParamsInput.value = ''
        setUdfBodyValue('')
      },
      loadInputs: (item) => {
        dom.udfNameInput.value = item.name
        dom.udfParamsInput.value = item.params || ''
        setUdfBodyValue(item.body || '')
        requestAnimationFrame(() => udfEditor?.refresh())
      },
      renderContent: (item) => {
        const displayParams = item.params === '()' ? '' : item.params
        const signature = item.params
          ? `<strong>${escapeHTML(item.name)}</strong>(${escapeHTML(displayParams)})`
          : `<strong>${escapeHTML(item.name)}</strong>`
        const { isMultiline, previewCode, hiddenLineCount } = formatUdfPreview(item.body)
        const fullTitle = escapeHTML(`${item.name}${item.params ? `(${displayParams})` : ''} = ${item.body}`)

        if (isMultiline) {
          const headerSuffix = item.params ? '' : ' ='
          const moreMarkup =
            hiddenLineCount > 0
              ? `<div class="udfuItemMore">+${hiddenLineCount} more ${hiddenLineCount === 1 ? 'line' : 'lines'}</div>`
              : ''

          return {
            html: `
              <div class="udfuItemContent udfuItemContentMultiline" title="${fullTitle}">
                <div class="udfuItemHeader"><span class="udfuItemSignature">${signature}${headerSuffix}</span></div>
                <div class="udfuItemCode udfuItemCodeBlock cm-s-udfu"></div>
                ${moreMarkup}
              </div>
            `,
            isMultiline: true,
            highlightCode: previewCode
          }
        }

        return {
          html: `
            <div class="udfuItemContent" title="${fullTitle}">
              <span class="udfuItemSignature">${signature} = </span><span class="udfuItemCode cm-s-udfu"></span>
            </div>
          `,
          isMultiline: false,
          highlightCode: previewCode
        }
      }
    }
  }

  return {
    storeKey: 'uduItems',
    listEl: dom.uduList,
    emptyText: 'No user-defined units.',
    nameInput: dom.uduNameInput,
    saveIcon: dom.uduSaveIcon,
    saveLabel: dom.uduSaveLabel,
    cancelBtn: dom.uduCancelButton,
    clearInputs: () => {
      dom.uduNameInput.value = ''
      dom.uduDefInput.value = ''
      dom.uduAliasesInput.value = ''
      dom.uduPrefixesSelect.value = 'none'
    },
    loadInputs: (item) => {
      dom.uduNameInput.value = item.name
      dom.uduDefInput.value = item.definition || ''
      dom.uduAliasesInput.value = item.aliases || ''
      dom.uduPrefixesSelect.value = item.prefixes || 'none'
    },
    renderContent: (item) => {
      const badges = []

      if (item.aliases?.trim()) {
        badges.push(`<span class="udfuBadge">Aliases: ${escapeHTML(item.aliases.trim())}</span>`)
      }

      if (item.prefixes && item.prefixes !== 'none') {
        badges.push(`<span class="udfuBadge">Prefixes: ${escapeHTML(item.prefixes)}</span>`)
      }

      return {
        html: `
          <div class="udfuItemContent" title="${escapeHTML(`${item.name} = ${item.definition}`)}">
            <span class="udfuItemSignature"><strong>${escapeHTML(item.name)}</strong> = </span><span class="udfuItemCode">${escapeHTML(item.definition)}</span>
            ${badges.join('')}
          </div>
        `,
        isMultiline: false,
        highlightCode: null
      }
    }
  }
}

/**
 * Validates user-defined functions via Web Worker evaluation and persists to storage.
 * @param {string} input User-defined function definition string.
 * @returns {Promise<void>}
 */
async function applyUdf(input) {
  const keys = await validateUdfInWorker(input)

  app.udfList = keys
  store.set('udf', input)
}

/**
 * Applies user-defined units declaratively to the main-thread Math.js instance and persists to storage.
 * @param {string} input User-defined unit definition string.
 */
function applyUdu(input) {
  const keys = applyUdfuToMath(math, input, false, udfuState)

  app.uduList = keys
  store.set('udu', input)
}

/**
 * Re-applies active user-defined units to the main-thread Math.js instance after currency state refreshes.
 */
export function reapplyMainThreadUdu() {
  const uduSource = store.get('udu')
  if (!uduSource) return

  try {
    app.uduList = applyUdfuToMath(math, uduSource, false, udfuState)
  } catch {
    // Ignore main-thread re-apply error
  }
}

/**
 * Updates the Add/Save button icon visibility, label, and Cancel button visibility for a UDF/UDU form.
 * @param {object} cfg Tab configuration from `getTabConfig`.
 * @param {boolean} isEditing Whether the form is currently in edit mode.
 */
function setFormEditMode({ saveIcon, saveLabel, cancelBtn }, isEditing) {
  saveIcon.style.display = isEditing ? 'none' : ''
  saveLabel.textContent = isEditing ? 'Save' : 'Add'
  cancelBtn.style.display = isEditing ? '' : 'none'
}

/**
 * Resets a UDF or UDU tab form and edit state.
 * @param {'func'|'unit'} type Definition type.
 */
function resetForm(type) {
  const cfg = getTabConfig(type)

  editingIndex[type] = null
  cfg.clearInputs()
  setFormEditMode(cfg, false)
}

function isValidUdfuIdentifier(str) {
  return Boolean(str && VALID_IDENTIFIER.test(str) && !RESERVED_KEYS.has(str))
}

/**
 * Renders rows into a UDF or UDU list container using a single DocumentFragment.
 * @param {'func'|'unit'} type Definition type.
 */
function renderList(type) {
  const { storeKey, listEl, emptyText, renderContent } = getTabConfig(type)

  if (!listEl) return

  const items = store.get(storeKey) || []

  if (items.length === 0) {
    listEl.innerHTML = `<div class="udfuEmpty">${emptyText}</div>`
    return
  }

  const activeEdit = editingIndex[type]
  const fragment = document.createDocumentFragment()

  items.forEach((item, index) => {
    const row = document.createElement('div')
    const { html, isMultiline, highlightCode } = renderContent(item)

    row.className = `udfuItem${isMultiline ? ' is-multiline' : ''}${activeEdit === index ? ' is-editing' : ''}`
    row.dataset.udfuIndex = String(index)
    row.innerHTML = `
      ${html}
      <div class="udfuItemActions">
        <span class="editUdfuButton" data-action="udfu-edit" data-udfu-index="${index}" title="Edit">${dom.icons.Pencil}</span>
        <span class="deleteUdfuButton" data-action="udfu-delete" data-udfu-index="${index}" title="Delete">${dom.icons.Trash2}</span>
      </div>
    `

    if (highlightCode !== null) {
      highlightJsCode(highlightCode, row.querySelector('.udfuItemCode'))
    }

    fragment.appendChild(row)
  })

  listEl.replaceChildren(fragment)
}

/**
 * Refreshes the User Defined Functions & Units dialog lists, code editors, and active view mode.
 */
function prepareUdfuDialog() {
  const savedMode = store.get('udfuMode') === 'code' ? 'code' : 'form'

  resetForm('func')
  resetForm('unit')
  renderList('func')
  renderList('unit')
  setCodeEditorValue('func', getRawUdfuSource('func'))
  setCodeEditorValue('unit', getRawUdfuSource('unit'))
  applyUdfuMode(savedMode, false)
}

/**
 * Validates, applies, and persists raw JS UDF/declarative UDU code and syncs structured items for Form view.
 * @param {string} rawInput Raw definition object-body string.
 * @param {'func'|'unit'} type Definition type.
 * @param {{ showSuccess?: boolean }} [options] Notification options.
 * @returns {Promise<boolean>} True if applied and saved successfully.
 */
async function commitRawUdfu(rawInput, type, { showSuccess = true } = {}) {
  if (isSavingUdfu) return false

  isSavingUdfu = true

  const isFunc = type === 'func'
  const trimmed = rawInput.trim()
  const prevRaw = store.get(isFunc ? 'udf' : 'udu') ?? ''

  try {
    if (isFunc) {
      await applyUdf(trimmed)
    } else {
      applyUdu(trimmed)
    }

    const parsedItems = isFunc ? parseLegacyUdf(trimmed) : parseLegacyUdu(trimmed, math)

    store.set(isFunc ? 'udfItems' : 'uduItems', parsedItems)
    clearEvaluationCache()
    refreshEditor()
    calculate()
    renderList(type)

    if (showSuccess) {
      notify(isFunc ? 'User-defined functions saved.' : 'User-defined units saved.')
    }

    return true
  } catch (error) {
    if (!isFunc) {
      try {
        applyUdu(prevRaw)
      } catch {
        // Ignore fallback error
      }
    }

    notify(escapeHTML(error.message || 'Invalid definition.'), 'danger')
    return false
  } finally {
    isSavingUdfu = false
  }
}

async function handleSaveRawUdfu(type) {
  await commitRawUdfu(getCodeEditorValue(type), type, { showSuccess: true })
}

function syncActiveTabFocus(udTab) {
  const type = udTab === 1 ? 'func' : 'unit'

  if (udfuMode === 'code') {
    const codeEditor = getCodeEditor(type)

    codeEditor?.refresh()
    codeEditor?.focus()
    return
  }

  if (udTab === 1) {
    udfEditor?.refresh()
  }

  const focusEl = udTab === 1 ? dom.udfNameInput : dom.uduNameInput
  focusEl?.focus()
}

async function switchUdfuMode(nextMode, udTab) {
  if (nextMode === udfuMode || isSavingUdfu) return

  if (nextMode === 'code') {
    resetForm('func')
    resetForm('unit')
    renderList('func')
    renderList('unit')
    setCodeEditorValue('func', getRawUdfuSource('func'))
    setCodeEditorValue('unit', getRawUdfuSource('unit'))
    applyUdfuMode('code', true)
    requestAnimationFrame(() => syncActiveTabFocus(udTab))
    return
  }

  for (const type of ['func', 'unit']) {
    const draft = getCodeEditorValue(type)

    if (draft.trim() !== getRawUdfuSource(type).trim()) {
      if (!(await commitRawUdfu(draft, type, { showSuccess: false }))) {
        return
      }
    }
  }

  applyUdfuMode('form', true)
  resetForm('func')
  resetForm('unit')
  renderList('func')
  renderList('unit')
  requestAnimationFrame(() => syncActiveTabFocus(udTab))
}

/**
 * Validates, applies, and persists an updated `udfItems` or `uduItems` array.
 * @param {Array} nextItems Updated item array.
 * @param {'func'|'unit'} type Definition type.
 * @returns {Promise<boolean>} True if applied and saved successfully.
 */
async function commitUdfuItems(nextItems, type) {
  if (isSavingUdfu) return false

  isSavingUdfu = true

  const isFunc = type === 'func'

  try {
    const compiled = isFunc ? compileUdfItems(nextItems) : compileUduItems(nextItems)
    const prevCompiled = store.get(isFunc ? 'udf' : 'udu') ?? ''

    try {
      if (isFunc) {
        await applyUdf(compiled)
      } else {
        applyUdu(compiled)
      }

      store.set(isFunc ? 'udfItems' : 'uduItems', nextItems)
      clearEvaluationCache()
      refreshEditor()
      calculate()
      return true
    } catch (error) {
      if (!isFunc) {
        try {
          applyUdu(prevCompiled)
        } catch {
          // Ignore fallback error
        }
      }

      throw error
    }
  } catch (error) {
    notify(escapeHTML(error.message || 'Invalid definition.'), 'danger')
    return false
  } finally {
    isSavingUdfu = false
  }
}

/**
 * Validates duplicate names, inserts or replaces an entry, and commits/refreshes the UDF or UDU form.
 * @param {'func'|'unit'} type Definition type.
 * @param {object} entry Entry payload to save.
 */
async function saveUdfuEntry(type, entry) {
  const { storeKey, nameInput } = getTabConfig(type)
  const items = [...(store.get(storeKey) || [])]
  const activeEdit = editingIndex[type]

  if (items.some((item, idx) => item.name === entry.name && idx !== activeEdit)) {
    notify(`"${escapeHTML(entry.name)}" is already defined.`, 'danger')
    nameInput.focus()
    return
  }

  if (activeEdit !== null && activeEdit >= 0 && activeEdit < items.length) {
    items[activeEdit] = entry
  } else {
    items.push(entry)
  }

  if (await commitUdfuItems(items, type)) {
    resetForm(type)
    renderList(type)
    nameInput.focus()
  }
}

/**
 * Handles adding or saving a user-defined function/constant.
 */
async function handleSaveUdf() {
  const name = dom.udfNameInput.value.trim()
  const params = dom.udfParamsInput.value.trim()
  const body = getUdfBodyValue().trim()

  if (!isValidUdfuIdentifier(name)) {
    notify('Please enter a valid function or constant name (letters, numbers, _, $).', 'danger')
    dom.udfNameInput.focus()
    return
  }

  try {
    validateUdfParams(params)
  } catch (error) {
    notify(escapeHTML(error.message || 'Invalid parameters.'), 'danger')
    dom.udfParamsInput.focus()
    return
  }

  if (!body) {
    notify('Please enter an expression or function body.', 'danger')
    focusUdfBody()
    return
  }

  await saveUdfuEntry('func', { name, params, body })
}

/**
 * Handles adding or saving a user-defined unit.
 */
async function handleSaveUdu() {
  const name = dom.uduNameInput.value.trim()
  const definition = dom.uduDefInput.value.trim().replace(/^["']|["']$/g, '')
  const aliases = dom.uduAliasesInput.value.trim()
  const prefixes = dom.uduPrefixesSelect.value || 'none'

  if (!isValidUdfuIdentifier(name)) {
    notify('Please enter a valid unit name (letters, numbers, _, $).', 'danger')
    dom.uduNameInput.focus()
    return
  }

  const existingItem = editingIndex.unit !== null ? (store.get('uduItems') || [])[editingIndex.unit] : null
  const allowsStandaloneBase = Boolean(existingItem && !existingItem.definition)

  if (!definition && !allowsStandaloneBase) {
    notify('Please enter a unit definition (e.g. 18 foot).', 'danger')
    dom.uduDefInput.focus()
    return
  }

  const aliasList = aliases
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)

  for (const alias of aliasList) {
    if (!isValidUdfuIdentifier(alias)) {
      notify(`Invalid unit alias: "${escapeHTML(alias)}".`, 'danger')
      dom.uduAliasesInput.focus()
      return
    }
  }

  const extraFields = {}
  if (existingItem?.offset !== undefined) extraFields.offset = existingItem.offset
  if (existingItem?.baseName) extraFields.baseName = existingItem.baseName

  await saveUdfuEntry('unit', { name, definition, prefixes, aliases: aliasList.join(', '), ...extraFields })
}

/**
 * Loads a function or unit item into the form for editing.
 * @param {'func'|'unit'} type Definition type.
 * @param {number} index Index in the stored items list.
 */
function startEdit(type, index) {
  const cfg = getTabConfig(type)
  const item = (store.get(cfg.storeKey) || [])[index]

  if (!item) return

  editingIndex[type] = index
  cfg.loadInputs(item)
  setFormEditMode(cfg, true)

  renderList(type)
  cfg.nameInput.focus()
}

/**
 * Prompts for confirmation, deletes a UDF or UDU entry at `index`, and adjusts active edit state.
 * @param {'func'|'unit'} type Definition type.
 * @param {number} index Index to remove.
 */
function deleteUdfuAt(type, index) {
  const { storeKey, nameInput } = getTabConfig(type)
  const target = (store.get(storeKey) || [])[index]

  if (!target) return

  confirm(`"${target.name}" will be deleted.`, async () => {
    const items = [...(store.get(storeKey) || [])]
    const targetIdx = items[index]?.name === target.name ? index : items.findIndex((item) => item.name === target.name)

    if (targetIdx === -1) return

    items.splice(targetIdx, 1)

    if (await commitUdfuItems(items, type)) {
      const currentEdit = editingIndex[type]

      if (currentEdit === targetIdx) {
        resetForm(type)
      } else if (currentEdit !== null && currentEdit > targetIdx) {
        editingIndex[type] = currentEdit - 1
      }

      renderList(type)

      if (dom.dialogUdfu?.classList.contains('uk-open')) {
        nameInput?.focus()
      }
    }
  })
}

/**
 * Binds edit/delete button click and row double-click listeners to a UDF or UDU list container.
 * @param {HTMLElement} listEl List container element.
 * @param {'func'|'unit'} type Definition type.
 */
function bindUdfuListEvents(listEl, type) {
  listEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]')

    if (!btn) return

    const index = Number(btn.dataset.udfuIndex)

    if (btn.dataset.action === 'udfu-edit') {
      startEdit(type, index)
    } else if (btn.dataset.action === 'udfu-delete') {
      deleteUdfuAt(type, index)
    }
  })

  listEl.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.udfuItem')

    if (row && !event.target.closest('.udfuItemActions')) {
      startEdit(type, Number(row.dataset.udfuIndex))
    }
  })
}

/**
 * Loads user-defined functions and units from storage and binds dialog UI events.
 */
export function setupUserDefined() {
  const storedUdf = store.get('udf')
  const storedUdu = store.get('udu')
  const storedUdfItems = store.get('udfItems')
  const storedUduItems = store.get('uduItems')
  const udfSource =
    typeof storedUdf === 'string' ? storedUdf : Array.isArray(storedUdfItems) ? compileUdfItems(storedUdfItems) : ''
  const uduSource =
    typeof storedUdu === 'string' ? storedUdu : Array.isArray(storedUduItems) ? compileUduItems(storedUduItems) : ''

  app.udfList = Array.isArray(storedUdfItems) ? storedUdfItems.map((item) => item?.name).filter(Boolean) : []

  if (typeof storedUdf !== 'string' && udfSource) {
    store.set('udf', udfSource)
  }

  try {
    applyUdu(uduSource)
  } catch (error) {
    console.error('Error loading user-defined units:', error)
  }

  dom.udfSaveButton.addEventListener('click', handleSaveUdf)
  dom.udfCancelButton.addEventListener('click', () => {
    resetForm('func')
    renderList('func')
  })

  dom.uduSaveButton.addEventListener('click', handleSaveUdu)
  dom.uduCancelButton.addEventListener('click', () => {
    resetForm('unit')
    renderList('unit')
  })

  const bindEnterToSave = (inputs, saveFn) => {
    for (const input of inputs) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          saveFn()
        }
      })
    }
  }

  bindEnterToSave([dom.udfNameInput, dom.udfParamsInput], handleSaveUdf)
  bindEnterToSave([dom.uduNameInput, dom.uduDefInput, dom.uduAliasesInput], handleSaveUdu)

  events.on('udf:save', handleSaveUdf)
  events.on('udfCode:save', () => handleSaveRawUdfu('func'))
  events.on('uduCode:save', () => handleSaveRawUdfu('unit'))

  dom.udfCodeSaveButton?.addEventListener('click', () => handleSaveRawUdfu('func'))
  dom.uduCodeSaveButton?.addEventListener('click', () => handleSaveRawUdfu('unit'))

  bindUdfuListEvents(dom.udfList, 'func')
  bindUdfuListEvents(dom.uduList, 'unit')

  let udTab = 1

  dom.els('.udfuModeButton').forEach((btn) => {
    btn.addEventListener('click', () => switchUdfuMode(btn.dataset.udfuMode, udTab))
  })

  UIkit.util.on('#dialogUdfu', 'beforeshow', prepareUdfuDialog, { self: true })

  UIkit.util.on('#dialogUdfu', 'shown', () => syncActiveTabFocus(udTab), { self: true })

  UIkit.util.on(
    '#udfTab, #uduTab',
    'shown',
    (event) => {
      udTab = event.target.id === 'udfTab' ? 1 : 2
      syncActiveTabFocus(udTab)
    },
    { self: true }
  )
}
