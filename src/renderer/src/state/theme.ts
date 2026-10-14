import { createContext, useContext } from 'react'
import type { ResolvedTheme } from '@shared/types'

/**
 * The resolved (light/dark) theme, provided so deeply nested renderers - most
 * importantly Mermaid, which has to re-render its diagrams - can react to a
 * theme change without prop drilling through the hast-to-React conversion.
 */
export const ThemeContext = createContext<ResolvedTheme>('light')

export function useResolvedTheme(): ResolvedTheme {
  return useContext(ThemeContext)
}
