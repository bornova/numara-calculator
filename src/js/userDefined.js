import { app, store } from './common'
import { calculate } from './math'
import { showError } from './modal'

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
        ? new Function(`'use strict'; math.import({${input}}, {override: true})`)
        : new Function(`'use strict'; math.createUnit({${input}}, {override: true})`)

    loadUD()

    const UDFunc = new Function(`'use strict'; return {${input}}`)

    for (const f in UDFunc()) {
      app[type === 'func' ? 'udfList' : 'uduList'].push(f)
    }

    store.set(type === 'func' ? 'udf' : 'udu', input)

    calculate()

    UIkit.modal('#dialog-udfu').hide()
  } catch (e) {
    showError(e.name, e.message)
  }
}
