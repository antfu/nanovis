const isSourceMap = /\.\w+\.map$/
const disabledPathPrefix = /^\(disabled\):/

export const isMac = navigator.platform.includes('Mac')

export function isSourceMapPath(path: string): boolean {
  return isSourceMap.test(path)
}

export function stripDisabledPathPrefix(path: string): string {
  return path.replace(disabledPathPrefix, '')
}

export function splitPathBySlash(path: string): string[] {
  // Treat data URLs (e.g. "data:text/plain;base64,ABCD") as a single path element
  if (path.startsWith('data:') && path.includes(',')) {
    return [path]
  }

  const parts = path.split('/')

  // Replace ['a:', '', 'b'] at the start of the path with ['a://b']. This
  // handles paths that look like a URL scheme such as "https://example.com".
  if (parts.length >= 3 && parts[1] === '' && parts[0].endsWith(':')) {
    parts.splice(0, 3, parts.slice(0, 3).join('/'))
  }

  return parts
}

export function commonPrefixFinder(path: string, commonPrefix: string[] | undefined): string[] {
  if (path === '')
    return []
  const parts = splitPathBySlash(path)
  if (!commonPrefix)
    return parts

  // Note: This deliberately loops one past the end of the array so it can compare against "undefined"
  for (let i = 0; i <= parts.length; i++) {
    if (commonPrefix[i] !== parts[i]) {
      commonPrefix.length = i
      break
    }
  }

  return commonPrefix
}

export function commonPostfixFinder(path: string, commonPostfix: string[] | undefined): string[] {
  const parts = splitPathBySlash(path)
  if (!commonPostfix)
    return parts.reverse()

  // Note: This deliberately loops one past the end of the array so it can compare against "undefined"
  for (let i = 0; i <= parts.length; i++) {
    if (commonPostfix[i] !== parts[parts.length - i - 1]) {
      commonPostfix.length = i
      break
    }
  }

  return commonPostfix
}

export function posixDirname(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '.' : path.slice(0, slash)
}

export function posixRelPath(path: string, relToDir: string): string {
  const pathParts = path.split('/')
  const dirParts = relToDir === '.' ? [] : relToDir.split('/')
  let i = 0
  while (i < dirParts.length && pathParts[0] === dirParts[i]) {
    pathParts.shift()
    i++
  }
  if (i === dirParts.length) {
    pathParts.unshift('.')
  }
  else {
    while (i < dirParts.length) {
      pathParts.unshift('..')
      i++
    }
  }
  return pathParts.join('/')
}

export function nodeModulesPackagePathOrNull(path: string): string | null {
  let parts = splitPathBySlash(path)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === 'node_modules') {
      parts = parts.slice(i + 1)
      if (parts.length > 1 && /^index\.[jt]sx?$/.test(parts[parts.length - 1]))
        parts.pop()
      return parts.join('/')
    }
  }
  return null
}
