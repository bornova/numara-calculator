import {
  createIcons,
  AlertCircle,
  Braces,
  Circle,
  Copy,
  CornerDownRight,
  Dot,
  Eraser,
  FileInput,
  FileOutput,
  Folder,
  Info,
  ListRestart,
  PanelLeft,
  PanelLeftClose,
  PlusSquare,
  Printer,
  Save,
  Scaling,
  Settings,
  TextCursorInput,
  Trash,
  UndoDot,
  X
} from 'lucide'

const iconList = {
  AlertCircle,
  Braces,
  Circle,
  Copy,
  CornerDownRight,
  Dot,
  Eraser,
  FileInput,
  FileOutput,
  Folder,
  Info,
  ListRestart,
  PanelLeft,
  PanelLeftClose,
  PlusSquare,
  Printer,
  Save,
  Scaling,
  Settings,
  TextCursorInput,
  Trash,
  UndoDot,
  X
}

/** Generate app icons. */
export const generateIcons = () => {
  createIcons({ icons: iconList })
}
