import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { translate, type Lang, type TranslationKey } from '@shared/i18n'

const LangContext = createContext<Lang>('vi')

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string

export function useT(): Translator {
  const lang = useContext(LangContext)
  return useCallback((key, params) => translate(lang, key, params), [lang])
}

export function useLang(): Lang {
  return useContext(LangContext)
}
