export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting SwapSha!': 0,
  'Waiting for PostgreSQL to be ready': 1,
  'PostgreSQL is ready': 2,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
