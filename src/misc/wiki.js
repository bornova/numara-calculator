import fs from 'fs-extra'
import { create, all } from 'mathjs'

export const math = create(all)

const WIKI_BASE_URL = 'https://github.com/bornova/numara-calculator/wiki'

const categorize = (obj) =>
  obj.reduce((catList, key) => {
    catList[key.category] = catList[key.category] || []
    catList[key.category].push(key)

    return catList
  }, {})

/** Generate Home wiki page */
export function generateHomeWiki() {
  const homeWiki = `Welcome to the **Numara Calculator** wiki!

Numara is a sleek, minimal-but-powerful notepad calculator that evaluates expressions as you type, combining the flexibility of a text editor with the power of a scientific calculator.

### Documentation

* [Features](${WIKI_BASE_URL}/Features) — Shortcut keywords, percentages, date math, plotting, currencies, labels, code folding, cross-page variables, user-defined functions/units, and library integrations
* [Settings](${WIKI_BASE_URL}/Settings) — Complete guide to General, Editor, Calculator, Locale, and Sync settings
* [Keyboard shortcuts](${WIKI_BASE_URL}/Keyboard-shortcuts) — Keyboard shortcuts and quick mouse/UI interactions
* [Function references](${WIKI_BASE_URL}/Function-references) — Built-in Math.js functions and special constants
* [Unit references](${WIKI_BASE_URL}/Unit-references) — Built-in Math.js units and prefixes
* [Known issues](${WIKI_BASE_URL}/Known-issues) — Known platform and third-party issues
`

  fs.outputFileSync('wiki/Home.md', homeWiki)
}

/** Generate Features wiki page */
export function generateFeaturesWiki() {
  const featuresWiki = `In addition to all [constants](https://mathjs.org/docs/reference/constants.html), [functions](https://mathjs.org/docs/reference/functions.html), and [units](https://mathjs.org/docs/datatypes/units.html) provided by Math.js, the following functionalities are provided:

### Shortcut keywords

\`ans\` or \`_\` Returns the answer from the previous calculated line.

\`total\` Totals all numeric values up to this keyword.

\`subtotal\` Totals numeric values within a calculation block after a blank line.

\`avg\` Averages all numeric values up to this keyword.

\`subavg\` Averages numeric values within a calculation block after a blank line.

\`lineX\` Returns the answer from a specific line, where \`X\` is the line number. Ex. \`line4\` returns the answer from line 4. Clicking a line number in the gutter (above the active line) inserts \`lineX\` at the cursor.

\`today\` Returns today's date.

\`now\` Returns today's date and time.

### Percentage calculations

Numara supports natural percentage expressions in addition to standard arithmetic:

    10% of 100                    | 10
    100 + 20%                     | 120
    100 - 20%                     | 80
    15% of (50 + 50)              | 15

### Simple date calculations

Numara allows you to do simple date additions and subtractions such as \`today + 3 weeks\` and \`now + 36 hours\`. You can also add or subtract durations from a specific date such as \`7/31/2023 + 4 days\`, where the date matches your configured **Date format** setting (\`System\`, \`MM/DD/YYYY\`, \`DD/MM/YYYY\`, or \`YYYY-MM-DD\`). Supported duration units include \`millisecond\`, \`second\`, \`minute\`, \`hour\`, \`day\`, \`week\`, \`month\`, \`quarter\`, \`year\`, \`decade\`, \`century\` (\`centuries\`), and \`millennium\` (\`millennia\`). If a date is entered without a duration operator, the expression is evaluated as division (e.g. \`7 / 31 / 2023\`).

### Function plotting

When an expression is entered as a single-variable function such as \`f(x) = 2x^2 + 3x - 5\`, Numara outputs a plot button on the output panel. Clicking the button displays an interactive plot in a dialog where you can:

- Pan and zoom the viewport, or click **Reset View** to restore the initial view.
- Toggle **Cross** (crosshair lines), **Derivative** (first derivative curve and slope tooltip), and **Grid**.
- Open **Axis Settings** to configure **X-Axis Precision** (\`0 - 16\`), toggle **Auto Range**, or set custom \`x\` and \`y\` axis domain bounds.
- Click **Export SVG** to download the plot as an \`.svg\` file.

Plot functions can also reference numeric variables defined earlier on the page (e.g. \`a = 2\` followed by \`f(x) = a * x^2\`).

### Currency calculations

When enabled, Numara fetches exchange rates from [frankfurter.dev](https://frankfurter.dev) and registers currencies as units. You can use three-letter ISO currency codes (case-insensitive) or currency symbols (\`$\`, \`€\`, \`£\`, \`¥\`, \`₽\`, \`₺\`, etc.) in calculations such as \`1 usd to eur\`, \`$10 to EUR\`, \`10 € to USD\`, and \`25 hours * $50/hr\`.

### Commenting

Any text starting with \`//\` or \`#\` will be treated as a comment. You can comment an entire line:

    // This is a comment line
    # So is this

Or add comments to the end of an expression:

    1 + 2 // Add 1 and 2          | 3
    1 + 2 # Add 1 and 2           | 3

### Line labels

You can prefix any line with a descriptive label followed by a colon \`:\`. Numara ignores the label and evaluates the expression after the colon:

    Rent: 1200                    | 1200
    Food: 300                     | 300
    total                         | 1500

### Collapsible sections

Lines starting with Markdown-style headings (\`# Heading\`, \`## Subheading\`, up to \`######\`, or \`// # Heading\`) define collapsible sections in the editor. Clicking the fold arrow in the gutter (or pressing \`Ctrl+Q\`) collapses or expands all lines under the heading until the next heading of equal or higher level, or until an explicit end-of-section marker (\`#\`, \`#!\`, or \`// #!\`).

### Pages and cross-page references

Numara supports multiple calculation pages accessible from the sidebar:

- Create, rename (or double-click the page title in the bottom bar), duplicate, and delete pages.
- Sort pages by date (\`Older to newer\`, \`Newer to older\`), alphabetically (\`A to Z\`, \`Z to A\`), or reorder them via drag-and-drop.
- Copy or print page calculations, and import/export \`.num\` files in the desktop app.

You can import variables from another page using the \`page()\` function:

    r = page("Rates")             | Rates
    6 * r.hourly * (1 + r.gst)    | 535.5

Clicking the page name in the output panel opens that page directly, and hovering over it displays the count and names of its exported variables.

### User defined functions and units

#### Functions

Custom functions, constants, and objects can be defined to be used in the calculator. Each entry must be typed as an object property (\`name: function | value | object\`) and separated by a comma \`,\`:

    xyz: (x, y, z) => {
      return x + y + z
    },
    myConstant: 123,
    rates: {
      base: 300,
      bonus: 1.25
    }

The above examples can then be used in Numara where \`xyz(1, 2, 3)\` outputs \`6\`, \`myConstant\` outputs \`123\`, and \`rates.base * rates.bonus\` outputs \`375\`. User-defined functions also have access to \`math\`, \`luxon\`, \`nerdamer\`, and \`formulajs\` in their scope.

#### Units

Custom units can be defined to be used in the calculator. Each custom unit must be typed as an object property (\`name: unit | unit object\`) and separated by a comma \`,\`:

    xunit: '12 foot',

The above example can then be used in Numara where \`5 xunit to ft\` outputs \`60 ft\`.

More information on creating units can be found here: [Math.js User-Defined Units](https://mathjs.org/docs/datatypes/units.html#userdefined-units)

### Find and replace

Press \`Cmd/Ctrl+F\` to open the search panel, or \`Cmd+Alt+F\` (macOS) / \`Ctrl+H\` (Windows/Linux) to open Find and Replace. The search panel supports both plain text and regular expression queries (e.g. \`/\\d+/i\`).

## 3rd Party Library Integration

### Formula.js
- Numara can process Excel functions based on the [formulajs](https://github.com/formulajs/formulajs) library. For more information about available functions, please visit [https://formulajs.info](https://formulajs.info)

  Example:
  \`\`\`javascript
  formulajs.ABS(-2)    // 2
  \`\`\`

### Nerdamer
- Numara can process [Nerdamer](https://nerdamer.com/) functions for symbolic math expression evaluation support. For more information about Nerdamer, please visit [https://nerdamer.com/](https://nerdamer.com/)

  Example:
  \`\`\`javascript
  nerdamer.solve("x^3-10x^2+31x-30", "x")    // [3,5,2]
  \`\`\`

### Luxon
- Numara integrates [Luxon](https://moment.github.io/luxon/) via the \`DateTime\` object for advanced date and time parsing, formatting, and manipulation.

  Example:
  \`\`\`javascript
  DateTime.fromISO("2026-05-01").plus({ days: 5 }).toFormat("yyyy-MM-dd")    // 2026-05-06
  \`\`\`
`

  fs.outputFileSync('wiki/Features.md', featuresWiki)
}

/** Generate Settings wiki page */
export function generateSettingsWiki() {
  const settingsWiki = `### General

\`Theme\` System (Default) | Light | Dark
- Set the visual theme of the application.
- Click the **Customize theme** palette button to customize syntax highlighting and UI colors for both Light and Dark themes (Answers, Comments, Constants, Currencies, Errors, Excel, Functions, Keywords, Numbers, Text, Operators, Units, Variables, and Plain).

\`Page list sidebar position\` Auto (Default) | Slide out | Docked
- Set the position of the page list sidebar. When set to \`Auto\`, the sidebar automatically docks when the window is wide enough and slides out on narrower windows. When docked, drag the sidebar border to resize it (double-click to reset).

\`Start with blank page\` On | Off (Default)
- Start the app with a blank page instead of the last used page.

\`Always on top\` On | Off (Default) *(Desktop only)*
- Keep Numara on top of all other windows on the screen.

\`Keep in menu bar\` / \`Keep in system tray\` On | Off (Default) *(Desktop only)*
- Keep Numara running in the macOS menu bar or Windows/Linux system tray when the window is closed.

\`Start at login\` On | Off (Default) *(Desktop only)*
- Start Numara automatically when logging into the computer.

\`Close app on Esc key\` On | Off (Default) *(Desktop only)*
- Close or hide the Numara window when pressing the \`Esc\` key.

#### Typography

\`Font size\` Tiny | Small | Normal (Default) | Large | X-Large
- Set the font size of the calculation text.

\`Font weight\` Light | Thin | Normal (Default) | Semi Bold | Bold
- Set the font weight of the calculation text.

\`Line height\` Tiny | Small | Normal (Default) | Large | X-Large
- Set the height of each calculation line.

#### Notifications

\`Position\` Top Left | Top Center | Top Right | Bottom Left | Bottom Center (Default) | Bottom Right
- Set the position on the screen where notifications appear.

\`Duration\` 1 second | 3 seconds | 5 seconds (Default) | 10 seconds | 30 seconds | Close manually
- Set how long notifications are displayed on the screen or set to close them manually.

### Editor

\`Syntax highlighting\` On (Default) | Off
- Enable syntax highlighting for typed expressions.

\`Keyword tooltips\` On (Default) | Off
- Display tooltips when hovering over keywords such as function names, units, constants, currencies, variables, and line references (requires \`Syntax highlighting\` to be On).

\`Highlight matching brackets\` On (Default) | Off
- When the cursor is next to a bracket, highlight the matching bracket (requires \`Syntax highlighting\` to be On).

\`Autocomplete hints\` On (Default) | Off
- Show autocompletion hints as a list while typing an expression.

\`Close matching brackets\` On (Default) | Off
- Automatically insert closing brackets and quotes when typed.

\`Line numbers\` On (Default) | Off
- Show line numbers for each line on the input panel.

\`Wrap input expressions\` On (Default) | Off
- Allow overflowing input expressions to wrap to the next line on the input panel.

\`Truncate answers\` On (Default) | Off
- Truncate long answers on the output panel with ellipses instead of showing a horizontal scrollbar. Hovering over a truncated answer displays the full value in a tooltip.

\`Show rulers\` On | Off (Default)
- Show horizontal rulers to visually separate each line.

### Calculator

\`Answer position\` Left (with divider) (Default) | Right (no divider) | Below Expression
- Set where the answer is shown in the app. When set to \`Left (with divider)\`, drag the divider to resize the panels (double-click to reset).

\`Numeric output\` Number (Default) | BigNumber | Fraction
- The type of numeric output for functions which cannot determine the numeric type from the inputs. For most functions, the type of output is determined from the input: a number as input will return a number as output, a BigNumber as input returns a BigNumber as output.

  For example, \`'2+3'\`, \`parse('2+3')\`, \`range('1:10')\`, and \`unit('5cm')\` use the numeric output setting, whereas \`sqrt(4)\` will always return the number \`2\` regardless of the setting because the input is a number.

  BigNumbers have higher precision than the default numbers of JavaScript, and Fractions store values in terms of a numerator and denominator.

\`Notation\` Auto (Default) | Engineering | Exponential | Fixed | Binary | Hexadecimal | Octal
- Numeric notation format for answers:

  'Auto' (Default) - Regular number notation for numbers having an absolute value between the lower and upper bounds, and exponential notation elsewhere. Lower bound is included, upper bound is excluded. For example \`123.4\` and \`1.4e7\`.

  'Engineering' - Always use engineering notation: exponential notation with the exponent selected to be a multiple of 3. For example \`123.4e+0\` and \`14.0e+6\`.

  'Exponential' - Always use exponential notation. For example \`1.234e+2\` and \`1.4e+7\`.

  'Fixed' - Always use regular number notation regardless of the exponent limits.

  'Binary', 'Hexadecimal', or 'Octal' - Format the number using binary, hexadecimal, or octal notation. For example \`0b1101\`, \`0x10fe\`, and \`0o23\`.

\`Matrix type\` Matrix (Default) | Array
- The default type of matrix output for functions. Where possible, the type of matrix output from functions is determined from the function input: an Array as input returns an Array, a Matrix as input returns a Matrix. In case of no matrix as input, the type of output is determined by this option. In case of mixed matrix inputs, a Matrix is always returned.

\`Precision\` (0 - 16) Default 4
- Number of decimal places to display for the answer.

\`Upper exponent limit\` (0 - 32) Default 12
- Number determining the upper boundary for formatting a value with an exponent when \`Notation\` is set to \`Auto\`.

\`Lower exponent limit\` (-32 - 0) Default -12
- Number determining the lower boundary for formatting a value with an exponent when \`Notation\` is set to \`Auto\`.

\`Calculation timeout (seconds)\` (1 - 60) Default 10
- Set the timeout in seconds for long-running calculations before prompting to continue waiting or ignore the line.

\`Continue from previous line\` On (Default) | Off
- Choose whether a calculation on a new line starting with \`+\`, \`-\`, \`*\`, or \`/\` should continue from the previous line's answer.

\`Predictable output\` On | Off (Default)
- When On, output type depends only on the input types. When Off (Default), output type can vary depending on input values. For example \`sqrt(-4)\` returns \`complex('2i')\` when predictable is Off, and returns \`NaN\` when On. Predictable output can be needed when programmatically handling the result of a calculation, but can be inconvenient for users when evaluating dynamic equations.

\`Line errors\` On | Off (Default)
- Show \`Error\` in the output panel if a calculation error occurs. Clicking the \`Error\` link displays details about the error. This also highlights the line number red where the error is present.

### Locale

#### Format

\`Thousands separator\` System (Default) | Comma (1,234.56) | Period (1.234,56) | Disabled
- Set the thousands and decimal separator formatting. Choosing \`System\` uses the operating system's locale.

  - \`Enable for input\` On | Off (Default)
    Enable locale-specific thousands and decimal separators for input values. When enabled, use a semicolon (\`;\`) as the argument separator in functions (e.g. \`sum(1; 3)\`).

  - \`Copy with answer\` On | Off (Default)
    Choose whether to include the thousands separator with the copied answer.

\`Date format\` System (Default) | MM/DD/YYYY | DD/MM/YYYY | YYYY-MM-DD
- Set the date format for date and time calculations and keywords (\`today\`, \`now\`).

\`Show day with date\` On | Off (Default)
- If On, the day of the week is prepended to the date output when performing date calculations and using keywords such as \`today\` and \`now\`.

#### Currency Conversion

\`Enabled\` On (Default) | Off
- Enable currency conversions. Exchange rates are provided by [frankfurter.dev](https://frankfurter.dev).

\`Rate update interval\` On start (Default) | 1 hour | 3 hours | 6 hours | 12 hours | Manual
- Set how often the currency exchange rates are updated, or click the refresh button next to the selector to update rates immediately.

### Sync *(Desktop only)*

\`Enable sync\` On | Off (Default)
- Enable two-way synchronization between calculation pages and \`.num\` files in a local folder.

\`Sync folder\`
- Choose the local folder to synchronize \`.num\` page files with.

### Reset Actions

- **Reset all data**: Clear all user settings, saved pages, and local storage data.
- **Restore defaults**: Revert all settings back to their default values (with an option to keep folder sync enabled).
- **Reset window size** *(Desktop only)*: Restore the application window to its default dimensions when resized.
`

  fs.outputFileSync('wiki/Settings.md', settingsWiki)
}

/** Generate Keyboard shortcuts wiki page */
export function generateShortcutsWiki() {
  const shortcutsWiki = `### Application Shortcuts

| Shortcut (macOS) | Shortcut (Windows / Linux) | Action |
| --- | --- | --- |
| \`Cmd+N\` | \`Ctrl+N\` | Create a new page |
| \`Cmd+D\` | \`Ctrl+D\` | Clear the current page |
| \`Cmd+P\` | \`Ctrl+P\` | Print the current page |
| \`Shift+Tab\` | \`Shift+Tab\` | Open or close the page list sidebar |
| \`Esc\` | \`Esc\` | Close open modal, search panel, or app window (when **Close app on Esc key** is enabled) |

### Editor & Search Shortcuts

| Shortcut (macOS) | Shortcut (Windows / Linux) | Action |
| --- | --- | --- |
| \`Cmd+/\` | \`Ctrl+/\` | Toggle line comments (\`//\`) on selected lines |
| \`Ctrl+Space\` | \`Ctrl+Space\` | Open autocomplete suggestions |
| \`Ctrl+Q\` | \`Ctrl+Q\` | Fold or unfold collapsible section at cursor |
| \`Cmd+F\` | \`Ctrl+F\` | Open the Find panel |
| \`Cmd+Opt+F\` | \`Ctrl+H\` | Open the Find and Replace panel |
| \`Enter\` / \`Shift+Enter\` | \`Enter\` / \`Shift+Enter\` | Navigate to next / previous search match |

### Mouse & UI Interactions

| Interaction | Action |
| --- | --- |
| **Click an answer** | Copy the answer to the clipboard |
| **Click a page link answer** | Open the referenced page |
| **Click a line number** (above active line) | Insert \`lineX\` into the active expression |
| **Click a red line number / Error** | View error details for that line |
| **Double-click page title** (bottom bar) | Rename the active page |
| **Drag / double-click panel divider** | Resize input and output panels / reset to default width |
| **Drag / double-click docked sidebar edge** | Resize docked sidebar / reset to default width |
| **Drag and drop page in sidebar** | Reorder pages in the page list |
| **Right-click input / output panel** *(Desktop)* | Copy line, answer, line with answer, or all lines/answers |
`

  fs.outputFileSync('wiki/Keyboard-shortcuts.md', shortcutsWiki)
}

/** Generate Known issues wiki page */
export function generateKnownIssuesWiki() {
  const knownIssuesWiki = `#### Known issues as of 2026-05-14
- Microsoft SwiftKey backspace button does not move cursor to previous line when cursor reaches the beginning of a line ([#183](https://github.com/bornova/numara-calculator/issues/183))
`

  fs.outputFileSync('wiki/Known-issues.md', knownIssuesWiki)
}

/** Generate function references page */
export function generateFunctionsWiki() {
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

        \t${i.examples.join('\n\t')}
      `
    })
  }

  fs.outputFileSync('wiki/Function-references.md', functionsWiki.replace(/^ +/gm, ''))
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

  fs.outputFileSync('wiki/Unit-references.md', unitsWiki.replace(/^ +/gm, ''))
}

generateHomeWiki()
generateFeaturesWiki()
generateSettingsWiki()
generateShortcutsWiki()
generateKnownIssuesWiki()
generateFunctionsWiki()
generateUnitsWiki()
