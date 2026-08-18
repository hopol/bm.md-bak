import ayuLightCss from './ayu-light.css?inline'
import bauhausCss from './bauhaus.css?inline'
import blueprintCss from './blueprint.css?inline'
import botanicalCss from './botanical.css?inline'
import greenSimpleCss from './green-simple.css?inline'
import kamiCss from './kami.css?inline'
import maximalismCss from './maximalism.css?inline'
import neoBrutalismCss from './neo-brutalism.css?inline'
import newsprintCss from './newsprint.css?inline'
import organicCss from './organic.css?inline'
import playfulGeometricCss from './playful-geometric.css?inline'
import professionalCss from './professional.css?inline'
import resetCss from './reset.css?inline'
import retroCss from './retro.css?inline'
import sketchCss from './sketch.css?inline'
import terminalCss from './terminal.css?inline'

const themeCssMap: Record<string, string> = {
  'ayu-light': ayuLightCss,
  'bauhaus': bauhausCss,
  'blueprint': blueprintCss,
  'botanical': botanicalCss,
  'green-simple': greenSimpleCss,
  'kami': kamiCss,
  'maximalism': maximalismCss,
  'neo-brutalism': neoBrutalismCss,
  'newsprint': newsprintCss,
  'organic': organicCss,
  'playful-geometric': playfulGeometricCss,
  'professional': professionalCss,
  'retro': retroCss,
  'sketch': sketchCss,
  'terminal': terminalCss,
}

export function loadMarkdownStyleCss(id: string): string | undefined {
  const themeCss = themeCssMap[id]
  if (!themeCss) {
    return undefined
  }

  return resetCss + themeCss
}
