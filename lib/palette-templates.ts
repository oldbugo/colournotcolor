import atlassianPalette from "@/documents/atlassian-design-system-palette.json"
import type { ColorSwatch } from "@/types/palette"

export type PaletteTemplateColor = Pick<ColorSwatch, "hex" | "name" | "group">

export type PaletteTemplate = {
  id: string
  name: string
  source: string
  colors: PaletteTemplateColor[]
}

const templateColor = (hex: string, name: string, group: string | null = null): PaletteTemplateColor => ({
  hex,
  name,
  group,
})

const normalizeTemplateColors = (
  colors: Array<{ hex: string; name?: string; group?: string | null }>,
): PaletteTemplateColor[] =>
  colors.map((color) => templateColor(color.hex, color.name ?? "", color.group ?? null))

export const PALETTE_TEMPLATES: PaletteTemplate[] = [
  {
    id: "atlassian-design-system",
    name: "Atlassian Design System",
    source: "Atlassian",
    colors: normalizeTemplateColors(atlassianPalette.colors),
  },
  {
    id: "material-design-core",
    name: "Material Design Core",
    source: "Google",
    colors: [
      templateColor("#F44336", "Red", "Material"),
      templateColor("#E91E63", "Pink", "Material"),
      templateColor("#9C27B0", "Purple", "Material"),
      templateColor("#673AB7", "Deep Purple", "Material"),
      templateColor("#3F51B5", "Indigo", "Material"),
      templateColor("#2196F3", "Blue", "Material"),
      templateColor("#03A9F4", "Light Blue", "Material"),
      templateColor("#00BCD4", "Cyan", "Material"),
      templateColor("#009688", "Teal", "Material"),
      templateColor("#4CAF50", "Green", "Material"),
      templateColor("#8BC34A", "Light Green", "Material"),
      templateColor("#CDDC39", "Lime", "Material"),
      templateColor("#FFEB3B", "Yellow", "Material"),
      templateColor("#FFC107", "Amber", "Material"),
      templateColor("#FF9800", "Orange", "Material"),
      templateColor("#FF5722", "Deep Orange", "Material"),
      templateColor("#795548", "Brown", "Material"),
      templateColor("#9E9E9E", "Grey", "Material"),
      templateColor("#607D8B", "Blue Grey", "Material"),
    ],
  },
  {
    id: "ibm-carbon-core",
    name: "IBM Carbon Core",
    source: "IBM",
    colors: [
      templateColor("#0F62FE", "Blue 60", "Carbon"),
      templateColor("#1192E8", "Cyan 50", "Carbon"),
      templateColor("#009D9A", "Teal 50", "Carbon"),
      templateColor("#24A148", "Green 50", "Carbon"),
      templateColor("#F1C21B", "Yellow 30", "Carbon"),
      templateColor("#FF832B", "Orange 40", "Carbon"),
      templateColor("#DA1E28", "Red 60", "Carbon"),
      templateColor("#EE5396", "Magenta 50", "Carbon"),
      templateColor("#8A3FFC", "Purple 60", "Carbon"),
      templateColor("#525252", "Gray 70", "Carbon"),
      templateColor("#4D5358", "Cool Gray 70", "Carbon"),
      templateColor("#565151", "Warm Gray 70", "Carbon"),
    ],
  },
  {
    id: "github-primer-core",
    name: "GitHub Primer Core",
    source: "GitHub",
    colors: [
      templateColor("#24292F", "Foreground", "Primer Neutral"),
      templateColor("#57606A", "Muted", "Primer Neutral"),
      templateColor("#FFFFFF", "Canvas", "Primer Neutral"),
      templateColor("#0969DA", "Blue", "Primer Accent"),
      templateColor("#1A7F37", "Green", "Primer Accent"),
      templateColor("#9A6700", "Yellow", "Primer Accent"),
      templateColor("#BC4C00", "Orange", "Primer Accent"),
      templateColor("#CF222E", "Red", "Primer Accent"),
      templateColor("#8250DF", "Purple", "Primer Accent"),
      templateColor("#BF3989", "Pink", "Primer Accent"),
      templateColor("#C4432B", "Coral", "Primer Accent"),
    ],
  },
  {
    id: "tailwind-500-scale",
    name: "Tailwind 500 Scale",
    source: "Tailwind",
    colors: [
      templateColor("#64748B", "Slate 500", "Tailwind Neutral"),
      templateColor("#6B7280", "Gray 500", "Tailwind Neutral"),
      templateColor("#71717A", "Zinc 500", "Tailwind Neutral"),
      templateColor("#737373", "Neutral 500", "Tailwind Neutral"),
      templateColor("#78716C", "Stone 500", "Tailwind Neutral"),
      templateColor("#EF4444", "Red 500", "Tailwind Accent"),
      templateColor("#F97316", "Orange 500", "Tailwind Accent"),
      templateColor("#F59E0B", "Amber 500", "Tailwind Accent"),
      templateColor("#EAB308", "Yellow 500", "Tailwind Accent"),
      templateColor("#84CC16", "Lime 500", "Tailwind Accent"),
      templateColor("#22C55E", "Green 500", "Tailwind Accent"),
      templateColor("#10B981", "Emerald 500", "Tailwind Accent"),
      templateColor("#14B8A6", "Teal 500", "Tailwind Accent"),
      templateColor("#06B6D4", "Cyan 500", "Tailwind Accent"),
      templateColor("#0EA5E9", "Sky 500", "Tailwind Accent"),
      templateColor("#3B82F6", "Blue 500", "Tailwind Accent"),
      templateColor("#6366F1", "Indigo 500", "Tailwind Accent"),
      templateColor("#8B5CF6", "Violet 500", "Tailwind Accent"),
      templateColor("#A855F7", "Purple 500", "Tailwind Accent"),
      templateColor("#D946EF", "Fuchsia 500", "Tailwind Accent"),
      templateColor("#EC4899", "Pink 500", "Tailwind Accent"),
      templateColor("#F43F5E", "Rose 500", "Tailwind Accent"),
    ],
  },
  {
    id: "ant-design-seed",
    name: "Ant Design Seed",
    source: "Ant Design",
    colors: [
      templateColor("#1677FF", "Blue", "Ant Design"),
      templateColor("#722ED1", "Purple", "Ant Design"),
      templateColor("#13C2C2", "Cyan", "Ant Design"),
      templateColor("#52C41A", "Green", "Ant Design"),
      templateColor("#EB2F96", "Magenta", "Ant Design"),
      templateColor("#F5222D", "Red", "Ant Design"),
      templateColor("#FA8C16", "Orange", "Ant Design"),
      templateColor("#FADB14", "Yellow", "Ant Design"),
      templateColor("#FA541C", "Volcano", "Ant Design"),
      templateColor("#2F54EB", "Geek Blue", "Ant Design"),
      templateColor("#A0D911", "Lime", "Ant Design"),
      templateColor("#FAAD14", "Gold", "Ant Design"),
      templateColor("#8C8C8C", "Gray", "Ant Design"),
    ],
  },
  {
    id: "fluent-2-core",
    name: "Fluent 2 Core",
    source: "Microsoft",
    colors: [
      templateColor("#0F6CBD", "Brand", "Fluent Brand"),
      templateColor("#115EA3", "Brand Hover", "Fluent Brand"),
      templateColor("#0E4775", "Brand Pressed", "Fluent Brand"),
      templateColor("#2899F5", "Brand Selected", "Fluent Brand"),
      templateColor("#0E700E", "Success", "Fluent Status"),
      templateColor("#BC4B09", "Warning", "Fluent Status"),
      templateColor("#D13438", "Danger", "Fluent Status"),
      templateColor("#5C2E91", "Accent", "Fluent Status"),
      templateColor("#242424", "Neutral Foreground", "Fluent Neutral"),
      templateColor("#616161", "Neutral Secondary", "Fluent Neutral"),
      templateColor("#D1D1D1", "Neutral Stroke", "Fluent Neutral"),
      templateColor("#F5F5F5", "Neutral Background", "Fluent Neutral"),
    ],
  },
]
