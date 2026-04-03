import type { Variable } from '../types'

const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export function interpolateTemplate(template: string, variables: Variable[]): string {
  const lookup = new Map(variables.map((v) => [v.key, v.value]))
  return template.replace(TEMPLATE_PATTERN, (_, key: string) => lookup.get(key) ?? `{{${key}}}`)
}

export function extractVariableKeys(template: string): string[] {
  const keys = new Set<string>()
  let match: RegExpExecArray | null
  const re = new RegExp(TEMPLATE_PATTERN.source, 'g')
  while ((match = re.exec(template)) !== null) {
    keys.add(match[1])
  }
  return Array.from(keys)
}
