import {
  createIcons,
  AlertCircle,
  Braces,
  ChevronDown,
  ChevronLeft,
  Circle,
  Copy,
  CornerDownRight,
  Dot,
  Download,
  Eraser,
  Info,
  ListRestart,
  PanelLeft,
  Plus,
  Scaling,
  Settings,
  TextCursorInput,
  UndoDot,
  Upload,
  X
} from 'lucide'

const iconList = {
  AlertCircle,
  Braces,
  ChevronDown,
  ChevronLeft,
  Circle,
  Copy,
  CornerDownRight,
  Dot,
  Download,
  Eraser,
  Info,
  ListRestart,
  PanelLeft,
  Plus,
  Scaling,
  Settings,
  TextCursorInput,
  UndoDot,
  Upload,
  X
}

/** Generate app icons. */
export const generateIcons = () => {
  createIcons({ icons: iconList })
}
