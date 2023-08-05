import { app, store } from './common.js'
import { calculate } from './math.js'
import { showError } from './modal.js'

import UIkit from 'uikit'

/** User defined functions */
export function applyUdf(udf) {
  try {
    const loadUdf = new Function(`'use strict'; numara.math.import({${udf}}, {override: true})`)
    const udfFunc = new Function(`'use strict'; return {${udf}}`)
    const udfObj = udfFunc()

    loadUdf()

    store.set('udf', udf)

    for (const f in udfObj) {
      app.udfList.push(f)
    }

    calculate()

    UIkit.modal('#dialog-udfu').hide()
  } catch (e) {
    showError(e.name, e.message)
  }
}

/** User defined units */
export function applyUdu(udu) {
  try {
    const loadUdu = new Function(`'use strict'; numara.math.createUnit({${udu}}, {override: true})`)
    const uduFunc = new Function(`'use strict'; return {${udu}}`)
    const uduObj = uduFunc()

    loadUdu()

    store.set('udu', udu)

    for (const f in uduObj) {
      app.uduList.push(f)
    }

    calculate()

    UIkit.modal('#dialog-udfu').hide()
  } catch (e) {
    showError(e.name, e.message)
  }
}
