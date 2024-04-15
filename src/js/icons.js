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
  PanelLeft,
  PanelLeftClose,
  Plus,
  Scaling,
  Settings,
  Trash,
  UndoDot,
  Upload
} from 'lucide'

const iconList = {
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
  PanelLeft,
  PanelLeftClose,
  Plus,
  Scaling,
  Settings,
  Trash,
  UndoDot,
  Upload
}

/** Generate app icons. */
export const generateIcons = () => {
  createIcons({ icons: iconList })
}
