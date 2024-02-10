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
  Printer,
  Save,
  Settings,
  Trash,
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
  Printer,
  Save,
  Settings,
  Trash,
  X
}

/** Generate app icons. */
export const generateIcons = () => {
  createIcons({ icons: iconList })
}
