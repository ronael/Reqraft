import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { formatMessage, type Translate } from "@/i18n/desktop/format.js";

/**
 * Les libellés de l'interface, disponibles partout sans les faire descendre.
 *
 * Le traducteur traversait l'arbre en props : cinq surfaces et une vingtaine
 * de sous-composants plus loin, chaque nouvel écran demandait de rebrancher la
 * chaîne entière, et un oubli n'apparaissait qu'à l'écran. Un contexte
 * supprime ce câblage.
 *
 * Les libellés viennent du processus principal, jamais des catalogues
 * embarqués : la résolution de langue est celle du CLI, et la dupliquer ferait
 * diverger les deux surfaces.
 */
export type { Translate };

export type UiLocale = "en" | "fr";

/** Rend la clé tant que les libellés ne sont pas là : visible, et inoffensif. */
const renderKey: Translate = (key, params) => formatMessage(key, params);

const TranslateContext = createContext<Translate>(renderKey);

/**
 * La langue affichée, et de quoi en montrer une autre.
 *
 * `previewLocale` ne change que cette fenêtre : le menu de la barre et les
 * titres sont écrits par le processus principal au démarrage et ne peuvent
 * plus être réétiquetés. Les écrans qui offrent le choix disent donc qu'il
 * prend effet au prochain lancement — l'aperçu sert seulement à voir ce qu'on
 * choisit.
 */
export interface LocaleControls {
  locale: UiLocale | null;
  previewLocale: (locale: UiLocale) => void;
}

const LocaleContext = createContext<LocaleControls>({
  locale: null,
  previewLocale: () => undefined,
});

export function TranslationProvider({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const [messages, setMessages] = useState<Record<string, string> | null>(null);
  const [locale, setLocale] = useState<UiLocale | null>(null);

  useEffect(() => {
    window.reqraft
      .readLocale()
      .then((response) => {
        setLocale(response.locale);
        setMessages(response.messages);
        // Le document annonce sa langue : la césure, la sélection vocale et la
        // ponctuation du navigateur en dépendent, et le gabarit est figé à
        // l'anglais.
        document.documentElement.lang = response.locale;
      })
      .catch(() => {
        setMessages({});
      });
  }, []);

  const previewLocale = useCallback((next: UiLocale) => {
    // La langue choisie est affichée tout de suite, mais les libellés
    // continuent de venir du processus principal : un catalogue embarqué ici
    // finirait par diverger de celui que le reste de l'application utilise.
    setLocale(next);
    window.reqraft
      .readLocale(next)
      .then((response) => {
        setMessages(response.messages);
        document.documentElement.lang = next;
      })
      .catch(() => undefined);
  }, []);

  const translate = useMemo<Translate>(
    () => (key, params) => formatMessage(messages?.[key] ?? key, params),
    [messages],
  );

  const controls = useMemo<LocaleControls>(
    () => ({ locale, previewLocale }),
    [locale, previewLocale],
  );

  return (
    <LocaleContext.Provider value={controls}>
      <TranslateContext.Provider value={translate}>{children}</TranslateContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useT(): Translate {
  return useContext(TranslateContext);
}

export function useLocale(): LocaleControls {
  return useContext(LocaleContext);
}
