import { dom } from '../dom'

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
  Download,
  EllipsisVertical,
  Eraser,
  Info,
  ListRestart,
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
  Monitor,
  Sun,
  Moon
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
  Download,
  EllipsisVertical,
  Eraser,
  Info,
  ListRestart,
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
  Monitor,
  Sun,
  Moon
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
