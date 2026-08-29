import React from "react";
import { IntlProvider, useIntl } from "react-intl";
import en from "./messages/en.json";
import fr from "./messages/fr.json";
import de from "./messages/de.json";
import es from "./messages/es.json";
import zh from "./messages/zh.json";

// Other locales are added here as they're translated; anything missing
// falls back to English
const catalogs: Record<string, Record<string, string>> = { en, fr, de, es, zh };

// Stash's own IntlProvider only knows about its own message ids, so a nested
// provider is the only way for our ids to resolve instead of falling back to
// defaultMessage: locale/formats are inherited from the ambient one
function resolveCatalog(locale: string): Record<string, string> {
  return catalogs[locale] ?? catalogs[locale.split("-")[0]] ?? catalogs.en;
}

export function LibrarianIntlProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ambient = useIntl();
  return (
    <IntlProvider
      locale={ambient.locale}
      defaultLocale="en"
      messages={
        {
          ...ambient.messages,
          ...resolveCatalog(ambient.locale),
        } as Record<string, string>
      }
    >
      {children}
    </IntlProvider>
  );
}
