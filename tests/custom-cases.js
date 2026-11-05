// Define your custom test cases here.
// Each test case has:
//   name: String identifier for the test
//   expressions: Array of lines to evaluate sequentially (retaining scope)
//   expected: Array of expected string outputs (or RegExp). If omitted, standard mathjs evaluation is used as comparison.
//   settings: Optional custom settings object to override defaults (like contPrevLine)

export const customCases = [
  {
    name: 'Percentage Syntax',
    expressions: ['10% of 100', '20% of 50'],
    expected: ['10', '10']
  },
  {
    name: 'Line Continuation Chaining',
    settings: {
      contPrevLine: true
    },
    expressions: ['-4.5', '-(-5.6)', '+"2"'],
    expected: ['-4.5', '1.1', '3.1']
  },
  {
    name: 'Currency Math (Frankfurter rates conversion)',
    expressions: ['10 USD to EUR'],
    expected: [
      // Expected result should contain EUR or € (e.g. "8.8 EUR", "€8.8" or similar formatted rate string)
      /EUR|€/
    ]
  },
  {
    name: 'MathJS Equivalence Check (Automatic expected answers)',
    expressions: ['a = 15', 'b = 20', 'sqrt(a^2 + b^2)']
    // 'expected' is omitted here, so standard mathjs will be used to generate expected answers on the fly
  },
  {
    name: 'Check hex() function',
    expressions: ['hex(1024)']
  },
  {
    name: 'Date/Time Arithmetic (non-mathjs)',
    settings: {
      dateFormat: 'd/M/yyyy'
    },
    expressions: [
      '1/1/2026 + 1 day',
      '1/1/2026 - 2 days',
      '1/1/2026 + 1 week',
      '1/1/2026 - 1 month',
      '1/1/2026 + 1 year',
      '1/1/2026 + 1 decade',
      '1/1/2026 + 1 century'
    ],
    expected: ['2/1/2026', '30/12/2025', '8/1/2026', '1/12/2025', '1/1/2027', '1/1/2036', '1/1/2126']
  },
  {
    name: 'Date/Time Arithmetic with Day of Week Prefix',
    settings: {
      dateFormat: 'd/M/yyyy',
      dateDay: true
    },
    expressions: ['1/1/2026 + 1 day', '1/1/2026 + 1 week'],
    expected: ['Fri, 2/1/2026', 'Thu, 8/1/2026']
  },
  {
    name: 'Running Totals and Averages (Keywords)',
    expressions: ['10', '20', 'subtotal', 'total', '', '30', 'subtotal', 'avg', 'subavg', 'total'],
    expected: ['10', '20', '30', '30', '', '30', '30', '20', '30', '60']
  },
  {
    name: 'Currency Symbols Conversion',
    expressions: [
      '$10 to EUR',
      '10 € to USD',
      '£ 15 to TRY',
      '₹100 to USD',
      '₩1000 to USD',
      'R$50 to USD',
      'C$100 to USD',
      'S/100 to USD',
      'zł40 to USD',
      '100 ₪ to USD'
    ],
    expected: ['€8.8496', '$11.30', '₺640.00', '$1.20', '$0.75', '$10.00', '$2.70', '$27.00', '$10.00', '$27.00']
  },
  {
    name: 'Line Labels (Prefix with Colon)',
    expressions: ['rent: 1200', 'food: 300', 'total'],
    expected: ['1200', '300', '1500']
  },
  {
    name: 'Semicolon Argument Separator (1.234,56 number format)',
    settings: {
      numberFormat: '1.234,56'
    },
    expressions: ['sum(1;2;3)', 'mean(10;20;30)'],
    expected: ['6', '20']
  },
  {
    name: 'Complex Percentage & Arithmetic Expressions',
    expressions: ['100 + 20%', '15% of (50 + 50)', '10% of 50 + 20% of 50'],
    expected: ['120', '15', '15']
  },
  {
    name: 'Locale Separators (1.234,56 format / Period thousands & Comma decimal)',
    settings: {
      numberFormat: '1.234,56'
    },
    expressions: ['1.234.567,89 + 0,11', '1234,5 * 2', '1,200 + 3.4525'],
    expected: ['1234568', '2469', /Invalid number/]
  },
  {
    name: 'Locale Separators (1,234.56 format / Comma thousands & Period decimal)',
    settings: {
      numberFormat: '1,234.56'
    },
    expressions: ['1,234,567.89 + 0.11', '1234.5 * 2'],
    expected: ['1234568', '2469']
  },
  {
    name: 'Formula.js and Nerdamer UDF Integration',
    udf: 'my_sum: (a, b) => formulajs.SUM(a, b), my_solve: (expr) => nerdamer(expr).solveFor("x").toString()',
    expressions: ['my_sum(10, 20)', 'my_solve("x^2 = 9")', 'nerdamer("x^2 + 2x + 1")'],
    expected: ['30', '3,-3', '1+2*x+x^2']
  },
  {
    name: 'User Defined Objects / Properties',
    udf: 'sk: { BaseCarry: 300, SteedStone: 100, Necromage: 1.25 }',
    expressions: ['sk.BaseCarry + sk.SteedStone * sk.Necromage'],
    expected: ['425']
  },
  {
    name: 'Cross-Page Import',
    pages: [{ id: 'page-rates', name: 'Rates', data: 'hourly = 85\ngst = 0.05' }],
    expressions: ['r = page("Rates")', '6 * r.hourly * (1 + r.gst)', 'p = page("rates")', 'p.hourly'],
    expected: ['Rates', '535.5', 'Rates', '85']
  },
  {
    name: 'Cross-Page User Variable Access',
    pages: [{ id: 'page-q1', name: 'Q1', data: 'base = 600' }],
    expressions: ['q = page("Q1")', 'q.base + 50'],
    expected: ['Q1', '650']
  },
  {
    name: 'User Defined Units',
    udu: 'foo: { definition: "2 m" }',
    expressions: ['2 foo to m'],
    expected: ['4 m']
  },
  {
    name: 'Today and Now Scope Variables',
    expressions: ['today + 1 day', 'now + 1 day'],
    expected: [/\d{1,2}\/\d{1,2}\/\d{4}/, /\d{1,2}\/\d{1,2}\/\d{4}/]
  },
  {
    name: 'Regression: Currency Substring Collisions',
    expressions: ['myEURvar = 100', 'myEURvar + 50'],
    expected: ['100', '150']
  },
  {
    name: 'Regression: Issue #279 (Unit values floor/ceil/abs)',
    expressions: ['C1 = 1000.5 W', 'floor(C1 / 1 W)', 'ceil(C1 / 1 W)', 'abs(C1)'],
    expected: ['1.0005 kW', '1000', '1001', '1.0005 kW']
  },
  {
    name: 'Regression: Keyword Variable Collisions',
    expressions: ['total_amount = 500', 'subtotal_count = 100', 'total'],
    expected: ['500', '100', '600']
  },
  {
    name: 'Regression: Cross-Page Today/Now Scope',
    pages: [{ id: 'page-dates', name: 'Dates', data: 'd = today + 2 days' }],
    expressions: ['p = page("Dates")', 'p.d'],
    expected: ['Dates', /\d{1,2}\/\d{1,2}\/\d{4}/]
  },
  {
    name: 'Regression: 1.234,56 and 1,234.56 With Thousands Separator Off',
    settings: {
      numberFormat: '1.234,56',
      thouSep: false
    },
    expressions: ['1,25 + 2,5', 'pow(2;3)', 'sum(1;2;3)', '1.000 + 2.500'],
    expected: ['3,75', '8', '6', '3500']
  },
  {
    name: 'Regression: Single-Letter Unit/Constant Line Labels',
    expressions: ['m: 100', 's: 20', 'e: 10% of 50', 'total'],
    expected: ['100', '20', '5', '125']
  },
  {
    name: 'Regression: Line Continuation Stops on Comments',
    settings: {
      contPrevLine: true
    },
    expressions: ['10', '// comment line', '+5'],
    expected: ['10', '', '5']
  },
  {
    name: 'Regression: Exact Calendar Month Date Arithmetic',
    settings: {
      dateFormat: 'd/M/yyyy'
    },
    expressions: ['1/3/2026 - 1 month', '1/1/2026 12:30 + 1 day'],
    expected: ['1/2/2026', /2\/1\/2026/]
  },
  {
    name: 'Date Format: MM/DD/YYYY (Default) Input and Output',
    expressions: ['01/15/2026 + 1 day', '1/15/2026 + 2 days', '15/01/2026 + 1 day', '2026-01-15 + 1 day', 'today'],
    expected: ['01/16/2026', '01/17/2026', 'Invalid Date', 'Invalid Date', /^\d{2}\/\d{2}\/\d{4}$/]
  },
  {
    name: 'Date Format: DD/MM/YYYY Input and Output',
    settings: {
      dateFormat: 'dd/MM/yyyy'
    },
    expressions: ['15/01/2026 + 1 day', '15/1/2026 + 2 days', '01/15/2026 + 1 day', '2026-01-15 + 1 day', 'today'],
    expected: ['16/01/2026', '17/01/2026', 'Invalid Date', 'Invalid Date', /^\d{2}\/\d{2}\/\d{4}$/]
  },
  {
    name: 'Date Format: YYYY-MM-DD Input and Output',
    settings: {
      dateFormat: 'yyyy-MM-dd'
    },
    expressions: ['2026-01-15 + 1 day', '2026-1-15 - 2 days', '01/15/2026 + 1 day', '15/01/2026 + 1 day', 'today'],
    expected: ['2026-01-16', '2026-01-13', 'Invalid Date', 'Invalid Date', /^\d{4}-\d{2}-\d{2}$/]
  },
  {
    name: 'Natural Base and Percentage Conversions (in/to hex, bin, oct, %)',
    expressions: [
      '255 in hex',
      '255 to hex',
      '10 in bin',
      '10 to bin',
      '64 in oct',
      '64 to oct',
      '0.15 in %',
      '0.15 to %',
      '(1 / 4) in %'
    ],
    expected: ['0xff', '0xff', '0b1010', '0b1010', '0o100', '0o100', '15%', '15%', '25%']
  },
  {
    name: 'Regression: Fallback Evaluator Precedence, Units, and Strings',
    expressions: ['x = -2', 'label: x^2', 'd = 5 cm', 'len: d^2 to cm^2', 'note: concat("x", "y")'],
    expected: ['-2', '4', '5 cm', '25 cm^2', 'xy']
  },
  {
    name: 'Regression: Keyword Precedence and Non-Numeric Lines in Totals',
    expressions: ['-5', 'total^2', '"hello"', 'total', 'avg'],
    expected: ['-5', '25', 'hello', '-5', '-5']
  },
  {
    name: 'Regression: Comma Decimal Date-Time Consecutive Lines (lastIndex)',
    settings: {
      numberFormat: '1.234,56',
      dateFormat: 'd/M/yyyy',
      dateDay: true
    },
    expressions: ['5 hours + 2 days', 'Fri, 2/1/2026 + 1 day'],
    expected: ['53 hours', 'Sat, 3/1/2026']
  },
  {
    name: 'Regression: Currency Formatting Preserves String Literals in Objects',
    expressions: ['x = {s: "5 eur"}'],
    expected: ['{"s": "5 eur"}']
  },
  {
    name: 'Regression: Multi-Statement Keyword Lines Execute Side-Effects Once',
    expressions: ['a = 10', 'a = a + 5; total', 'a'],
    expected: ['10', '[10]', '15']
  },
  {
    name: 'Answer and Line Reference Variables (ans, _, lineN) and Error Clearing',
    expressions: ['10 + 5', 'ans * 2', '_ + 10', 'line1 + line2 + line3', 'invalid_var', 'ans', '_'],
    expected: ['15', '30', '40', '85', /Undefined symbol invalid_var/, /Undefined symbol ans/, /Undefined symbol _/]
  },
  {
    name: 'Error Line Resets Running Subtotal',
    expressions: ['10', '20', 'subtotal', 'unknown_symbol', '5', 'subtotal', 'total'],
    expected: ['10', '20', '30', /Undefined symbol unknown_symbol/, '5', '5', '35']
  },
  {
    name: 'Notation Mode: Fixed',
    settings: {
      notation: 'fixed',
      precision: '3',
      thouSep: false
    },
    expressions: ['12.3', '1.23456'],
    expected: ['12.300', '1.235']
  },
  {
    name: 'Notation Mode: Exponential',
    settings: {
      notation: 'exponential',
      precision: '2'
    },
    expressions: ['12345', '0.126'],
    expected: ['1.2345e+4', '1.3e-1']
  },
  {
    name: 'Notation Mode: Engineering',
    settings: {
      notation: 'engineering',
      precision: '3'
    },
    expressions: ['12345'],
    expected: ['12.345e+3']
  },
  {
    name: 'Notation Modes: Hex, Bin, and Oct',
    settings: {
      notation: 'hex'
    },
    expressions: ['255', '16'],
    expected: ['0xff', '0x10']
  },
  {
    name: 'Auto Notation Exponent Bounds (expLower and expUpper)',
    settings: {
      notation: 'auto',
      expLower: '-3',
      expUpper: '3',
      thouSep: false
    },
    expressions: ['100', '1000', '0.001', '0.0001'],
    expected: ['100', '1e+3', '0.001', '1e-4']
  },
  {
    name: 'Numeric Output: Fraction',
    settings: {
      numericOutput: 'Fraction'
    },
    expressions: ['1/3 + 1/6', '0.25 + 0.5'],
    expected: ['1/2', '3/4']
  },
  {
    name: 'Predictable Evaluation Mode',
    settings: {
      predictable: true
    },
    expressions: ['sqrt(-4)', 'sqrt(4)'],
    expected: ['NaN', '2']
  },
  {
    name: 'Matrix Type: Array',
    settings: {
      matrixType: 'Array'
    },
    expressions: ['[1, 2] + [3, 4]', 'size([10, 20, 30])'],
    expected: ['[4, 6]', '[3]']
  },
  {
    name: 'Function Plotting Detection and Line References',
    expressions: ['f(x) = x^2 + 1', 'ans', 'line1', 'f(3)'],
    expected: ['f(x) = x^2 + 1', 'f(x) = x^2 + 1', 'f(x) = x^2 + 1', '10']
  },
  {
    name: 'Cross-Page Reference Edge Cases (Circular, Missing, .num Suffix, Scope Isolation)',
    pages: [
      { id: 'p-rates', name: 'Rates.num', data: 'tax = 0.2\n100' },
      { id: 'p-cycle-a', name: 'CycleA', data: 'x = page("CycleB").y' },
      { id: 'p-cycle-b', name: 'CycleB', data: 'y = page("CycleA").x' }
    ],
    expressions: [
      'r = page("Rates.num")',
      'r.tax',
      'rById = page("p-rates")',
      'rById.tax',
      'r.ans',
      'r.line1',
      'page("MissingPage")',
      'page(123)',
      'page("CycleA").x'
    ],
    expected: [
      'Rates.num',
      '0.2',
      'Rates.num',
      '0.2',
      '',
      '',
      /Page "MissingPage" not found/,
      /Page name must be a string/,
      ''
    ]
  },
  {
    name: 'Luxon DateTime in User Defined Functions',
    udf: 'daysInJan2026: () => luxon.fromObject({ year: 2026, month: 1 }).daysInMonth',
    expressions: ['daysInJan2026()'],
    expected: ['31']
  },
  {
    name: 'Comments Inside String Literals and Unicode Variable Identifiers',
    expressions: [
      'url = "https://example.com/path#frag" // trailing comment',
      'hash = "item #1" # another comment',
      'url',
      'hash',
      'ücret = 250',
      'π_val = 10',
      'ücret + π_val'
    ],
    expected: [
      'https://example.com/path#frag',
      'item #1',
      'https://example.com/path#frag',
      'item #1',
      '250',
      '10',
      '260'
    ]
  },
  {
    name: 'Comma-Decimal Number Format Validation Errors (1.234,56)',
    settings: {
      numberFormat: '1.234,56'
    },
    expressions: ['a = 1', 'b = 2', '1.23,45', 'max(a; b)', 'max(a, b)'],
    expected: ['1', '2', /Invalid number "1\.23,45"/, '2', /Use semicolon \(;\) as argument separator/]
  },
  {
    name: 'Colon Labels Do Not Collide With Scope Variables or Ranges',
    expressions: ['rent = 1', 'rent: 5', 'rent:5', '1:4'],
    expected: ['1', '5', '[1, 2, 3, 4, 5]', '[1, 2, 3, 4]']
  },
  {
    name: 'Date Difference Arithmetic (date1 - date2)',
    expressions: [
      '01/20/2026 - 01/15/2026',
      '01/20/2026 - 01/15/2026 in hours',
      '01/22/2026 - 01/15/2026 to weeks',
      '01/20/2026 15:30 - 01/20/2026 12:00',
      'd1 = 01/15/2026 + 5 days',
      'd1 - 01/15/2026',
      'diff = 01/25/2026 - 01/15/2026',
      'diff in hours'
    ],
    expected: ['5 days', '120 hours', '1 weeks', '3.5 hours', '01/20/2026', '5 days', '10 days', '240 hours']
  },
  {
    name: 'Date Difference Arithmetic in YYYY-MM-DD Format',
    settings: {
      dateFormat: 'yyyy-MM-dd'
    },
    expressions: ['2026-01-20 - 2026-01-15', '2026-01-20 - 2026-01-15 in hours'],
    expected: ['5 days', '120 hours']
  },
  {
    name: 'Natural Percentage Ratios and Variable/Unit Percentage Offsets',
    expressions: [
      '50 as % of 200',
      '50 as a % of 200',
      '30 is what % of 150',
      'ratio = 25 as % of 100',
      'ratio',
      '20% OF 100',
      'price = $200',
      'price + 15%',
      'price - 10%',
      'len = 50 m',
      'len + 20%'
    ],
    expected: ['25%', '25%', '20%', '25%', '0.25', '20', '$200.00', '$230.00', '$180.00', '50 m', '60 m']
  },
  {
    name: 'Non-English System Locale with English Date/Time Fallback',
    settings: {
      systemLocale: 'fr-FR',
      dateFormat: 'dd/MM/yyyy',
      dateDay: true
    },
    expressions: [
      'ven., 02/01/2026 + 1 day',
      'Fri, 02/01/2026 + 1 day',
      'Fri, 02/01/2026 - Thu, 01/01/2026',
      '02/01/2026 3:30 PM + 2 hours'
    ],
    expected: ['sam., 03/01/2026', 'sam., 03/01/2026', '1 days', 'ven., 02/01/2026 17:30']
  },
  {
    name: 'Non-Latin Numeral and Non-Gregorian Subtag Locales (ar-EG, fa-IR, th-TH-u-ca-buddhist)',
    settings: {
      systemLocale: 'ar-EG',
      dateFormat: 'dd/MM/yyyy',
      dateDay: true
    },
    expressions: ['today + 1 day', 'now + 1 hour', 'Fri, 02/01/2026 + 1 day'],
    expected: [/\d{2}\/\d{2}\/\d{4}/, /\d{2}\/\d{2}\/\d{4}/, /03\/01\/2026/]
  },
  {
    name: 'Locale Separators (1 234.56 format / Space thousands & Period decimal)',
    settings: {
      numberFormat: '1 234.56',
      copyThouSep: true
    },
    expressions: [
      '1 234 567.89 + 0.11',
      '1 234.5 * 2',
      '1 000/2',
      'sum(1 000, 2 500.5)',
      '$1 000 + $2 345.67',
      '01/15/2026 12:30 + 1 day'
    ],
    expected: ['1 234 568', '2 469', '500', '3 500.5', '$3 345.67', '01/16/2026 12:30']
  },
  {
    name: 'Locale Separators (1 234,56 format / Space thousands & Comma decimal)',
    settings: {
      numberFormat: '1 234,56',
      copyThouSep: true
    },
    expressions: [
      '1 234 567,89 + 0,11',
      '1 234,5 * 2',
      '1 000/2',
      '0,5:0,5:1,5',
      'sum(1 000; 2 500,5)',
      '$1 000 + $2 345,67',
      '1.200 + 3,4525',
      '1 234.56',
      'max(1; 2)',
      'max(1, 2)',
      '01/15/2026 12:30 + 1 day'
    ],
    expected: [
      '1 234 568',
      '2 469',
      '500',
      '[0,5, 1, 1,5]',
      '3 500,5',
      '$3 345,67',
      /Invalid number/,
      /Invalid number/,
      '2',
      /Use semicolon \(;\) as argument separator/,
      '01/16/2026 12:30'
    ]
  },
  {
    name: 'Thousands Separator Off Across All Number Formats',
    settings: {
      numberFormat: '1 234,56',
      thouSep: false,
      copyThouSep: true
    },
    expressions: ['1 000 + 2 500,5', 'sum(1 200; 800,25)', '$1 000 + $500,5', '12,345 in %'],
    expected: ['3500,5', '2000,25', '$1500,50', '1234,5%']
  },
  {
    name: 'Thousands Separator Off (1 234.56 format)',
    settings: {
      numberFormat: '1 234.56',
      thouSep: false,
      copyThouSep: true
    },
    expressions: ['1 000 + 2 500.5', 'sum(1 200, 800.25)', '$1 000 + $500.5', '12.345 in %'],
    expected: ['3500.5', '2000.25', '$1500.50', '1234.5%']
  },
  {
    name: 'Notation Modes: Binary and Octal',
    settings: {
      notation: 'bin'
    },
    expressions: ['10', '255', 'bigint(255)', 'bigint(-10)'],
    expected: ['0b1010', '0b11111111', '0b11111111', '-0b1010']
  },
  {
    name: 'Notation Mode: Octal',
    settings: {
      notation: 'oct'
    },
    expressions: ['8', '64', '511', 'bigint(255)'],
    expected: ['0o10', '0o100', '0o777', '0o377']
  },
  {
    name: 'Notation Mode: Hexadecimal With BigInt',
    settings: {
      notation: 'hex'
    },
    expressions: ['255', 'bigint(255)', 'bigint(-255)'],
    expected: ['0xff', '0xff', '-0xff']
  },
  {
    name: 'Notation Mode: Fixed Combined With Space and Comma Number Formats',
    settings: {
      notation: 'fixed',
      precision: '2',
      numberFormat: '1 234,56',
      thouSep: true,
      copyThouSep: true
    },
    expressions: ['1 234,5 + 0,05', '1000', '12,346'],
    expected: ['1 234,55', '1 000,00', '12,35']
  },
  {
    name: 'Notation Modes: Exponential and Engineering With Comma Decimal Format',
    settings: {
      notation: 'exponential',
      precision: '2',
      numberFormat: '1.234,56'
    },
    expressions: ['12.345', '0,126'],
    expected: ['1,2345e+4', '1,3e-1']
  },
  {
    name: 'Notation Mode: Engineering With Space-Comma Format',
    settings: {
      notation: 'engineering',
      precision: '3',
      numberFormat: '1 234,56'
    },
    expressions: ['12 345', '1 234 567'],
    expected: ['12,345e+3', '1,234567e+6']
  },
  {
    name: 'Precision Zero (Integer Rounding) With Units and Currencies',
    settings: {
      precision: '0',
      numberFormat: '1,234.56',
      thouSep: true,
      copyThouSep: true
    },
    expressions: ['1234.56', '10.6 m + 2.1 m', '$999.60 + $0.50'],
    expected: ['1,235', '13 m', '$1,000']
  },
  {
    name: 'Auto Notation Exponent Bounds Combined With 1 234,56 and copyThouSep',
    settings: {
      notation: 'auto',
      expLower: '-3',
      expUpper: '4',
      numberFormat: '1 234,56',
      thouSep: true,
      copyThouSep: true
    },
    expressions: ['1 234,5', '12 345', '0,001', '0,0001'],
    expected: ['1 234,5', '1,2345e+4', '0,001', '1e-4']
  },
  {
    name: 'Numeric Output: BigNumber Combined With Space-Comma Format, Line Continuation, and Keywords',
    settings: {
      numericOutput: 'BigNumber',
      numberFormat: '1 234,56',
      precision: '6',
      thouSep: true,
      copyThouSep: true,
      contPrevLine: true
    },
    expressions: ['1 000,125', '+ 2 000,375', 'total', 'avg'],
    expected: ['1 000,125', '3 000,5', '4 000,625', '2 000,3125']
  },
  {
    name: 'Numeric Output: Fraction Combined With Comma-Decimal, Line Continuation, and Keywords',
    settings: {
      numericOutput: 'Fraction',
      numberFormat: '1 234,56',
      contPrevLine: true
    },
    expressions: ['1/3', '+ 1/6', '* (1/2)', '0,25 + 0,5', 'total', 'avg'],
    expected: ['1/3', '1/2', '1/4', '3/4', '11/6', '11/24']
  },
  {
    name: 'Matrix and Array Types Combined With Comma-Decimal and Space Grouping',
    settings: {
      matrixType: 'Array',
      numberFormat: '1 234,56',
      thouSep: true,
      copyThouSep: true
    },
    expressions: ['[1 000,5; 2 000,25] + [500,5; 750,75]', 'det([[1; 2]; [3; 4]])', 'transpose([1 000; 2 000])'],
    expected: ['[1 501, 2 751]', '-2', '[1 000, 2 000]']
  },
  {
    name: 'Predictable Mode False vs True With Complex Roots',
    settings: {
      predictable: false
    },
    expressions: ['sqrt(-4)', 'sqrt(4)'],
    expected: ['2i', '2']
  },
  {
    name: 'Additional Frankfurter Currency Symbols (¥, ₽, ₺, ₱, ฿, ₫, ₴, ₦, E)',
    expressions: [
      '¥100 to USD',
      '₽1000 to USD',
      '₺100 to USD',
      '₱100 to USD',
      '฿100 to USD',
      '₫100000 to USD',
      '₴100 to USD',
      '₦1000 to USD',
      'E 100 to USD',
      '100 E to USD'
    ],
    expected: ['$14.00', '$11.00', '$3.00', '$1.80', '$2.90', '$4.00', '$2.40', '$0.60', '$5.50', '$5.50']
  },
  {
    name: 'Currency Disabled Setting (currency: false)',
    settings: {
      currency: false
    },
    expressions: ['100 USD + 50 USD', '$100 + $50'],
    expected: ['150 USD', /Unexpected|Undefined/]
  },
  {
    name: 'Date Formats With Day of Week Prefix (MM/dd/yyyy and yyyy-MM-dd)',
    settings: {
      dateFormat: 'yyyy-MM-dd',
      dateDay: true,
      contPrevLine: true
    },
    expressions: ['2026-01-01 + 1 day', '+ 2 days', 'Sun, 2026-01-04 - Fri, 2026-01-02'],
    expected: ['Fri, 2026-01-02', 'Sun, 2026-01-04', '2 days']
  },
  {
    name: 'Date Arithmetic and Subtraction Combined With Comma-Decimal Format and dateDay',
    settings: {
      dateFormat: 'dd/MM/yyyy',
      dateDay: true,
      numberFormat: '1 234,56',
      contPrevLine: true
    },
    expressions: ['01/01/2026 + 1 day', '+ 2 days', 'Sun, 04/01/2026 - Fri, 02/01/2026', '01/01/2026 00:00 + 1,5 days'],
    expected: ['Fri, 02/01/2026', 'Sun, 04/01/2026', '2 days', /02\/01\/2026 12:00/]
  }
]
