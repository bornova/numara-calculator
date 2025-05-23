import {
  createIcons,
  AlertCircle,
  ArrowUpDown,
  Braces,
  Circle,
  Copy,
  CornerDownRight,
  Dot,
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
  Upload
} from 'lucide'

const icons = {
  AlertCircle,
  ArrowUpDown,
  Braces,
  Circle,
  Copy,
  CornerDownRight,
  Dot,
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
  Upload
}

/**
 * Generate app icons.
 */
export const generateIcons = () => {
  createIcons({ icons })
}
