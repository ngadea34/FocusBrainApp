import { getLocales } from "expo-localization";
import { createContext, useContext, type ReactNode } from "react";
import { DICTIONARIES, uiLanguageFor, type Dictionary, type UiLanguage } from "./i18n";

const lang: UiLanguage = uiLanguageFor(getLocales().map((l) => l.languageTag));
const Ctx = createContext<{ t: Dictionary; lang: UiLanguage }>({ t: DICTIONARIES[lang], lang });

export function I18nProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={{ t: DICTIONARIES[lang], lang }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
