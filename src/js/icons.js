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
  Printer,
  Save,
  Scaling,
  Settings,
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
  Printer,
  Save,
  Scaling,
  Settings,
  Trash,
  UndoDot,
  X
}

/** Generate app icons. */
export const generateIcons = () => {
  createIcons({ icons: iconList })
}
