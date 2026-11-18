import UIkit from 'uikit'
import { DateTime } from 'luxon'

import { math } from '../core/mathInstance.js'
import { applyUdfuToMath, compileUdfItems, compileUduItems, RESERVED_KEYS, VALID_IDENTIFIER } from '../core/udfu.js'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { refreshEditor } from '../editor/index.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import { notify } from '../ui/dialogs.js'
import { calculate, clearEvaluationCache } from './calcManager.js'

if (!('DateTime' in math)) {
  math.import({ DateTime }, { override: true })
}

const udfuState = {
  previouslyImportedUDFs: [],
  previouslyCreatedUnits: []
}

const editingIndex = {
  func: null,
  unit: null
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
        dom.udfBodyInput.value = ''
      },
      loadInputs: (item) => {
        dom.udfNameInput.value = item.name
        dom.udfParamsInput.value = item.params || ''
        dom.udfBodyInput.value = item.body || ''
      },
      renderContent: (item) => {
        const displayParams = item.params === '()' ? '' : item.params
        const signature = item.params
          ? `<strong>${escapeHTML(item.name)}</strong>(${escapeHTML(displayParams)})`
          : `<strong>${escapeHTML(item.name)}</strong>`
        const compactBody = escapeHTML(item.body.replace(/\s+/g, ' ').trim())
        const fullTitle = escapeHTML(`${item.name}${item.params ? `(${displayParams})` : ''} = ${item.body}`)

        return `
          <div class="udfuItemContent" title="${fullTitle}">
            <span class="udfuItemSignature">${signature} = </span><span class="udfuItemCode">${compactBody}</span>
          </div>
        `
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

      return `
        <div class="udfuItemContent" title="${escapeHTML(`${item.name} = ${item.definition}`)}">
          <span class="udfuItemSignature"><strong>${escapeHTML(item.name)}</strong> = </span><span class="udfuItemCode">${escapeHTML(item.definition)}</span>
          ${badges.join('')}
        </div>
      `
    }
  }
}

/**
 * Apply user defined functions or units to the main-thread Math.js instance and persist to storage.
 * @param {string} input User defined function or unit definition string.
 * @param {'func'|'unit'} type Definition type.
 */
function applyUdfu(input, type) {
  const isFunc = type === 'func'
  const keys = applyUdfuToMath(math, input, isFunc, udfuState, {
    luxon: DateTime
  })

  app[isFunc ? 'udfList' : 'uduList'] = keys
  store.set(isFunc ? 'udf' : 'udu', input)
}

/**
 * Re-applies active user-defined units to the main-thread Math.js instance after currency state refreshes.
 */
export function reapplyMainThreadUdu() {
  const uduSource = store.get('udu')
  if (!uduSource) return

  try {
    app.uduList = applyUdfuToMath(math, uduSource, false, udfuState, { luxon: DateTime })
  } catch {
    // Ignore main-thread re-apply error
  }
}

/**
 * Updates the Add/Save button icon, label, and Cancel button visibility for a UDF/UDU form.
 * @param {object} cfg Tab configuration from `getTabConfig`.
 * @param {boolean} isEditing Whether the form is currently in edit mode.
 */
function setFormEditMode({ saveIcon, saveLabel, cancelBtn }, isEditing) {
  saveIcon.innerHTML = isEditing ? dom.icons.Save : dom.icons.Plus
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

    row.className = `udfuItem${activeEdit === index ? ' is-editing' : ''}`
    row.dataset.udfuIndex = String(index)
    row.innerHTML = `
      ${renderContent(item)}
      <div class="udfuItemActions">
        <span class="editUdfuButton" data-action="udfu-edit" data-udfu-index="${index}" title="Edit">${dom.icons.Pencil}</span>
        <span class="deleteUdfuButton" data-action="udfu-delete" data-udfu-index="${index}" title="Delete">${dom.icons.Trash2}</span>
      </div>
    `
    fragment.appendChild(row)
  })

  listEl.replaceChildren(fragment)
}

/**
 * Refreshes the User Defined Functions & Units dialog lists and resets form state.
 */
function prepareUdfuDialog() {
  resetForm('func')
  resetForm('unit')
  renderList('func')
  renderList('unit')
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
    applyUdfu(compiled, type)
    store.set(isFunc ? 'udfItems' : 'uduItems', nextItems)
    clearEvaluationCache()
    refreshEditor()
    calculate()
    return true
  } catch (error) {
    try {
      applyUdfu(prevCompiled, type)
    } catch {
      // Ignore fallback error
    }

    notify(escapeHTML(error.message || 'Invalid definition.'), 'danger')
    return false
  }
}

/**
 * Validates duplicate names, inserts or replaces an entry, and commits/refreshes the UDF or UDU form.
 * @param {'func'|'unit'} type Definition type.
 * @param {object} entry Entry payload to save.
 */
function saveUdfuEntry(type, entry) {
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

  if (commitUdfuItems(items, type)) {
    resetForm(type)
    renderList(type)
    nameInput.focus()
  }
}

/**
 * Handles adding or saving a user-defined function/constant.
 */
function handleSaveUdf() {
  const name = dom.udfNameInput.value.trim()
  const params = dom.udfParamsInput.value.trim()
  const body = dom.udfBodyInput.value.trim()

  if (!isValidUdfuIdentifier(name)) {
    notify('Please enter a valid function or constant name (letters, numbers, _, $).', 'danger')
    dom.udfNameInput.focus()
    return
  }

  if (!body) {
    notify('Please enter an expression or function body.', 'danger')
    dom.udfBodyInput.focus()
    return
  }

  saveUdfuEntry('func', { name, params, body })
}

/**
 * Handles adding or saving a user-defined unit.
 */
function handleSaveUdu() {
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

  saveUdfuEntry('unit', { name, definition, prefixes, aliases: aliasList.join(', '), ...extraFields })
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
 * Deletes a UDF or UDU entry at `index` and adjusts active edit state.
 * @param {'func'|'unit'} type Definition type.
 * @param {number} index Index to remove.
 */
function deleteUdfuAt(type, index) {
  const { storeKey } = getTabConfig(type)
  const items = [...(store.get(storeKey) || [])]

  items.splice(index, 1)

  if (commitUdfuItems(items, type)) {
    const currentEdit = editingIndex[type]

    if (currentEdit === index) {
      resetForm(type)
    } else if (currentEdit !== null && currentEdit > index) {
      editingIndex[type] = currentEdit - 1
    }

    renderList(type)
  }
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
  const storedUdfItems = store.get('udfItems')
  const storedUduItems = store.get('uduItems')
  const udfSource = Array.isArray(storedUdfItems) ? compileUdfItems(storedUdfItems) : (store.get('udf') ?? '')
  const uduSource = Array.isArray(storedUduItems) ? compileUduItems(storedUduItems) : (store.get('udu') ?? '')

  try {
    applyUdfu(udfSource, 'func')
  } catch (error) {
    console.error('Error loading user-defined functions:', error)
  }

  try {
    applyUdfu(uduSource, 'unit')
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

  bindUdfuListEvents(dom.udfList, 'func')
  bindUdfuListEvents(dom.uduList, 'unit')

  let udTab = 1

  UIkit.util.on('#dialogUdfu', 'beforeshow', prepareUdfuDialog, { self: true })

  UIkit.util.on(
    '#dialogUdfu',
    'shown',
    () => {
      ;(udTab === 1 ? dom.udfNameInput : dom.uduNameInput)?.focus()
    },
    { self: true }
  )

  UIkit.util.on(
    '#udfTab, #uduTab',
    'shown',
    (event) => {
      udTab = event.target.id === 'udfTab' ? 1 : 2
      ;(udTab === 1 ? dom.udfNameInput : dom.uduNameInput)?.focus()
    },
    { self: true }
  )
}
