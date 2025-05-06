import {
  createIcons,
  AlertCircle,
  ArrowUpDown,
  Braces,
  BrushCleaning,
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
 * Generate app icons.
 */
export const generateIcons = () => {
  createIcons({ icons })
}
