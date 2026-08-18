import catppuccinFrappeCss from '@catppuccin/highlightjs/css/catppuccin-frappe.css?inline'
import catppuccinLatteCss from '@catppuccin/highlightjs/css/catppuccin-latte.css?inline'
import catppuccinMacchiatoCss from '@catppuccin/highlightjs/css/catppuccin-macchiato.css?inline'
import catppuccinMochaCss from '@catppuccin/highlightjs/css/catppuccin-mocha.css?inline'
import kimbieDarkCss from 'highlight.js/styles/kimbie-dark.css?inline'
import kimbieLightCss from 'highlight.js/styles/kimbie-light.css?inline'
import pandaSyntaxDarkCss from 'highlight.js/styles/panda-syntax-dark.css?inline'
import pandaSyntaxLightCss from 'highlight.js/styles/panda-syntax-light.css?inline'
import paraisoDarkCss from 'highlight.js/styles/paraiso-dark.css?inline'
import paraisoLightCss from 'highlight.js/styles/paraiso-light.css?inline'
import rosePineDawnCss from 'highlight.js/styles/rose-pine-dawn.css?inline'
import rosePineCss from 'highlight.js/styles/rose-pine.css?inline'
import tokyoNightDarkCss from 'highlight.js/styles/tokyo-night-dark.css?inline'
import tokyoNightLightCss from 'highlight.js/styles/tokyo-night-light.css?inline'

const themeCssMap: Record<string, string> = {
  'catppuccin-frappe': catppuccinFrappeCss,
  'catppuccin-latte': catppuccinLatteCss,
  'catppuccin-macchiato': catppuccinMacchiatoCss,
  'catppuccin-mocha': catppuccinMochaCss,
  'kimbie-dark': kimbieDarkCss,
  'kimbie-light': kimbieLightCss,
  'panda-syntax-dark': pandaSyntaxDarkCss,
  'panda-syntax-light': pandaSyntaxLightCss,
  'paraiso-dark': paraisoDarkCss,
  'paraiso-light': paraisoLightCss,
  'rose-pine': rosePineCss,
  'rose-pine-dawn': rosePineDawnCss,
  'tokyo-night-dark': tokyoNightDarkCss,
  'tokyo-night-light': tokyoNightLightCss,
}

export function loadCodeThemeCss(id: string): string | undefined {
  return themeCssMap[id]
}
