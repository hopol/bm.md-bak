// 暗色转换思路参考微信官方 mp-darkmode：
// https://github.com/wechatjs/mp-darkmode
// 这里仅复刻浏览器预览需要的颜色亮度/对比度调整，不直接依赖其 DOM class 注入实现。
interface RgbColor {
  r: number
  g: number
  b: number
  a: number
}

interface HslColor {
  h: number
  s: number
  l: number
}

const DEFAULT_DARK_BACKGROUND: RgbColor = { r: 17, g: 17, b: 17, a: 1 }
const DEFAULT_DARK_TEXT: RgbColor = { r: 225, g: 225, b: 225, a: 1 }

const BACKGROUND_PROPERTIES = [
  'background-color',
]

const FOREGROUND_PROPERTIES = [
  'color',
  'text-decoration-color',
  'text-emphasis-color',
  'caret-color',
  'fill',
  'stroke',
]

const LINE_PROPERTIES = [
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'column-rule-color',
  'accent-color',
]

const SHADOW_PROPERTIES = [
  'box-shadow',
  'text-shadow',
]

const COMPLEX_BACKGROUND_PROPERTIES = [
  'background',
  'background-image',
]

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  gray: '#808080',
  green: '#008000',
  grey: '#808080',
  magenta: '#ff00ff',
  red: '#ff0000',
  white: '#ffffff',
  yellow: '#ffff00',
}

const COLOR_TOKEN_RE = /#[\da-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/gi

export function applyDarkModeToPreviewHtml(html: string): string {
  if (!html.trim() || typeof document === 'undefined') {
    return html
  }

  const template = document.createElement('template')
  template.innerHTML = html

  for (const child of Array.from(template.content.children)) {
    transformElement(child, DEFAULT_DARK_BACKGROUND)
  }

  return template.innerHTML
}

function transformElement(element: Element, inheritedBackground: RgbColor): RgbColor {
  if (element.hasAttribute('data-no-dark')) {
    return inheritedBackground
  }

  const style = (element as HTMLElement).style
  let currentBackground = inheritedBackground

  if (element.id === 'bm-md' && !hasVisibleColor(style, 'background-color')) {
    style.setProperty('background-color', serializeColor(DEFAULT_DARK_BACKGROUND))
    currentBackground = DEFAULT_DARK_BACKGROUND
  }

  for (const property of BACKGROUND_PROPERTIES) {
    const color = readStyleColor(style, property)
    if (!color)
      continue

    const converted = convertBackgroundColor(color)
    writeStyleColor(style, property, converted)
    currentBackground = converted
  }

  for (const property of COMPLEX_BACKGROUND_PROPERTIES) {
    transformComplexColorValue(style, property, color => convertBackgroundColor(color))
  }

  if (element.id === 'bm-md' && !hasVisibleColor(style, 'color')) {
    style.setProperty('color', serializeColor(DEFAULT_DARK_TEXT))
  }

  for (const property of FOREGROUND_PROPERTIES) {
    const color = readStyleColor(style, property)
    if (!color)
      continue

    writeStyleColor(style, property, convertForegroundColor(color, currentBackground))
  }

  for (const property of LINE_PROPERTIES) {
    const color = readStyleColor(style, property)
    if (!color)
      continue

    writeStyleColor(style, property, convertLineColor(color, currentBackground))
  }

  for (const property of SHADOW_PROPERTIES) {
    transformComplexColorValue(style, property, color => convertLineColor(color, currentBackground))
  }

  for (const child of Array.from(element.children)) {
    transformElement(child, currentBackground)
  }

  if (style.length === 0) {
    element.removeAttribute('style')
  }

  return currentBackground
}

function readStyleColor(style: CSSStyleDeclaration, property: string): RgbColor | null {
  const value = style.getPropertyValue(property).trim()
  if (!value)
    return null

  return parseColor(value)
}

function writeStyleColor(style: CSSStyleDeclaration, property: string, color: RgbColor) {
  const priority = style.getPropertyPriority(property)
  style.setProperty(property, serializeColor(color), priority)
}

function hasVisibleColor(style: CSSStyleDeclaration, property: string): boolean {
  const color = readStyleColor(style, property)
  return Boolean(color && color.a > 0)
}

function transformComplexColorValue(
  style: CSSStyleDeclaration,
  property: string,
  convert: (color: RgbColor) => RgbColor,
) {
  const value = style.getPropertyValue(property)
  if (!value || value.includes('url('))
    return

  const nextValue = value.replace(COLOR_TOKEN_RE, (token) => {
    const color = parseColor(token)
    return color ? serializeColor(convert(color)) : token
  })

  if (nextValue !== value) {
    style.setProperty(property, nextValue, style.getPropertyPriority(property))
  }
}

function convertBackgroundColor(color: RgbColor): RgbColor {
  if (color.a === 0)
    return color

  const brightness = perceivedBrightness(color)
  const hsl = rgbToHsl(color)
  const isNeutral = hsl.s < 0.08

  if (brightness >= 245) {
    return { ...DEFAULT_DARK_BACKGROUND, a: color.a }
  }

  if (brightness >= 200) {
    const nextLightness = isNeutral
      ? 0.1 + (1 - hsl.l) * 0.12
      : 0.12 + (1 - hsl.l) * 0.2

    return hslToRgb({
      h: hsl.h,
      s: hsl.s * 0.72,
      l: clamp(nextLightness, 0.09, 0.28),
    }, color.a)
  }

  if (brightness >= 120) {
    return hslToRgb({
      h: hsl.h,
      s: hsl.s * 0.86,
      l: clamp(hsl.l * 0.58, 0.16, 0.36),
    }, color.a)
  }

  return hslToRgb({
    h: hsl.h,
    s: hsl.s * 0.9,
    l: clamp(hsl.l + 0.04, 0.08, 0.3),
  }, color.a)
}

function convertForegroundColor(color: RgbColor, background: RgbColor): RgbColor {
  if (color.a === 0)
    return color

  const brightness = perceivedBrightness(color)
  const hsl = rgbToHsl(color)
  const isNeutral = hsl.s < 0.12
  let next: RgbColor

  if (brightness >= 230) {
    next = hslToRgb({ h: hsl.h, s: hsl.s * 0.35, l: 0.92 }, color.a)
  }
  else if (isNeutral) {
    next = hslToRgb({
      h: hsl.h,
      s: hsl.s * 0.7,
      l: brightness < 130 ? 0.8 : 0.72,
    }, color.a)
  }
  else {
    next = hslToRgb({
      h: hsl.h,
      s: clamp(hsl.s * 0.82, 0.3, 0.86),
      l: brightness < 150
        ? clamp(hsl.l + 0.34, 0.64, 0.82)
        : clamp(hsl.l + 0.18, 0.62, 0.82),
    }, color.a)
  }

  return ensureReadable(next, background)
}

function convertLineColor(color: RgbColor, background: RgbColor): RgbColor {
  if (color.a === 0)
    return color

  const brightness = perceivedBrightness(color)
  const hsl = rgbToHsl(color)

  if (brightness < 120 && hsl.s > 0.16) {
    return ensureReadable(hslToRgb({
      h: hsl.h,
      s: clamp(hsl.s * 0.72, 0.24, 0.78),
      l: clamp(hsl.l + 0.24, 0.46, 0.66),
    }, color.a), background, 2.4)
  }

  return convertBackgroundColor(color)
}

function ensureReadable(color: RgbColor, background: RgbColor, minContrast = 4.5): RgbColor {
  if (contrastRatio(color, background) >= minContrast) {
    return color
  }

  const hsl = rgbToHsl(color)
  for (let lightness = hsl.l; lightness <= 0.96; lightness += 0.04) {
    const candidate = hslToRgb({ ...hsl, l: lightness }, color.a)
    if (contrastRatio(candidate, background) >= minContrast) {
      return candidate
    }
  }

  return { ...DEFAULT_DARK_TEXT, a: color.a }
}

function parseColor(value: string): RgbColor | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized || ['inherit', 'initial', 'unset', 'currentcolor'].includes(normalized))
    return null
  if (normalized === 'transparent')
    return { r: 0, g: 0, b: 0, a: 0 }

  const namedColor = NAMED_COLORS[normalized]
  if (namedColor) {
    return parseHexColor(namedColor)
  }

  if (normalized.startsWith('#')) {
    return parseHexColor(normalized)
  }

  if (normalized.startsWith('rgb')) {
    return parseRgbFunction(normalized)
  }

  if (normalized.startsWith('hsl')) {
    return parseHslFunction(normalized)
  }

  return null
}

function parseHexColor(value: string): RgbColor | null {
  const hex = value.slice(1)
  if (![3, 4, 6, 8].includes(hex.length))
    return null

  const parts = hex.length <= 4
    ? Array.from(hex).map(char => `${char}${char}`)
    : hex.match(/.{2}/g)

  if (!parts || parts.length < 3)
    return null

  const [r, g, b, a = 'ff'] = parts

  return {
    r: Number.parseInt(r, 16),
    g: Number.parseInt(g, 16),
    b: Number.parseInt(b, 16),
    a: Number.parseInt(a, 16) / 255,
  }
}

function parseRgbFunction(value: string): RgbColor | null {
  const parts = readFunctionParts(value)
  if (parts.length < 3)
    return null

  return {
    r: parseRgbChannel(parts[0]),
    g: parseRgbChannel(parts[1]),
    b: parseRgbChannel(parts[2]),
    a: parts[3] ? parseAlpha(parts[3]) : 1,
  }
}

function parseHslFunction(value: string): RgbColor | null {
  const parts = readFunctionParts(value)
  if (parts.length < 3)
    return null

  const h = normalizeHue(parts[0])
  const s = parsePercentage(parts[1])
  const l = parsePercentage(parts[2])
  const a = parts[3] ? parseAlpha(parts[3]) : 1

  return hslToRgb({ h, s, l }, a)
}

function readFunctionParts(value: string): string[] {
  const match = value.match(/\((.*)\)/)
  if (!match)
    return []

  return match[1]
    .trim()
    .replace(/\s*\/\s*/g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function parseRgbChannel(value: string): number {
  if (value.endsWith('%')) {
    return clamp(Math.round(Number.parseFloat(value) * 2.55), 0, 255)
  }
  return clamp(Math.round(Number.parseFloat(value)), 0, 255)
}

function parseAlpha(value: string): number {
  if (value.endsWith('%')) {
    return clamp(Number.parseFloat(value) / 100, 0, 1)
  }
  return clamp(Number.parseFloat(value), 0, 1)
}

function parsePercentage(value: string): number {
  return clamp(Number.parseFloat(value) / 100, 0, 1)
}

function normalizeHue(value: string): number {
  const hue = Number.parseFloat(value)
  return ((hue % 360) + 360) % 360
}

function serializeColor(color: RgbColor): string {
  const r = Math.round(color.r)
  const g = Math.round(color.g)
  const b = Math.round(color.b)
  if (color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${formatAlpha(color.a)})`
  }
  return `rgb(${r}, ${g}, ${b})`
}

function formatAlpha(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: lightness }
  }

  const delta = max - min
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min)

  let hue = 0
  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0)
  }
  else if (max === green) {
    hue = (blue - red) / delta + 2
  }
  else {
    hue = (red - green) / delta + 4
  }

  return { h: hue * 60, s: saturation, l: lightness }
}

function hslToRgb({ h, s, l }: HslColor, alpha = 1): RgbColor {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hue = h / 60
  const x = chroma * (1 - Math.abs(hue % 2 - 1))
  const m = l - chroma / 2
  let red = 0
  let green = 0
  let blue = 0

  if (hue >= 0 && hue < 1) {
    red = chroma
    green = x
  }
  else if (hue < 2) {
    red = x
    green = chroma
  }
  else if (hue < 3) {
    green = chroma
    blue = x
  }
  else if (hue < 4) {
    green = x
    blue = chroma
  }
  else if (hue < 5) {
    red = x
    blue = chroma
  }
  else {
    red = chroma
    blue = x
  }

  return {
    r: clamp(Math.round((red + m) * 255), 0, 255),
    g: clamp(Math.round((green + m) * 255), 0, 255),
    b: clamp(Math.round((blue + m) * 255), 0, 255),
    a: alpha,
  }
}

function perceivedBrightness({ r, g, b }: RgbColor): number {
  return (r * 299 + g * 587 + b * 114) / 1000
}

function contrastRatio(color: RgbColor, background: RgbColor): number {
  const light = relativeLuminance(color) + 0.05
  const dark = relativeLuminance(background) + 0.05
  return light > dark ? light / dark : dark / light
}

function relativeLuminance(color: RgbColor): number {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
