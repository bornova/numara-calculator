import {
  AlertCircle,
  ArrowUpDown,
  Braces,
  BrushCleaning,
  ChartSpline,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Copy,
  CopyPlus,
  CornerDownRight,
  createElement,
  createIcons,
  Dot,
  Download,
  EllipsisVertical,
  Eraser,
  Info,
  ListRestart,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SquareDimensions,
  Sun,
  Trash2,
  Upload,
  X
} from 'lucide'
import UIkit from 'uikit'

import { dom } from '../dom.js'

const icons = {
  AlertCircle,
  ArrowUpDown,
  Braces,
  BrushCleaning,
  ChartSpline,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Copy,
  CopyPlus,
  CornerDownRight,
  Dot,
  Download,
  EllipsisVertical,
  Eraser,
  Info,
  ListRestart,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SquareDimensions,
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
  UIkit.icon.add('close-icon', dom.icons.X)
}
