import type { Metafile } from './metafile'
import { cjsColor, esmColor } from './color'
import {
  bytesToText,
  formatInteger,
  isSourceMapPath,
  textToHTML,
} from './helpers'
import styles from './summary.module.css'

enum CONSTANTS {
  FORMAT_WIDTH = 200,
}

const summaryPanel = document.getElementById('summaryPanel') as HTMLDivElement
const countedFiles = (count: number) => (count === 1 ? 'file' : 'files')

export function showSummary (metafile: Metafile, toggleColor: () => void): void {
  const inputs = metafile.inputs
  const outputs = metafile.outputs
  let fileCountIn = 0
  let fileCountOut = 0
  let totalBytesIn = 0
  let totalBytesOut = 0
  let esmByteCountIn = 0
  let cjsByteCountIn = 0

  for (const file in inputs) {
    const input = inputs[file]
    const format = input.format
    if (format === 'esm') esmByteCountIn += input.bytes
    else if (format === 'cjs') cjsByteCountIn += input.bytes
    else {
      // otherByteCountIn += input.bytes
    }
    fileCountIn++
    totalBytesIn += input.bytes
  }

  for (const file in outputs) {
    if (!isSourceMapPath(file)) {
      fileCountOut++
      totalBytesOut += outputs[file].bytes
    }
  }

  const esmWidth = Math.round(CONSTANTS.FORMAT_WIDTH * esmByteCountIn / totalBytesIn)
  const cjsWidth = Math.round(CONSTANTS.FORMAT_WIDTH * cjsByteCountIn / totalBytesIn)

  summaryPanel.innerHTML = ''
    + '<table><tr>'

    + '<td>'
    + '<h2>' + textToHTML(bytesToText(totalBytesIn)) + '</h2>'
    + textToHTML(formatInteger(fileCountIn)) + ' input ' + countedFiles(fileCountIn)
    + '</td>'

    + `<td class="${styles.symbol}">&rarr;</td>`

    + '<td>'
    + '<h2>' + textToHTML(bytesToText(totalBytesOut)) + '</h2>'
    + textToHTML(formatInteger(fileCountOut)) + ' output ' + countedFiles(fileCountOut)
    + '</td>'

    + '</tr></table>'

    + (esmByteCountIn || cjsByteCountIn
      ? ''
      + `<a href="javascript:void 0" class="${styles.formatBreakdown}">`
      + `<span class="${styles.side}">` + formatInteger(Math.round(100 * cjsByteCountIn / totalBytesIn)) + '% CJS</span>'
      + `<div class="${styles.bar}">`
      + '<div style="background:' + cjsColor + ';width:' + cjsWidth + 'px"></div>'
      + '<div style="background:#CCC;width:' + (CONSTANTS.FORMAT_WIDTH - esmWidth - cjsWidth) + 'px"></div>'
      + '<div style="background:' + esmColor + ';width:' + esmWidth + 'px"></div>'
      + '</div>'
      + `<span class="${styles.side}">` + formatInteger(Math.round(100 * esmByteCountIn / totalBytesIn)) + '% ESM</span>'
      + '</a>'
      : '')

  const formatBreakdownEl = summaryPanel.querySelector('.' + styles.formatBreakdown) as HTMLAnchorElement | undefined
  if (formatBreakdownEl) 
      formatBreakdownEl.onclick = toggleColor
}
