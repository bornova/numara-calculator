import {
  createIcons,
  AlertCircle,
  Braces,
  Circle,
  Copy,
  CornerDownRight,
  Eraser,
  FileInput,
  FileOutput,
  Folder,
  Info,
  Printer,
  Save,
  Settings,
  Trash,
  Undo2,
  X
} from 'lucide'

const iconList = {
  AlertCircle,
  Braces,
  Circle,
  Copy,
  CornerDownRight,
  Eraser,
  FileInput,
  FileOutput,
  Folder,
  Info,
  Printer,
  Save,
  Settings,
  Trash,
  Undo2,
  X
}

/** Generate app icons. */
export const generateIcons = () => {
  createIcons({ icons: iconList })
}
