import {
  AlertCircle,
  ArrowUpDown,
  Braces,
  BrushCleaning,
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
  Ellipsis,
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
  Ellipsis,
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

const iconCache = {}

dom.icons = new Proxy(iconCache, {
  get(target, prop) {
    if (typeof prop === 'string' && !(prop in target) && prop in icons) {
      target[prop] = createElement(icons[prop]).outerHTML
    }

    return target[prop]
  }
})

/**
 * Generate app icons.
 */
export const generateIcons = () => {
  createIcons({ icons })
  UIkit.icon.add('close-icon', dom.icons.X)
}
