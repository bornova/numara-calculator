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

* [Features](${WIKI_BASE_URL}/Features) — Variables, shortcut keywords, percentages, number base conversions, date math, plotting, currencies, labels, code folding, selection stats, cross-page variables, user-defined functions/units, library integrations, and offline/update support
* [Settings](${WIKI_BASE_URL}/Settings) — Complete guide to General, Editor, Calculator, Format, and Sync settings
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

### Variables and data structures

You can assign numbers, units, currencies, strings, dates, objects, arrays, and matrices to variables and reference them on subsequent lines. Variable names also support Unicode letters (including accented and non-Latin characters such as \`ücret\` or \`π_val\`):

    price = $25                   | $25.00
    qty = 4                       | 4
    price * qty                   | $100.00
    item = { w: 10 cm, h: 5 cm }  | {"w": 10 cm, "h": 5 cm}
    item.w * item.h               | 50 cm^2
    π_val = 10                    | 10

### Shortcut keywords

\`ans\` or \`_\` Returns the answer from the previous calculated line.

\`total\` Totals all numeric (or compatible unit) values up to this keyword.

\`subtotal\` Totals numeric (or compatible unit) values within a calculation block after a blank line.

\`avg\` Averages all numeric (or compatible unit) values up to this keyword.

\`subavg\` Averages numeric (or compatible unit) values within a calculation block after a blank line.

\`lineX\` Returns the answer from a specific line, where \`X\` is the line number. Ex. \`line4\` returns the answer from line 4. Clicking a line number in the gutter (above the active line) inserts \`lineX\` at the cursor.

\`today\` Returns today's date.

\`now\` Returns today's date and time.

> \`total\`, \`subtotal\`, \`avg\`, and \`subavg\` can also be used inside larger expressions (e.g. \`total * 1.15\` or \`subtotal + 10%\`).

### Percentage calculations

Numara supports natural percentage expressions, percentage offsets on numbers/variables/units, and percentage ratio queries:

    10% of 100                    | 10
    100 + 20%                     | 120
    100 - 20%                     | 80
    15% of (50 + 50)              | 15
    20 as % of 80                 | 25%
    30 is what % of 120           | 25%
    0.25 in %                     | 25%

### Number base conversions

You can enter binary (\`0b\`), octal (\`0o\`), and hexadecimal (\`0x\`) literals and convert expressions to another base using \`in\` or \`to\` followed by \`bin\`, \`oct\`, or \`hex\`:

    255 in hex                    | 0xff
    10 in bin                     | 0b1010
    64 to oct                     | 0o100
    0xff + 0b1010                 | 265

### Simple date calculations

Numara allows you to do simple date additions and subtractions such as \`today + 3 weeks\`, \`now + 36 hours\`, or chained durations like \`today + 1 year + 2 months - 3 days\`. You can also add or subtract durations from a specific date (or date variable) such as \`7/31/2023 + 4 days\`, or subtract two dates to find the duration between them (e.g. \`01/20/2026 - 01/15/2026\` outputs \`5 days\`, and \`01/20/2026 - 01/15/2026 in hours\` outputs \`120 hours\`), where the date matches your configured **Date format** setting (\`MM/DD/YYYY\`, \`DD/MM/YYYY\`, or \`YYYY-MM-DD\`). Supported duration units include \`millisecond\`, \`second\`, \`minute\`, \`hour\`, \`day\`, \`week\`, \`month\`, \`quarter\`, \`year\`, \`decade\`, \`century\` (\`centuries\`), and \`millennium\` (\`millennia\`). If a date is entered without a duration operator or second date, the expression is evaluated as division (e.g. \`7 / 31 / 2023\`).

### Function plotting

When an expression is entered as a single-variable function such as \`f(x) = 2x^2 + 3x - 5\`, Numara outputs a plot button on the output panel. Clicking the button displays an interactive plot in a dialog where you can:

- Toggle function chips in the header to overlay and compare multiple functions from the current page on the same graph.
- Pan and zoom the viewport, or click **Reset View** to restore the initial view.
- Toggle **Cross** (crosshair lines), **Derivative** (first derivative curve and slope tooltip), and **Grid**.
- Open **Axis Settings** to configure **X-Axis Precision** (\`0 - 16\`), toggle **Auto Range** (which automatically scales around roots, vertices, and intersections), or set custom \`x\` and \`y\` axis domain bounds.
- Click **Export SVG** to download the plot as an \`.svg\` file.

Plot functions can also reference numeric variables defined earlier on the page (e.g. \`a = 2\` followed by \`f(x) = a * x^2\`).

### Currency calculations

When enabled, Numara fetches exchange rates from [frankfurter.dev](https://frankfurter.dev) and registers currencies as units. You can use three-letter ISO currency codes (case-insensitive) or currency symbols (\`$\`, \`€\`, \`£\`, \`¥\`, \`₹\`, \`₩\`, \`₽\`, \`₺\`, \`R$\`, \`₪\`, \`₱\`, \`฿\`, \`₫\`, \`₴\`, \`₦\`, \`zł\`, \`Kč\`, \`₿\`, etc.) in calculations such as \`1 usd to eur\`, \`$10 to EUR\`, \`10 € to USD\`, \`R$50 to USD\`, and \`25 hours * $50/hr\`.

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

### Selection statistics

Selecting multiple lines in the editor automatically displays live summary statistics (**Sum**, **Avg**, and **Count**) in the bottom status bar for numeric answers in the selection. Clicking the statistics summary copies the sum to the clipboard.

### Pages and cross-page references

Numara supports multiple calculation pages accessible from the page list or as horizontal tabs in the bottom bar (when **Page list position** is set to \`Tabs\`):

- Create new pages using the **New page** button, rename pages inline (via the rename button, by double-clicking a page in the page list, by double-clicking the page title in the bottom bar, or by double-clicking/right-clicking a page tab), and duplicate or delete pages.
- Sort pages by date (\`Older to newer\`, \`Newer to older\`) or alphabetically (\`A to Z\`, \`Z to A\`) in the page list, or reorder them via drag-and-drop in both the page list and page tabs.
- Each page preserves its own undo/redo history, cursor position, and folded sections when switching pages.
- Copy or print page calculations, and import/export \`.num\` files in the desktop app.

You can import variables from another page using the \`page()\` function (with autocomplete support for both page names and exported page variables):

    r = page("Rates")             | Rates
    6 * r.hourly * (1 + r.gst)    | 535.5
    page("Rates").hourly * 2      | 170

Clicking the page name in the output panel opens that page directly, and hovering over it displays the count and names of its exported variables.

### User defined functions and units

#### Functions

Custom functions, constants, and objects can be added and managed in the **User Defined Functions & Units** dialog under the **Functions** tab:

- **Name**: Identifier for the function, constant, or object (e.g. \`xyz\`, \`myConstant\`, or \`rates\`).
- **Parameters** *(optional)*: Comma-separated parameter names for functions (e.g. \`x, y, z\`). Leave blank for constants or objects (or enter \`()\` for zero-argument functions).
- **Expression or multi-line JS body**: A single expression (e.g. \`x + y + z\`, \`123\`, or \`{ base: 300, bonus: 1.25 }\`) or a multi-line JavaScript function body (e.g. \`return x + y + z\`).

For example, with \`xyz(x, y, z) = x + y + z\`, \`myConstant = 123\`, and \`rates = { base: 300, bonus: 1.25 }\`, \`xyz(1, 2, 3)\` outputs \`6\`, \`myConstant\` outputs \`123\`, and \`rates.base * rates.bonus\` outputs \`375\`. User-defined functions also have access to \`math\`, \`luxon\` (\`DateTime\`), \`nerdamer\`, and \`formulajs\` in their scope. Saved items can be edited (by clicking the edit icon or double-clicking the item) or deleted directly from the list.

#### Units

Custom units can be added and managed under the **Units** tab:

- **Unit name**: Identifier for the unit (e.g. \`xunit\`).
- **Definition**: Base unit definition (e.g. \`12 foot\`).
- **Aliases** *(optional)*: Comma-separated alternative names for the unit (e.g. \`xunits, xu\`).
- **Prefixes**: Unit prefix support (\`None\`, \`Short (k, M, G...)\`, \`Long (kilo, mega...)\`, \`Binary short (Ki, Mi...)\`, or \`Binary long (kibi, mebi...)\`).

For example, defining \`xunit\` as \`12 foot\` allows you to write \`5 xunit to ft\`, which outputs \`60 ft\`.

More information on creating units can be found here: [Math.js User-Defined Units](https://mathjs.org/docs/datatypes/units.html#userdefined-units)

### Find and replace

Click **Search** in the menu or press \`Cmd/Ctrl+F\` to open the search panel, or \`Cmd+Alt+F\` (macOS) / \`Ctrl+H\` (Windows/Linux) to open Find and Replace. The search panel supports both plain text and regular expression queries (e.g. \`/\\d+/i\`).

### Offline web app (PWA) and desktop updates

- **Progressive Web App (PWA)**: The web app at [numara.io](https://numara.io) can be installed to your desktop or home screen and works offline via a service worker.
- **Automatic desktop updates**: The desktop app automatically checks for updates in the background and displays a notification indicator dot in the bottom bar when a new version is available, with a one-click **Update** / **Install Now** option in the menu and **About** dialog.

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
  const settingsWiki = `> Any setting modified from its default value displays a blue indicator dot next to its control. Clicking the indicator dot resets that individual setting back to its default.

### General

\`Theme\` System (Default) | Light | Dark
- Set the visual theme of the application (\`System\` follows your OS appearance).
- Click the **Customize theme** palette button to customize individual syntax highlighting colors (\`Answers\`, \`Comments\`, \`Constants\`, \`Currencies\`, \`Errors\`, \`Excel\`, \`Functions\`, \`Keywords\`, \`Numbers\`, \`Text\`, \`Operators\`, \`Units\`, \`Variables\`, and \`Plain\` when syntax highlighting is off) for both Light and Dark themes using live color pickers, with per-color reset buttons and a **Restore defaults** option.

\`Zoom level\` Smaller | Normal (Default) | Larger
- Set the overall UI zoom level across typography, icons, controls, and panels.

\`Page list position\` Auto (Default) | Floating | Docked | Tabs
- Set the position and display mode of the page list:
  - \`Auto\` (Default): Automatically docks the page list side panel when the window is wider than \`900px\` and switches to a floating slide-out drawer on narrower windows.
  - \`Floating\`: Always displays the page list as a slide-out overlay drawer when clicking the page name in the bottom bar (or pressing \`Shift+Tab\`).
  - \`Docked\`: Keeps the page list permanently docked on the left side of the window. Drag the page list border to resize its width (\`210px\` – \`510px\`), or double-click the border to reset it to the default width (\`265px\`). On narrower windows, a toggle button in the page list header switches between \`Docked\` and \`Auto\`.
  - \`Tabs\`: Displays pages as horizontal scrollable tabs directly in the bottom bar instead of a side panel, with left/right scroll arrows when tabs overflow.

\`Always on top\` On | Off (Default) *(Desktop only)*
- Keep the Numara window floating on top of all other application windows on the screen.

\`Start at login\` On | Off (Default) *(Desktop only)*
- Start Numara automatically when logging into your computer.

\`Start with blank page\` On | Off (Default)
- Open an existing blank page (or create a new blank page if none exists) when the app starts instead of reopening the last used page.

\`Keep in menu bar\` / \`Keep in system tray\` On | Off (Default) *(Desktop only)*
- Keep Numara running in the macOS menu bar or Windows/Linux system tray. When enabled, closing the window hides Numara instead of quitting; click the tray/menu bar icon to show Numara, or right-click it to **Show Numara**, **Hide Numara**, or **Quit**.

\`Close app on Esc key\` On | Off (Default) *(Desktop only)*
- Close or hide the Numara window when pressing the \`Esc\` key (when no modal, dropdown, search panel, inline rename input, or autocomplete menu is open).

#### Notifications

\`Position\` Top Left | Top Center | Top Right | Bottom Left | Bottom Center (Default) | Bottom Right
- Set the position on the screen where toast notifications (e.g. clipboard copy confirmations, import/export messages, and warnings) appear.

\`Duration\` 1 second | 3 seconds | 5 seconds (Default) | 10 seconds | 30 seconds | Close manually
- Set how long toast notifications remain visible before automatically dismissing, or set to \`Close manually\` to keep them visible until clicked.

### Editor

#### Typography

\`Font size\` Tiny | Small | Normal (Default) | Large | X-Large
- Set the font size of calculation text in the input and output panels (\`0.9rem\` to \`1.3rem\`).

\`Font weight\` Light | Thin | Normal (Default) | Semi Bold | Bold
- Set the font weight of calculation text in the input and output panels (\`200\` to \`700\`).

\`Line height\` Tiny | Small | Normal (Default) | Large | X-Large
- Set the vertical height of each calculation line in the input and output panels (\`17px\` to \`34px\`).

#### Display & Behavior

\`Answer position\` Left (with divider) (Default) | Right (no divider) | Below Expression
- Set where answers are displayed:
  - \`Left (with divider)\` (Default): Left-aligns answers in the output panel with a draggable vertical divider between the input and output panels. Drag the divider to resize the panel width ratio, or double-click it to reset to the default (\`60%\` / \`40%\`).
  - \`Right (no divider)\`: Right-aligns answers on the far right of the output panel without a vertical divider.
  - \`Below Expression\`: Displays each answer directly below its corresponding input line inside the editor instead of in a side-by-side output column.

\`Wrap input expressions\` On (Default) | Off
- Wrap long input expressions onto multiple visual lines while keeping each corresponding output row vertically aligned. When Off, overflowing lines scroll horizontally.

\`Truncate answers\` On (Default) | Off
- Truncate long answers on the output panel with ellipses (\`...\`) instead of showing a horizontal scrollbar. Hovering over a truncated answer displays the full value in a tooltip.

\`Line numbers\` On (Default) | Off
- Show line numbers in the left gutter of the input panel. Clicking a line number above the active line inserts \`lineX\` at the cursor; clicking a red line number displays the error details for that line.

\`Show rulers\` On | Off (Default)
- Show horizontal ruler lines across the input and output panels to visually separate each calculation row.

\`Line errors\` On | Off (Default)
- Show an \`Error\` link in the output panel whenever a calculation error occurs on a line (in addition to highlighting the line number in red). Clicking \`Error\` or the red line number opens a dialog with details about the error.

\`Syntax highlighting\` On (Default) | Off
- Enable syntax highlighting for functions, units, constants, currencies, keywords, line references, variables, numbers, operators, and comments. When Off, all text uses the \`Plain\` theme color and both \`Keyword tooltips\` and \`Highlight matching brackets\` are disabled.

  - \`Keyword tooltips\` On (Default) | Off
    Display hover tooltips with descriptions, syntax, or live evaluated values when hovering over functions, units, constants, currencies, keywords, variables, and \`lineX\` references (requires \`Syntax highlighting\` to be On).

  - \`Highlight matching brackets\` On (Default) | Off
    When the cursor is next to a parenthesis \`()\`, square bracket \`[]\`, or curly brace \`{}\`, highlight the matching bracket (requires \`Syntax highlighting\` to be On).

\`Autocomplete hints\` On (Default) | Off
- Automatically show autocomplete suggestions while typing for built-in functions, units, constants, currencies, keywords, user-defined functions/units, variables, \`page("...")\` names and exported variables, \`formulajs.*\` functions, and \`DateTime\` methods (can also be triggered manually with \`Ctrl+Space\`).

\`Close matching brackets\` On (Default) | Off
- Automatically insert matching closing brackets and quotes (\`()\`, \`[]\`, \`{}\`, \`""\`, \`''\`) when typed.

### Calculator

#### Output

\`Numeric output\` Number (Default) | BigNumber | Fraction
- The type of numeric output for functions which cannot determine the numeric type from the inputs. For most functions, the type of output is determined from the input: a number as input will return a number as output, a BigNumber as input returns a BigNumber as output.

  For example, \`'2+3'\`, \`parse('2+3')\`, \`range('1:10')\`, and \`unit('5cm')\` use the numeric output setting, whereas \`sqrt(4)\` will always return the number \`2\` regardless of the setting because the input is a number.

  - \`Number\` (Default): Standard JavaScript double-precision (\`64-bit\` floating-point) numbers.
  - \`BigNumber\`: Arbitrary-precision decimal numbers with higher precision than standard JavaScript numbers. *(Caution: Using \`BigNumber\` is not compatible with function plotting or some Math.js functions and may affect performance.)*
  - \`Fraction\`: Exact rational numbers stored in terms of a numerator and denominator (e.g. \`1/3 + 1/6\` outputs \`1/2\`).

\`Matrix type\` Matrix (Default) | Array
- The default type of matrix output for functions. Where possible, the type of matrix output from functions is determined from the function input: an Array as input returns an Array, a Matrix as input returns a Matrix. In case of no matrix as input, the type of output is determined by this option. In case of mixed matrix inputs, a Matrix is always returned.

\`Precision\` (0 - 16) Default 4
- Maximum number of decimal places to display for formatted answers (and the fixed decimal precision when \`Notation\` is set to \`Fixed\`).

\`Notation\` Auto (Default) | Engineering | Exponential | Fixed | Binary | Hexadecimal | Octal
- Numeric notation format for answers:

  - \`Auto\` (Default): Regular number notation for numbers having an absolute value between the lower and upper exponent bounds, and exponential notation elsewhere. Lower bound is included, upper bound is excluded. For example \`123.4\` and \`1.4e7\`.
  - \`Engineering\`: Always use engineering notation (exponential notation with the exponent selected to be a multiple of 3). For example \`123.4e+0\` and \`14.0e+6\`.
  - \`Exponential\`: Always use exponential notation. For example \`1.234e+2\` and \`1.4e+7\`.
  - \`Fixed\`: Always use regular number notation with the configured \`Precision\` regardless of the exponent limits.
  - \`Binary\`, \`Hexadecimal\`, or \`Octal\`: Format numbers using binary, hexadecimal, or octal notation. For example \`0b1101\`, \`0x10fe\`, and \`0o23\`.

  - \`Lower exponent limit\` (-32 - 0) Default -12
    Lower exponent threshold for formatting a value in scientific notation when \`Notation\` is set to \`Auto\`.

  - \`Upper exponent limit\` (0 - 32) Default 12
    Upper exponent threshold for formatting a value in scientific notation when \`Notation\` is set to \`Auto\`.

#### Evaluation

\`Continue from previous line\` On (Default) | Off
- Choose whether a calculation on a new line starting with \`+\`, \`-\`, \`*\`, or \`/\` (immediately following a non-empty line) should automatically continue from the previous line's answer (\`ans\`).

\`Predictable output\` On | Off (Default)
- When On, output type depends only on the input types. When Off (Default), output type can vary depending on input values. For example \`sqrt(-4)\` returns \`complex('2i')\` when predictable is Off, and returns \`NaN\` when On. Predictable output can be needed when programmatically handling the result of a calculation, but can be inconvenient for users when evaluating dynamic equations.

\`Calculation timeout (seconds)\` (1 - 60) Default 10
- Set the timeout in seconds for long-running calculations before displaying a **Calculation Timeout** dialog for the slow line, where you can choose **Wait** (continue waiting) or **Ignore Line** (cancel the calculation, comment out that line with \`// \`, and recalculate).

### Format

#### Numbers

\`Number format\` 1,234.56 (Default) | 1.234,56 | 1 234.56 | 1 234,56
- Set the thousands grouping and decimal separator format used for both input expressions and formatted output answers. When a comma-decimal format (\`1.234,56\` or \`1 234,56\`) is selected, comma (\`,\`) is used as the decimal separator, so you must use a semicolon (\`;\`) as the argument separator in functions (e.g. \`sum(1,5; 2,5)\`).

\`Thousands separator\` On (Default) | Off
- Show thousands grouping separators in output answers and formatted currency amounts.

  - \`Copy with answer\` On | Off (Default)
    Choose whether to include the thousands separator when copying answers to the clipboard (requires \`Thousands separator\` to be On).

#### Dates

\`Date format\` MM/DD/YYYY (Default) | DD/MM/YYYY | YYYY-MM-DD
- Set the date format used for parsing date literals in date calculations and formatting date outputs (\`today\`, \`now\`, and date arithmetic).

\`Show day with date\` On | Off (Default)
- If On, the abbreviated day of the week is prepended to formatted date outputs when performing date calculations and using keywords such as \`today\` and \`now\` (e.g. \`Fri, 05/01/2026\`).

#### Currency

\`Enabled\` On (Default) | Off
- Enable currency conversions and currency code/symbol recognition. Exchange rates are provided by [frankfurter.dev](https://frankfurter.dev). *(Note: When turned Off, currencies already registered in the current session are removed after restarting the app.)*

\`Rate update interval\` On start (Default) | 1 hour | 3 hours | 6 hours | 12 hours | Manual
- Set how often currency exchange rates are updated in the background, or select \`Manual\` to update only when clicking the **Update now** refresh button next to the selector (requires \`Currency\` to be Enabled).

### Sync *(Desktop only)*

\`Enable sync\` On | Off (Default)
- Enable real-time two-way synchronization between calculation pages and \`.num\` files in a local folder:
  - Local page edits, creations, renames, and deletions are automatically saved to \`.num\` files in the sync folder, and external file additions, edits, renames, or deletions in the folder automatically update your pages in Numara.
  - If a \`.num\` file in the sync folder has different content than an existing local page of the same name when initializing sync, Numara prompts you to **Overwrite Local** or **Sync Local**.
  - If the sync folder is deleted or becomes inaccessible, Numara prompts you to **Disable Sync** or **Select New Folder**.

\`Sync folder\`
- Click **Choose Folder** (or the current folder path) to select or change the local folder used to synchronize \`.num\` page files. Right-click the folder path to open it in your system file manager.

### Reset Actions

- **Reset all data**: Clear all user settings, custom theme colors, user-defined functions/units, saved pages, and local storage data.
- **Restore defaults**: Revert all settings and panel widths back to their default values (with a **Keep sync enabled** option when folder sync is active).
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
| \`Cmd+,\` | \`Ctrl+,\` *(Linux)* | Open Settings *(Desktop)* |
| \`Shift+Tab\` | \`Shift+Tab\` | Open or close the page list (when not docked or in Tabs mode) |
| \`Esc\` | \`Esc\` | Close open modal, dropdown, search panel, or app window (when **Close app on Esc key** is enabled) |

### Editor & Search Shortcuts

| Shortcut (macOS) | Shortcut (Windows / Linux) | Action |
| --- | --- | --- |
| \`Cmd+Z\` / \`Cmd+Shift+Z\` | \`Ctrl+Z\` / \`Ctrl+Y\` (\`Ctrl+Shift+Z\`) | Undo / Redo |
| \`Cmd+/\` | \`Ctrl+/\` | Toggle line comments (\`//\`) on selected lines |
| \`Ctrl+Space\` | \`Ctrl+Space\` | Open autocomplete suggestions |
| \`Ctrl+Q\` | \`Ctrl+Q\` | Fold or unfold collapsible section at cursor |
| \`Cmd+F\` | \`Ctrl+F\` | Open the Find panel |
| \`Cmd+Opt+F\` | \`Ctrl+H\` | Open the Find and Replace panel |
| \`Enter\` / \`Shift+Enter\` | \`Enter\` / \`Shift+Enter\` | Navigate to next / previous search match (or replace current match when focused in Replace input) |

### Mouse & UI Interactions

| Interaction | Action |
| --- | --- |
| **Click an answer** | Copy the answer to the clipboard |
| **Select multiple lines** | View live **Sum**, **Avg**, and **Count** in the bottom bar (click to copy the sum) |
| **Click a page link answer** | Open the referenced page |
| **Click a line number** (above active line) | Insert \`lineX\` into the active expression |
| **Click a red line number / Error** | View error details for that line |
| **Double-click page in page list / page title / page tab** | Rename the page inline |
| **Right-click a page tab** (bottom bar) | Open tab context menu (Rename, Duplicate, Delete) |
| **Scroll wheel on page tabs** (bottom bar) | Scroll horizontally through page tabs |
| **Double-click item in User Definitions** | Load the function or unit into the form for editing |
| **Click indicator dot next to a modified setting** | Reset that setting to its default value |
| **Right-click Sync folder path** *(Desktop)* | Open the sync folder in the system file manager |
| **Drag / double-click panel divider** | Resize input and output panels / reset to default width |
| **Drag / double-click docked page list edge** | Resize docked page list / reset to default width |
| **Drag and drop page in page list / page tabs** | Reorder pages |
| **Click floating scroll-to-top button** (bottom right) | Smoothly scroll the input and output panels back to the top |
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
