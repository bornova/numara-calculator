import { DateTime } from 'luxon'

import {
  applyUdfuToMath,
  compileUdfItems,
  compileUduItems,
  parseLegacyUdf,
  parseLegacyUdu,
  RESERVED_KEYS,
  VALID_IDENTIFIER
} from '../core/udfu.js'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { refreshEditor } from '../editor/index.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import { notify, showError } from '../ui/dialogs.js'
import { calculate, clearEvaluationCache, math } from './calcManager.js'

const udfuState = {
  previouslyImportedUDFs: [],
  previouslyCreatedUnits: []
}

let editingUdfIndex = null
let editingUduIndex = null

/**
 * Migrates legacy raw `udf` and `udu` strings into structured `udfItems` and `uduItems` arrays if not yet present.
 */
export function migrateLegacyUdfu() {
  if (store.get('udfItems') === null) {
    const rawUdf = (store.get('udf') ?? '').trim()
    store.set('udfItems', parseLegacyUdf(rawUdf, math, { luxon: DateTime }))
  }

  if (store.get('uduItems') === null) {
    const rawUdu = (store.get('udu') ?? '').trim()
    store.set('uduItems', parseLegacyUdu(rawUdu, math, { luxon: DateTime }))
  }
}

/**
 * Apply user defined functions or units to the main-thread Math.js instance and persist to storage.
 * @param {string} input User defined function or unit definition string.
 * @param {string} type 'func' | 'unit'
 * @param {boolean} [showErr=true] Whether to display an error modal if evaluation fails and lineErrors is enabled.
 */
function applyUdfu(input, type, showErr = true) {
  try {
    const isFunc = type === 'func'
    const keys = applyUdfuToMath(math, input, isFunc, udfuState, {
      luxon: DateTime
    })

    app[isFunc ? 'udfList' : 'uduList'] = keys
    store.set(isFunc ? 'udf' : 'udu', input)
  } catch (error) {
    if (showErr && app.settings?.lineErrors) {
      showError(error.name, error.message)
    }

    throw error
  }
}

/**
 * Updates the Add/Save button icon, label, and Cancel button visibility for a UDF/UDU form.
 * @param {HTMLElement} iconEl Button icon element.
 * @param {HTMLElement} labelEl Button label element.
 * @param {HTMLElement} cancelEl Cancel button element.
 * @param {boolean} isEditing Whether the form is currently in edit mode.
 */
function setFormEditMode(iconEl, labelEl, cancelEl, isEditing) {
  iconEl.innerHTML = isEditing ? dom.icons.Save : dom.icons.Plus
  labelEl.textContent = isEditing ? 'Save' : 'Add'
  cancelEl.style.display = isEditing ? '' : 'none'
}

/**
 * Resets the Functions tab form and edit state.
 */
function resetUdfForm() {
  editingUdfIndex = null
  dom.udfNameInput.value = ''
  dom.udfParamsInput.value = ''
  dom.udfBodyInput.value = ''

  setFormEditMode(dom.udfSaveIcon, dom.udfSaveLabel, dom.udfCancelButton, false)
}

/**
 * Resets the Units tab form and edit state.
 */
function resetUduForm() {
  editingUduIndex = null
  dom.uduNameInput.value = ''
  dom.uduDefInput.value = ''
  dom.uduAliasesInput.value = ''
  dom.uduPrefixesSelect.value = 'none'

  setFormEditMode(dom.uduSaveIcon, dom.uduSaveLabel, dom.uduCancelButton, false)
}

/**
 * Renders the list of user-defined functions/constants.
 */
function renderUdfList() {
  if (!dom.udfList) return

  const items = store.get('udfItems') || []
  dom.udfList.innerHTML = ''

  if (items.length === 0) {
    dom.udfList.innerHTML = '<div class="udfuEmpty">No user-defined functions or constants.</div>'
    return
  }

  items.forEach((item, index) => {
    const row = document.createElement('div')
    row.className = `udfuItem${editingUdfIndex === index ? ' is-editing' : ''}`
    row.dataset.index = String(index)

    const displayParams = item.params === '()' ? '' : item.params
    const signature = item.params
      ? `<strong>${escapeHTML(item.name)}</strong>(${escapeHTML(displayParams)})`
      : `<strong>${escapeHTML(item.name)}</strong>`
    const compactBody = escapeHTML(item.body.replace(/\s+/g, ' ').trim())
    const fullTitle = escapeHTML(`${item.name}${item.params ? `(${displayParams})` : ''} = ${item.body}`)

    row.innerHTML = `
      <div class="udfuItemContent" title="${fullTitle}">
        <span class="udfuItemSignature">${signature} = </span><span class="udfuItemCode">${compactBody}</span>
      </div>
      <div class="udfuItemActions">
        <span class="editUdfuButton" data-action="edit-udf" data-index="${index}" title="Edit">${dom.icons.Pencil}</span>
        <span class="deleteUdfuButton" data-action="delete-udf" data-index="${index}" title="Delete">${dom.icons.Trash2}</span>
      </div>
    `

    dom.udfList.appendChild(row)
  })
}

/**
 * Renders the list of user-defined units.
 */
function renderUduList() {
  if (!dom.uduList) return

  const items = store.get('uduItems') || []
  dom.uduList.innerHTML = ''

  if (items.length === 0) {
    dom.uduList.innerHTML = '<div class="udfuEmpty">No user-defined units.</div>'
    return
  }

  items.forEach((item, index) => {
    const row = document.createElement('div')
    row.className = `udfuItem${editingUduIndex === index ? ' is-editing' : ''}`
    row.dataset.index = String(index)

    const badges = []

    if (item.aliases?.trim()) {
      badges.push(`<span class="udfuBadge">Aliases: ${escapeHTML(item.aliases.trim())}</span>`)
    }

    if (item.prefixes && item.prefixes !== 'none') {
      badges.push(`<span class="udfuBadge">Prefixes: ${escapeHTML(item.prefixes)}</span>`)
    }

    row.innerHTML = `
      <div class="udfuItemContent" title="${escapeHTML(`${item.name} = ${item.definition}`)}">
        <span class="udfuItemSignature"><strong>${escapeHTML(item.name)}</strong> = </span><span class="udfuItemCode">${escapeHTML(item.definition)}</span>
        ${badges.join('')}
      </div>
      <div class="udfuItemActions">
        <span class="editUdfuButton" data-action="edit-udu" data-index="${index}" title="Edit">${dom.icons.Pencil}</span>
        <span class="deleteUdfuButton" data-action="delete-udu" data-index="${index}" title="Delete">${dom.icons.Trash2}</span>
      </div>
    `

    dom.uduList.appendChild(row)
  })
}

/**
 * Refreshes the User Defined Functions & Units dialog lists and resets form state.
 * @param {number} [activeTab=1] 1 for Functions, 2 for Units.
 */
export function prepareUdfuDialog(activeTab = 1) {
  resetUdfForm()
  resetUduForm()
  renderUdfList()
  renderUduList()

  if (activeTab === 1) {
    dom.udfNameInput?.focus()
  } else {
    dom.uduNameInput?.focus()
  }
}

/**
 * Validates, applies, and persists an updated `udfItems` or `uduItems` array.
 * @param {Array} nextItems Updated item array.
 * @param {'func'|'unit'} type Definition type.
 * @returns {boolean} True if applied and saved successfully.
 */
function commitUdfuItems(nextItems, type) {
  const isFunc = type === 'func'
  const compiled = isFunc ? compileUdfItems(nextItems) : compileUduItems(nextItems)
  const prevCompiled = store.get(isFunc ? 'udf' : 'udu') ?? ''

  try {
    applyUdfu(compiled, type, false)
    store.set(isFunc ? 'udfItems' : 'uduItems', nextItems)
    clearEvaluationCache()
    refreshEditor(false)
    calculate()
    return true
  } catch (error) {
    try {
      applyUdfu(prevCompiled, type, false)
    } catch {
      // Ignore fallback error
    }

    notify(error.message || 'Invalid definition.', 'danger')
    return false
  }
}

/**
 * Handles adding or saving a user-defined function/constant.
 */
function handleSaveUdf() {
  const name = dom.udfNameInput.value.trim()
  const params = dom.udfParamsInput.value.trim()
  const body = dom.udfBodyInput.value.trim()

  if (!name || !VALID_IDENTIFIER.test(name) || RESERVED_KEYS.has(name)) {
    notify('Please enter a valid function or constant name (letters, numbers, _, $).', 'danger')
    dom.udfNameInput.focus()
    return
  }

  if (!body) {
    notify('Please enter an expression or function body.', 'danger')
    dom.udfBodyInput.focus()
    return
  }

  const items = [...(store.get('udfItems') || [])]

  if (items.some((item, idx) => item.name === name && idx !== editingUdfIndex)) {
    notify(`"${escapeHTML(name)}" is already defined.`, 'danger')
    dom.udfNameInput.focus()
    return
  }

  const entry = { name, params, body }

  if (editingUdfIndex !== null && editingUdfIndex >= 0 && editingUdfIndex < items.length) {
    items[editingUdfIndex] = entry
  } else {
    items.push(entry)
  }

  if (commitUdfuItems(items, 'func')) {
    resetUdfForm()
    renderUdfList()
    dom.udfNameInput.focus()
  }
}

/**
 * Handles adding or saving a user-defined unit.
 */
function handleSaveUdu() {
  const name = dom.uduNameInput.value.trim()
  const definition = dom.uduDefInput.value.trim().replace(/^["']|["']$/g, '')
  const aliases = dom.uduAliasesInput.value.trim()
  const prefixes = dom.uduPrefixesSelect.value || 'none'

  if (!name || !VALID_IDENTIFIER.test(name) || RESERVED_KEYS.has(name)) {
    notify('Please enter a valid unit name (letters, numbers, _, $).', 'danger')
    dom.uduNameInput.focus()
    return
  }

  if (!definition) {
    notify('Please enter a unit definition (e.g. 18 foot).', 'danger')
    dom.uduDefInput.focus()
    return
  }

  const aliasList = aliases
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)

  for (const alias of aliasList) {
    if (!VALID_IDENTIFIER.test(alias) || RESERVED_KEYS.has(alias)) {
      notify(`Invalid unit alias: "${escapeHTML(alias)}".`, 'danger')
      dom.uduAliasesInput.focus()
      return
    }
  }

  const items = [...(store.get('uduItems') || [])]

  if (items.some((item, idx) => item.name === name && idx !== editingUduIndex)) {
    notify(`"${escapeHTML(name)}" is already defined.`, 'danger')
    dom.uduNameInput.focus()
    return
  }

  const entry = { name, definition, prefixes, aliases: aliasList.join(', ') }

  if (editingUduIndex !== null && editingUduIndex >= 0 && editingUduIndex < items.length) {
    items[editingUduIndex] = entry
  } else {
    items.push(entry)
  }

  if (commitUdfuItems(items, 'unit')) {
    resetUduForm()
    renderUduList()
    dom.uduNameInput.focus()
  }
}

/**
 * Loads a function item into the form for editing.
 * @param {number} index Index in `udfItems`.
 */
function startEditUdf(index) {
  const items = store.get('udfItems') || []
  const item = items[index]

  if (!item) return

  editingUdfIndex = index
  dom.udfNameInput.value = item.name
  dom.udfParamsInput.value = item.params || ''
  dom.udfBodyInput.value = item.body || ''
  setFormEditMode(dom.udfSaveIcon, dom.udfSaveLabel, dom.udfCancelButton, true)

  renderUdfList()
  dom.udfNameInput.focus()
}

/**
 * Loads a unit item into the form for editing.
 * @param {number} index Index in `uduItems`.
 */
function startEditUdu(index) {
  const items = store.get('uduItems') || []
  const item = items[index]

  if (!item) return

  editingUduIndex = index
  dom.uduNameInput.value = item.name
  dom.uduDefInput.value = item.definition || ''
  dom.uduAliasesInput.value = item.aliases || ''
  dom.uduPrefixesSelect.value = item.prefixes || 'none'
  setFormEditMode(dom.uduSaveIcon, dom.uduSaveLabel, dom.uduCancelButton, true)

  renderUduList()
  dom.uduNameInput.focus()
}

/**
 * Binds edit/delete button click and row double-click listeners to a UDF or UDU list container.
 * @param {HTMLElement} listEl List container element.
 * @param {object} config Handler configuration.
 */
function bindUdfuListEvents(listEl, { editAction, deleteAction, onEdit, onDelete }) {
  listEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]')

    if (!btn) return

    const index = Number(btn.dataset.index)

    if (btn.dataset.action === editAction) {
      onEdit(index)
    } else if (btn.dataset.action === deleteAction) {
      onDelete(index)
    }
  })

  listEl.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.udfuItem')
    if (row && !event.target.closest('.udfuItemActions')) {
      onEdit(Number(row.dataset.index))
    }
  })
}

/**
 * Loads user-defined functions and units from storage and binds dialog UI events.
 */
export function setupUserDefined() {
  migrateLegacyUdfu()

  const udfItems = store.get('udfItems') || []
  const uduItems = store.get('uduItems') || []

  try {
    applyUdfu(compileUdfItems(udfItems), 'func')
  } catch (error) {
    console.error('Error loading user-defined functions:', error)
  }

  try {
    applyUdfu(compileUduItems(uduItems), 'unit')
  } catch (error) {
    console.error('Error loading user-defined units:', error)
  }

  dom.udfSaveButton.addEventListener('click', handleSaveUdf)
  dom.udfCancelButton.addEventListener('click', () => {
    resetUdfForm()
    renderUdfList()
  })

  dom.uduSaveButton.addEventListener('click', handleSaveUdu)
  dom.uduCancelButton.addEventListener('click', () => {
    resetUduForm()
    renderUduList()
  })

  for (const input of [dom.udfNameInput, dom.udfParamsInput]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleSaveUdf()
      }
    })
  }

  dom.udfBodyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault()

      const start = dom.udfBodyInput.selectionStart
      const end = dom.udfBodyInput.selectionEnd

      dom.udfBodyInput.setRangeText('  ', start, end, 'end')
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      handleSaveUdf()
    }
  })

  for (const input of [dom.uduNameInput, dom.uduDefInput, dom.uduAliasesInput]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleSaveUdu()
      }
    })
  }

  bindUdfuListEvents(dom.udfList, {
    editAction: 'edit-udf',
    deleteAction: 'delete-udf',
    onEdit: startEditUdf,
    onDelete: (index) => {
      const items = [...(store.get('udfItems') || [])]

      items.splice(index, 1)

      if (commitUdfuItems(items, 'func')) {
        if (editingUdfIndex === index) resetUdfForm()
        else if (editingUdfIndex !== null && editingUdfIndex > index) editingUdfIndex--
        renderUdfList()
      }
    }
  })

  bindUdfuListEvents(dom.uduList, {
    editAction: 'edit-udu',
    deleteAction: 'delete-udu',
    onEdit: startEditUdu,
    onDelete: (index) => {
      const items = [...(store.get('uduItems') || [])]
      items.splice(index, 1)
      if (commitUdfuItems(items, 'unit')) {
        if (editingUduIndex === index) resetUduForm()
        else if (editingUduIndex !== null && editingUduIndex > index) editingUduIndex--
        renderUduList()
      }
    }
  })
}
