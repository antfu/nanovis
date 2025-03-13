import type { Metafile } from './metafile'
import { COLOR, updateColorMapping } from './color'
import { colorMode } from './color-mode'
import { createFlame } from './flame'
import {
  darkModeListener,
  // localStorageGetItem,
  // localStorageSetItem,
} from './helpers'
import styles from './index.module.css'
import { showSummary } from './summary'
import { createSunburst } from './sunburst'
import { createTreemap } from './treemap'
import { showWarningsPanel } from './warnings'
import { hideWhyFile } from './whyfile'

enum CHART {
  NONE,
  TREEMAP,
  SUNBURST,
  FLAME,
}

const startPanel = document.getElementById('startPanel') as HTMLDivElement
const resultsPanel = document.getElementById('resultsPanel') as HTMLDivElement
const chartPanel = document.getElementById('chartPanel') as HTMLDivElement
const useTreemap = document.getElementById('useTreemap') as HTMLAnchorElement
const useSunburst = document.getElementById('useSunburst') as HTMLAnchorElement
const useFlame = document.getElementById('useFlame') as HTMLAnchorElement
let chartMode = CHART.NONE

function isPlainObject (value: any): boolean {
  return typeof value === 'object' && value !== null && !(value instanceof Array)
}

export function finishLoading (json: string): void {
  const metafile: Metafile = JSON.parse(json)

  const useChart = (use: CHART): void => {
    if (chartMode !== use) {
      if (chartMode === CHART.TREEMAP) useTreemap.classList.remove(styles.active)
      else if (chartMode === CHART.SUNBURST) useSunburst.classList.remove(styles.active)
      else if (chartMode === CHART.FLAME) useFlame.classList.remove(styles.active)

      chartMode = use
      chartPanel.innerHTML = ''

      if (chartMode === CHART.TREEMAP) {
        chartPanel.append(createTreemap(metafile).el)
        useTreemap.classList.add(styles.active)
        // localStorageSetItem('chart', 'treemap')
      }

      else if (chartMode === CHART.SUNBURST) {
        chartPanel.append(createSunburst(metafile))
        useSunburst.classList.add(styles.active)
        // localStorageSetItem('chart', 'sunburst')
      }

      else if (chartMode === CHART.FLAME) {
        chartPanel.append(createFlame(metafile))
        useFlame.classList.add(styles.active)
        // localStorageSetItem('chart', 'flame')
      }
    }
  }

  const useColor = (use: COLOR): void => {
    if (colorMode.value !== use) {
      colorMode.value = use
      updateColorMapping(metafile, colorMode.value)
    }
  }

  if (!isPlainObject(metafile) || !isPlainObject(metafile.inputs) || !isPlainObject(metafile.outputs)) {
    throw new Error('Invalid metafile format')
  }

  startPanel.style.display = 'none'
  resultsPanel.style.display = 'block'
  useTreemap.onclick = () => useChart(CHART.TREEMAP)
  useSunburst.onclick = () => useChart(CHART.SUNBURST)
  useFlame.onclick = () => useChart(CHART.FLAME)

  chartMode = CHART.NONE
  colorMode.value = COLOR.NONE
  showSummary(metafile, () => useColor(colorMode.value === COLOR.DIRECTORY ? COLOR.FORMAT : COLOR.DIRECTORY))
  showWarningsPanel(metafile)
  hideWhyFile()
  useChart(CHART.TREEMAP)
  useColor(COLOR.DIRECTORY)
}

// let docElemDataset = document.documentElement.dataset
function updateTheme () {
  // Keep the dark/light mode theme up to date with the rest of the site
  // docElemDataset.theme = localStorageGetItem('theme') + ''
  if (darkModeListener) darkModeListener()
}

updateTheme()

document.getElementById('loadExample')!.onclick = () => {
  fetch('example-metafile.json').then(r => r.text()).then(finishLoading)
}
