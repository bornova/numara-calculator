export const MIN_WINDOW_WIDTH = 480
export const MIN_WINDOW_HEIGHT = 420
const MIN_VISIBLE_OVERLAP = 100

/**
 * Checks whether a coordinate is a finite number and not an OS minimized sentinel (e.g. -32000 on Windows).
 * @param {unknown} value Coordinate value to validate.
 * @returns {boolean}
 */
function isValidCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > -25000
}

/**
 * Checks whether two rectangles have identical position and dimensions.
 * @param {{x: number, y: number, width: number, height: number}|null|undefined} a First rectangle.
 * @param {{x: number, y: number, width: number, height: number}|null|undefined} b Second rectangle.
 * @returns {boolean}
 */
export function areBoundsEqual(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
}

/**
 * Computes the overlapping dimensions and area between two rectangles.
 * @param {{x: number, y: number, width: number, height: number}} a First rectangle.
 * @param {{x: number, y: number, width: number, height: number}} b Second rectangle.
 * @returns {{width: number, height: number, area: number}}
 */
function getIntersection(a, b) {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)

  return { width, height, area: width * height }
}

/**
 * Finds the connected display whose `workArea` has the largest meaningful overlap with `bounds`.
 * @param {{x: number, y: number, width: number, height: number}} bounds Window rectangle.
 * @param {Array<{workArea: {x: number, y: number, width: number, height: number}}>} displays Connected displays.
 * @param {number} [minVisible=MIN_VISIBLE_OVERLAP] Minimum required overlap in both axes (px).
 * @returns {{workArea: {x: number, y: number, width: number, height: number}}|null}
 */
function findMatchingDisplay(bounds, displays = [], minVisible = MIN_VISIBLE_OVERLAP) {
  if (!Array.isArray(displays) || displays.length === 0) return null

  let bestDisplay = null
  let bestArea = 0

  for (const display of displays) {
    const workArea = display?.workArea

    if (!workArea || workArea.width <= 0 || workArea.height <= 0) continue

    const { width, height, area } = getIntersection(bounds, workArea)
    const reqWidth = Math.min(minVisible, workArea.width)
    const reqHeight = Math.min(minVisible, workArea.height)

    if (width >= reqWidth && height >= reqHeight && area > bestArea) {
      bestArea = area
      bestDisplay = display
    }
  }

  return bestDisplay
}

/**
 * Checks whether a window rectangle has meaningful visibility on at least one connected display.
 * @param {{x: number, y: number, width: number, height: number}|null|undefined} bounds Window rectangle.
 * @param {Array<{workArea: {x: number, y: number, width: number, height: number}}>} displays Connected displays.
 * @param {number} [minVisible=MIN_VISIBLE_OVERLAP] Minimum required overlap in both axes (px).
 * @returns {boolean}
 */
export function isBoundsOnScreen(bounds, displays = [], minVisible = MIN_VISIBLE_OVERLAP) {
  if (
    !bounds ||
    !isValidCoordinate(bounds.x) ||
    !isValidCoordinate(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return false
  }

  return Boolean(findMatchingDisplay(bounds, displays, minVisible))
}

/**
 * Clamps a window rectangle so its dimensions and position fit within a display's `workArea`.
 * @param {{x: number, y: number, width: number, height: number}} bounds Candidate window rectangle.
 * @param {{x: number, y: number, width: number, height: number}} workArea Target display work area.
 * @param {number} [minWidth=MIN_WINDOW_WIDTH] Minimum window width.
 * @param {number} [minHeight=MIN_WINDOW_HEIGHT] Minimum window height.
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function clampBoundsToWorkArea(bounds, workArea, minWidth = MIN_WINDOW_WIDTH, minHeight = MIN_WINDOW_HEIGHT) {
  const width = Math.round(Math.min(Math.max(bounds.width, minWidth), Math.max(minWidth, workArea.width)))
  const height = Math.round(Math.min(Math.max(bounds.height, minHeight), Math.max(minHeight, workArea.height)))
  const x = Math.round(Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width))) || 0
  const y = Math.round(Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height))) || 0

  return { x, y, width, height }
}

/**
 * Centers window dimensions within a display's `workArea`, clamping size to fit.
 * @param {{width: number, height: number}} size Desired window dimensions.
 * @param {{x: number, y: number, width: number, height: number}} workArea Target display work area.
 * @param {number} [minWidth=MIN_WINDOW_WIDTH] Minimum window width.
 * @param {number} [minHeight=MIN_WINDOW_HEIGHT] Minimum window height.
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function centerBoundsOnWorkArea(size, workArea, minWidth = MIN_WINDOW_WIDTH, minHeight = MIN_WINDOW_HEIGHT) {
  const width = Math.round(Math.min(Math.max(size.width, minWidth), Math.max(minWidth, workArea.width)))
  const height = Math.round(Math.min(Math.max(size.height, minHeight), Math.max(minHeight, workArea.height)))
  const x = Math.round(Math.max(workArea.x, workArea.x + (workArea.width - width) / 2)) || 0
  const y = Math.round(Math.max(workArea.y, workArea.y + (workArea.height - height) / 2)) || 0

  return { x, y, width, height }
}

/**
 * Resolves valid on-screen window bounds from saved preferences or live window bounds.
 * Clamps onto the best-matching connected display when meaningfully visible, or centers on the primary display.
 * @param {object} [saved] Saved or current bounds (`{ x, y, width, height }` or `{ position: [x, y], width, height }`).
 * @param {Array<{workArea: {x: number, y: number, width: number, height: number}}>} [displays] Connected displays.
 * @param {{workArea: {x: number, y: number, width: number, height: number}}|null} [primaryDisplay] Primary display.
 * @param {object} [options] Dimension and overlap defaults.
 * @returns {{x?: number, y?: number, width: number, height: number}}
 */
export function resolveWindowBounds(
  saved = {},
  displays = [],
  primaryDisplay = null,
  {
    defaultWidth = 600,
    defaultHeight = 515,
    minWidth = MIN_WINDOW_WIDTH,
    minHeight = MIN_WINDOW_HEIGHT,
    minVisible = MIN_VISIBLE_OVERLAP
  } = {}
) {
  const rawWidth = Number(saved?.width)
  const rawHeight = Number(saved?.height)
  const width = Math.round(Math.max(minWidth, Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : defaultWidth))
  const height = Math.round(
    Math.max(minHeight, Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : defaultHeight)
  )

  const hasPosArray = Array.isArray(saved?.position)
  const rawX = hasPosArray ? saved.position[0] : saved?.x
  const rawY = hasPosArray ? saved.position[1] : saved?.y
  const hasValidPos =
    (!hasPosArray || saved.position.length === 2) && isValidCoordinate(rawX) && isValidCoordinate(rawY)

  const validDisplays = Array.isArray(displays)
    ? displays.filter((d) => d?.workArea && d.workArea.width > 0 && d.workArea.height > 0)
    : []
  const fallbackWorkArea =
    primaryDisplay?.workArea && primaryDisplay.workArea.width > 0 && primaryDisplay.workArea.height > 0
      ? primaryDisplay.workArea
      : validDisplays[0]?.workArea || null

  if (hasValidPos) {
    const candidate = { x: Math.round(rawX) || 0, y: Math.round(rawY) || 0, width, height }

    if (!fallbackWorkArea && validDisplays.length === 0) {
      return candidate
    }

    const matchedDisplay = findMatchingDisplay(candidate, validDisplays, minVisible)

    if (matchedDisplay) {
      return clampBoundsToWorkArea(candidate, matchedDisplay.workArea, minWidth, minHeight)
    }
  }

  if (fallbackWorkArea) {
    return centerBoundsOnWorkArea({ width, height }, fallbackWorkArea, minWidth, minHeight)
  }

  return { width, height }
}
