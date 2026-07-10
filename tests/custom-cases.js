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
    expected: ['2/1/2026', '30/12/2025', '8/1/2026', '1/12/2025', '1/1/2027', '1/1/2036', '2/1/2126']
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
    expressions: ['$10 to EUR', '10 € to USD', '£ 15 to TRY'],
    expected: ['€8.8496', '$11.30', '₺640.00']
  },
  {
    name: 'Line Labels (Prefix with Colon)',
    expressions: ['rent: 1200', 'food: 300', 'total'],
    expected: ['1200', '300', '1500']
  },
  {
    name: 'Semicolon Argument Separator (inputLocale enabled)',
    settings: {
      inputLocale: true,
      thouSep: 'comma'
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
    name: 'Locale Separators (Turkish / Comma decimal)',
    settings: {
      inputLocale: true,
      thouSep: 'comma'
    },
    expressions: ['1.234.567,89 + 0,11', '1234,5 * 2'],
    expected: ['1234568', '2469']
  },
  {
    name: 'Locale Separators (US / Period decimal)',
    settings: {
      inputLocale: true,
      thouSep: 'period'
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
  }
]
