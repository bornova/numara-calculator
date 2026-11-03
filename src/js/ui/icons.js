import {
  AlertCircle,
  ArrowUpDown,
  Braces,
  BrushCleaning,
  Circle,
  Copy,
  CopyPlus,
  CornerDownRight,
  createElement,
  createIcons,
  Dot,
  Download,
  Eraser,
  Info,
  ListRestart,
  Menu,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Scaling,
  Settings,
  Sun,
  Trash2,
  Upload,
  X
} from 'lucide'

import { dom } from '../dom.js'

const icons = {
  AlertCircle,
  ArrowUpDown,
  Braces,
  BrushCleaning,
  Circle,
  Copy,
  CopyPlus,
  CornerDownRight,
  Dot,
  Download,
  Eraser,
  Info,
  ListRestart,
  Menu,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Scaling,
  Settings,
  Sun,
  Trash2,
  Upload,
  X
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
