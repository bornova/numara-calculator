import { app, store } from './common.js'
import { calculate } from './math.js'
import { showError } from './modal.js'

import UIkit from 'uikit'

/**
 * User defined functions and units.
 *
 * @param {*} input User defined function or unit to apply.
 * @param {string} type 'func' | 'unit'
 */
export function applyUdfu(input, type) {
  try {
    const loadUD =
      type === 'func'
        ? new Function(`'use strict'; numara.math.import({${input}}, {override: true})`)
        : new Function(`'use strict'; numara.math.createUnit({${input}}, {override: true})`)

    const UDFunc = new Function(`'use strict'; return {${input}}`)
    const UDObj = UDFunc()

    loadUD()

    store.set(type === 'func' ? 'udf' : 'udu', input)

    for (const f in UDObj) {
      app[type === 'func' ? 'udfList' : 'uduList'].push(f)
    }

    calculate()

    UIkit.modal('#dialog-udfu').hide()
  } catch (e) {
    showError(e.name, e.message)
  }
}
