import { dom } from './dom'

import {
  createElement,
  createIcons,
  AlertCircle,
  ArrowUpDown,
  Braces,
  BrushCleaning,
  ChartSpline,
  Circle,
  Copy,
  CornerDownRight,
  Dot,
  Download,
  EllipsisVertical,
  Info,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Scaling,
  Settings,
  Trash,
  Upload
} from 'lucide'

const icons = {
  AlertCircle,
  ArrowUpDown,
  Braces,
  BrushCleaning,
  ChartSpline,
  Circle,
  Copy,
  CornerDownRight,
  Dot,
  Download,
  EllipsisVertical,
  Info,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Scaling,
  Settings,
  Trash,
  Upload
}

/**
 * Cache app icons in dom object.
 */
function cacheIcons() {
  Object.entries(icons).forEach(([name, icon]) => {
    dom.icons[name] = createElement(icon).outerHTML
  })
}

/**
 * Generate app icons.
 */
export const generateIcons = () => {
  createIcons({ icons })
  cacheIcons()
}
