import type { Metafile } from './metafile'
import {
  commonPostfixFinder,
  commonPrefixFinder,
  splitPathBySlash,
  textToHTML,
} from './helpers'
import styles from './warnings.module.css'
import { showWhyFile } from './whyfile'

let previousMetafile: Metafile | undefined

function generateWarnings(metafile: Metafile): HTMLElement[] {
  const inputs = metafile.inputs
  const resolvedPaths: Record<string, string[]> = {}
  const warnings: HTMLElement[] = []

  for (const i in inputs) {
    const input = inputs[i]
    for (const record of input.imports) {
      if (record.original && record.original[0] !== '.') {
        const array = resolvedPaths[record.original] || (resolvedPaths[record.original] = [])
        if (!array.includes(record.path))
          array.push(record.path)
      }
    }
  }

  for (const original in resolvedPaths) {
    const array = resolvedPaths[original]

    if (array.length > 1) {
      const warningEl = document.createElement('div')
      const listEl = document.createElement('ul')
      let commonPrefix: string[] | undefined
      let commonPostfix: string[] | undefined

      warningEl.className = styles.warning
      warningEl.innerHTML = 'The import path <code>' + textToHTML(original) + '</code> resolves to multiple files in the bundle:'

      for (const path of array) {
        commonPrefix = commonPrefixFinder(path, commonPrefix)
      }

      for (const path of array) {
        let parts = splitPathBySlash(path)
        if (commonPrefix)
          parts = parts.slice(commonPrefix.length)
        commonPostfix = commonPostfixFinder(parts.join('/'), commonPostfix)
      }

      for (const path of array.sort()) {
        let parts = splitPathBySlash(path).map(textToHTML)
        const itemEl = document.createElement('li')
        let html = '<pre><a href="javascript:void 0">'
        let postfix = ''

        if (commonPrefix && commonPrefix.length) {
          html += ''
            + `<span class="${styles.dim}">`
            + parts.slice(0, commonPrefix.length).join('/')
            + '/'
            + '</span>'
          parts = parts.slice(commonPrefix.length)
        }

        if (commonPostfix && commonPostfix.length) {
          postfix = ''
            + `<span class="${styles.dim}">`
            + (parts.length > commonPostfix.length ? '/' : '')
            + parts.slice(parts.length - commonPostfix.length).join('/')
            + '</span>'
          parts.length -= commonPostfix.length
        }

        itemEl.innerHTML = html + '<b>' + parts.join('/') + '</b>' + postfix + '</a></pre>'
        listEl.append(itemEl)

        itemEl.querySelector('a')!.onclick = () => {
          showWhyFile(metafile, path, null)
        }
      }

      warningEl.append(listEl)
      warnings.push(warningEl)
    }
  }

  return warnings
}

export function showWarningsPanel(metafile: Metafile): void {
  if (previousMetafile === metafile)
    return
  previousMetafile = metafile

  const warningsPanel = document.getElementById('warningsPanel') as HTMLDivElement
  const warnings = generateWarnings(metafile)
  const n = warnings.length

  if (n) {
    warningsPanel.innerHTML = ''
      + `<div class="${styles.expand}">`
      + '⚠️ This bundle has <b><a href="javascript:void 0">' + n + ' warning' + (n === 1 ? '' : 's') + '</a></b><span>.</span>'
      + '</div>'

    const spanEl = warningsPanel.querySelector('span') as HTMLSpanElement
    const contentEl = document.createElement('div')
    contentEl.className = styles.content
    for (const warning of warnings) contentEl.append(warning)
    warningsPanel.append(contentEl)

    warningsPanel.querySelector('a')!.onclick = () => {
      if (contentEl.style.display === 'block') {
        spanEl.textContent = '.'
        contentEl.style.display = 'none'
      }
      else {
        spanEl.textContent = ':'
        contentEl.style.display = 'block'
      }
    }
  }
  else {
    warningsPanel.innerHTML = ''
  }
}
