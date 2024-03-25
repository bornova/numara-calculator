import {
  createIcons,
  AlertCircle,
  Braces,
  ChevronLeft,
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
  Plus,
  Scaling,
  Settings,
  UndoDot,
  Upload
} from 'lucide'

const iconList = {
  AlertCircle,
  Braces,
  ChevronLeft,
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
  Plus,
  Scaling,
  Settings,
  UndoDot,
  Upload
}

/** Generate app icons. */
export const generateIcons = () => {
  createIcons({ icons: iconList })
}
