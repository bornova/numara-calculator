import fs from 'fs-extra'
import { create, all } from 'mathjs'

export const math = create(all)

const categorize = (obj) =>
  obj.reduce((catList, key) => {
    catList[key.category] = catList[key.category] || []
    catList[key.category].push(key)

    return catList
  }, {})

/** Generate function references page */
export function generateFunctonsWiki() {
  const functions = Object.entries(math.expression.mathWithTransform).reduce((help, [f]) => {
    try {
      help.push(math.help(f).toJSON())
    } catch {
      /** No help */
    }

    return help
  }, [])

  const functionsByCat = Object.entries(categorize(functions)).sort()

  const exclusions = ['Core', 'Expression']

  const definedCats = functionsByCat.filter(([cat]) => cat !== 'undefined' && !exclusions.includes(cat))
  const specialCats = functionsByCat.filter(([cat]) => cat === 'undefined')

  let functionsWiki = ``

  for (const [cat, items] of definedCats) {
    functionsWiki += '### ' + cat

    items.forEach((i) => {
      functionsWiki += `
        #### ${i.name}
        ${i.description}
        
        Syntax: ${i.syntax.map((s) => '`' + s + '`').join(' ')}

        \t${i.examples.join('\n\t')}

        ${
          i.seealso && i.seealso.length
            ? 'Also see: ' + i.seealso.map((sa) => '[' + sa + '](#' + sa.toLowerCase() + ')').join(', ')
            : ''
        }
      `
    })
  }

  for (const [, items] of specialCats) {
    functionsWiki += '\n### Special constants'

    items.forEach((i) => {
      functionsWiki += `
        #### ${i.description}

        \t${i.examples.join('\n    ')}
      `
    })
  }

  fs.outputFileSync('wiki/functions.md', functionsWiki.replace(/^ +/gm, ''))
}

/** Generate unit references page */
export function generateUnitsWiki() {
  const units = Object.entries(math.Unit.UNITS).reduce((units, [u, value]) => {
    units.push({
      category: value.base.key,
      pre: value.prefixes,
      unit: u
    })

    return units
  }, [])

  const unitsByCategory = Object.entries(categorize(units)).sort()

  let unitsWiki = ``

  for (const [unitCat, units] of unitsByCategory) {
    unitsWiki += `
      ### ${unitCat
        .split('_')
        .map((w) => w.toLowerCase())
        .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
        .join(' ')}
        |Unit|Prefixes|
        |----|----|
      `

    units.forEach((i) => {
      unitsWiki += `|${i.unit}|${Object.entries(i.pre)
        .map((p) => p[0])
        .filter((len) => len)
        .join(', ')}|
        `
    })
  }

  fs.outputFileSync('wiki/units.md', unitsWiki.replace(/^ +/gm, ''))
}

generateFunctonsWiki()
generateUnitsWiki()
