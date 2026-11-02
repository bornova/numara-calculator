import { docs } from 'mathjs'

/**
 * Fixed width integer reinterpretation (C style casts) for a math.js instance.
 *
 * Provides two's complement wrap-around with an arbitrary bit width, which is
 * what hashes, checksums, protocol fields, colour channels and embedded style
 * arithmetic expect: truncation toward zero, then wrap at a fixed width.
 *
 * Results stay plain numbers while they fit in the safe integer range. Wider
 * results are returned exactly: as BigNumber when the numeric output setting is
 * "BigNumber", otherwise as BigInt.
 */

const SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_BITS = 1
const MAX_BITS = 1024
const DEFAULT_BITS = 32
const DEFAULT_FORMAT = 'dec'

const NOTATION_BASES = { bin: 2, oct: 8, hex: 16 }
const NOTATION_PREFIXES = { bin: '0b', oct: '0o', hex: '0x' }
const NOTATION_DIGITS = { bin: (bits) => bits, oct: (bits) => Math.ceil(bits / 3), hex: (bits) => Math.ceil(bits / 4) }
const OUTPUT_FORMATS = ['dec', 'hex', 'bin', 'oct']
const SHORTCUT_WIDTHS = [8, 16, 32, 64]

/**
 * Validate a bit width argument and normalize it to a number.
 * @param {*} bits Requested width.
 * @returns {number} The validated width.
 */
function resolveBits(bits) {
  const width = typeof bits === 'number' ? bits : Number(bits)

  if (!Number.isInteger(width) || width < MIN_BITS || width > MAX_BITS) {
    throw new RangeError(`Invalid bit width: ${bits}. Expected an integer between ${MIN_BITS} and ${MAX_BITS}.`)
  }

  return width
}

/**
 * Validate an output format name. Matching is case insensitive, so "Dec", "HEX"
 * and "bin" are all accepted.
 * @param {*} format Requested format.
 * @returns {'dec'|'hex'|'bin'|'oct'} Normalized format name.
 */
function resolveFormat(format) {
  if (format === undefined || format === null) return DEFAULT_FORMAT

  const name = String(format).trim().toLowerCase()

  if (!OUTPUT_FORMATS.includes(name)) {
    throw new Error(`Unknown format "${format}". Choose "dec", "hex", "bin" or "oct".`)
  }

  return name
}

/**
 * Allow the format to be passed as the second argument when the bit width is
 * omitted, so toUnsigned(x, "hex") equals toUnsigned(x, 32, "hex"). Anything
 * that is not a known format name is still read as a bit width.
 * @param {*} bits Bit width, or a format name when the width is omitted.
 * @param {*} format Output format.
 * @returns {{bits: *, format: *}} Normalized arguments.
 */
function resolveCastArgs(bits, format) {
  if (typeof bits !== 'string') return { bits, format }

  if (!OUTPUT_FORMATS.includes(bits.trim().toLowerCase())) return { bits, format }

  return { bits: DEFAULT_BITS, format: bits }
}

/**
 * Convert a math.js value to an exact BigInt, truncating toward zero the way a
 * C cast does.
 * @param {object} math The math.js instance.
 * @param {*} value Value to convert.
 * @returns {bigint} Truncated integer value.
 */
function toBigInt(math, value) {
  const type = math.typeOf(value)

  if (type === 'bigint') return value

  if (type === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Cannot cast a non finite value: ${value}`)

    return BigInt(Math.trunc(value))
  }

  if (type === 'BigNumber') return BigInt(value.toFixed(0))

  if (type === 'Fraction') {
    // mathjs Fraction stores a sign and positive numerator/denominator.
    const numerator = BigInt(value.n)
    const denominator = BigInt(value.d)
    const magnitude = numerator / denominator

    return (value.s ?? 1) < 0 ? -magnitude : magnitude
  }

  if (type === 'string') {
    const trimmed = value.trim().replace(/^\+/, '')

    try {
      return BigInt(trimmed)
    } catch {
      const numeric = Number(trimmed)

      if (!Number.isFinite(numeric)) throw new RangeError(`Cannot cast an invalid number: "${value}"`)

      return BigInt(Math.trunc(numeric))
    }
  }

  if (type === 'Unit') throw new TypeError('Cannot cast a unit to an integer')

  const numeric = Number(value)

  if (!Number.isFinite(numeric)) throw new TypeError(`Cannot cast ${type} to an integer`)

  return BigInt(Math.trunc(numeric))
}

/**
 * Choose the result type so exactness is kept only when it is actually needed.
 * @param {object} math The math.js instance.
 * @param {bigint} value Cast result.
 * @returns {number|bigint|object} Number, BigInt or BigNumber.
 */
function toResult(math, value) {
  if (value >= -SAFE_INTEGER && value <= SAFE_INTEGER) return Number(value)

  return math.config().number === 'BigNumber' ? math.bignumber(value.toString()) : value
}

/**
 * Reinterpret a value at a fixed width using two's complement semantics.
 * @param {object} math The math.js instance.
 * @param {*} value Value to reinterpret.
 * @param {*} bits Bit width.
 * @param {boolean} signed True for a signed interpretation.
 * @returns {number|bigint|object} Reinterpreted value.
 */
function reinterpret(math, value, bits, signed) {
  const width = resolveBits(bits)
  const modulus = 1n << BigInt(width)
  const raw = toBigInt(math, value)
  const wrapped = ((raw % modulus) + modulus) % modulus
  const signedValue = signed && wrapped >= modulus >> 1n ? wrapped - modulus : wrapped

  return toResult(math, signedValue)
}

/**
 * Unsigned width of a value, used by the formatters.
 * @param {object} math The math.js instance.
 * @param {*} value Value to wrap.
 * @param {number} bits Bit width.
 * @returns {bigint} Unsigned value.
 */
function toUnsignedBigInt(math, value, bits) {
  const modulus = 1n << BigInt(bits)
  const raw = toBigInt(math, value)

  return ((raw % modulus) + modulus) % modulus
}

/**
 * Render a value as a zero padded, width aware string in the given base.
 * @param {object} math The math.js instance.
 * @param {*} value Value to format.
 * @param {*} bits Bit width.
 * @param {'bin'|'oct'|'hex'} notation Target notation.
 * @returns {string} Formatted string with prefix.
 */
function formatFixedWidth(math, value, bits, notation) {
  const width = resolveBits(bits)
  const base = NOTATION_BASES[notation]
  const digits = toUnsignedBigInt(math, value, width).toString(base).padStart(NOTATION_DIGITS[notation](width), '0')

  return NOTATION_PREFIXES[notation] + (notation === 'hex' ? digits.toUpperCase() : digits)
}

/**
 * Reinterpret a value at a fixed width and render it in the requested format.
 * @param {object} math The math.js instance.
 * @param {*} value Value to reinterpret.
 * @param {*} bits Bit width, or a format name when the width is omitted.
 * @param {*} format Output format: "dec" (default), "hex", "bin" or "oct".
 * @param {boolean} signed True for a signed interpretation.
 * @returns {number|bigint|object|string} Number, BigNumber or BigInt for "dec", a string otherwise.
 */
function castInteger(math, value, bits, format, signed) {
  const args = resolveCastArgs(bits, format)
  const notation = resolveFormat(args.format)

  if (notation === 'dec') return reinterpret(math, value, args.bits, signed)

  // Bases 2, 8 and 16 always render the raw width-bit pattern, so a signed
  // result and its unsigned bit pattern print the same way (like C's %x).
  return formatFixedWidth(math, value, args.bits, notation)
}

/**
 * Build the integer casting functions for a math.js instance.
 * @param {object} math The math.js instance to bind to.
 * @returns {object} Functions ready to be imported into the instance.
 */
export function createIntegerCastFunctions(math) {
  const toUnsigned = (value, bits = DEFAULT_BITS, format = DEFAULT_FORMAT) =>
    castInteger(math, value, bits, format, false)
  const toSigned = (value, bits = DEFAULT_BITS, format = DEFAULT_FORMAT) => castInteger(math, value, bits, format, true)
  const toHex = (value, bits = DEFAULT_BITS) => formatFixedWidth(math, value, bits, 'hex')
  const toBin = (value, bits = DEFAULT_BITS) => formatFixedWidth(math, value, bits, 'bin')
  const toOct = (value, bits = DEFAULT_BITS) => formatFixedWidth(math, value, bits, 'oct')

  const shortcuts = {}

  for (const width of SHORTCUT_WIDTHS) {
    shortcuts[`u${width}`] = (value, format = DEFAULT_FORMAT) => toUnsigned(value, width, format)
    shortcuts[`s${width}`] = (value, format = DEFAULT_FORMAT) => toSigned(value, width, format)
  }

  return { toUnsigned, toSigned, toHex, toBin, toOct, ...shortcuts }
}

const INTEGER_CAST_DOCS = {
  toUnsigned: {
    name: 'toUnsigned',
    category: 'Integer',
    syntax: ['toUnsigned(x, bits = 32, format = "dec")'],
    description:
      'Reinterpret a value as an unsigned integer of the given bit width, like the C cast (uintN_t)x. ' +
      'Fractions truncate toward zero, then wrap at the width. Widths 8, 16, 32 and 64 have ' +
      'u8/u16/u32/u64 shortcuts. The optional output format is "dec" (default), "hex", "bin" or "oct"; ' +
      'the non decimal formats show the zero padded bit pattern. When bits is omitted the format may be ' +
      'passed as the second argument.',
    examples: [
      'toUnsigned(-1)',
      'toUnsigned(-2.5, 8)',
      'toUnsigned(-1, 64)',
      'toUnsigned(-1, 32, "hex")',
      'toUnsigned(-1, 8, "bin")',
      'toUnsigned(-1, "hex")'
    ],
    seealso: ['toSigned', 'toHex', 'toBin', 'hex', 'bin']
  },
  toSigned: {
    name: 'toSigned',
    category: 'Integer',
    syntax: ['toSigned(x, bits = 32, format = "dec")'],
    description:
      'Reinterpret a value as a two\u2019s complement signed integer of the given bit width, like the ' +
      'C cast (intN_t)x. Widths 8, 16, 32 and 64 have s8/s16/s32/s64 shortcuts. The optional output ' +
      'format is "dec" (default), "hex", "bin" or "oct"; the non decimal formats always show the ' +
      'two\u2019s complement bit pattern, so toSigned(-1, 32, "hex") is 0xFFFFFFFF.',
    examples: ['toSigned(4294967295, 32)', 'toSigned(toUnsigned(-1, 64), 64)', 'toSigned(-1, 16, "hex")'],
    seealso: ['toUnsigned', 'toHex', 'hex']
  },
  toHex: {
    name: 'toHex',
    category: 'Integer',
    syntax: ['toHex(x, bits = 32)'],
    description: 'Format a value as a zero padded hexadecimal string spanning the given bit width.',
    examples: ['toHex(-1, 16)', 'toHex(255)'],
    seealso: ['toUnsigned', 'toSigned', 'hex']
  },
  toBin: {
    name: 'toBin',
    category: 'Integer',
    syntax: ['toBin(x, bits = 32)'],
    description: 'Format a value as a zero padded binary string spanning the given bit width.',
    examples: ['toBin(-1, 8)', 'toBin(5)'],
    seealso: ['toUnsigned', 'toSigned', 'bin']
  },
  toOct: {
    name: 'toOct',
    category: 'Integer',
    syntax: ['toOct(x, bits = 32)'],
    description: 'Format a value as a zero padded octal string spanning the given bit width.',
    examples: ['toOct(-1, 16)'],
    seealso: ['toUnsigned', 'toSigned', 'oct']
  },
  ...createShortcutDocs()
}

/**
 * Build help entries for the u8/s8 style shortcuts so the editor can describe
 * them as well as the functions they wrap.
 * @returns {object} Documentation entries keyed by function name.
 */
function createShortcutDocs() {
  const shortcutDocs = {}

  for (const bits of SHORTCUT_WIDTHS) {
    shortcutDocs[`u${bits}`] = {
      name: `u${bits}`,
      category: 'Integer',
      syntax: [`u${bits}(x, format = "dec")`],
      description:
        `Shortcut for toUnsigned(x, ${bits}): reinterpret a value as an unsigned ${bits} bit integer. ` +
        'The optional output format is "dec" (default), "hex", "bin" or "oct".',
      examples: [`u${bits}(-1)`, `u${bits}(-1, "hex")`],
      seealso: ['toUnsigned', 'toSigned']
    }
    shortcutDocs[`s${bits}`] = {
      name: `s${bits}`,
      category: 'Integer',
      syntax: [`s${bits}(x, format = "dec")`],
      description:
        `Shortcut for toSigned(x, ${bits}): reinterpret a value as a ${bits} bit two\u2019s complement ` +
        'signed integer. The optional output format is "dec" (default), "hex", "bin" or "oct".',
      examples: [`s${bits}(255)`, `s${bits}(255, "bin")`],
      seealso: ['toUnsigned', 'toSigned']
    }
  }

  return shortcutDocs
}

/**
 * Register help entries for the integer casting functions so math.help, editor
 * tooltips and the generated wiki can describe them.
 * @returns {void}
 */
export function registerIntegerCastDocs() {
  Object.assign(docs, INTEGER_CAST_DOCS)
}
