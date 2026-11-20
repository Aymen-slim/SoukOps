import type { BuyerLanguage } from "./language";

/**
 * Market & language registry. v1 is focused on Tunisia (`tn`) first — Derja
 * (Arabizi & Arabic script), French, Arabic, and English — while isolating
 * currency, phone prefix, emergency numbers, and supported languages behind a
 * single registry so new countries and languages can be added later without
 * rewriting pipelines.
 */
export type MarketCode = "tn";

export interface MarketConfig {
  code: MarketCode;
  countryName: string;
  currencyCode: string;
  currencyDisplay: string;
  subunitName: string;
  subunitMultiplier: number;
  phoneCountryPrefix: string;
  emergencyNumber: string;
  defaultLanguage: BuyerLanguage;
  supportedLanguages: readonly BuyerLanguage[];
  languageLabels: Record<BuyerLanguage, string>;
  asrLanguageBias: string[];
}

export const TN_MARKET: MarketConfig = {
  code: "tn",
  countryName: "Tunisia",
  currencyCode: "TND",
  currencyDisplay: "DT",
  subunitName: "millimes",
  subunitMultiplier: 1000,
  phoneCountryPrefix: "+216",
  emergencyNumber: "190",
  defaultLanguage: "derja",
  supportedLanguages: ["derja", "fr", "ar", "en"],
  languageLabels: {
    derja: "Tunisian Derja (Arabizi & Arabic)",
    fr: "French",
    ar: "Arabic",
    en: "English",
  },
  asrLanguageBias: ["Arabic", "French", "English"],
};

const MARKETS: Record<MarketCode, MarketConfig> = {
  tn: TN_MARKET,
};

export const ACTIVE_MARKET: MarketConfig = TN_MARKET;

export function getMarketConfig(code?: string | null): MarketConfig {
  if (code && code in MARKETS) {
    return MARKETS[code as MarketCode];
  }
  return TN_MARKET;
}

export function isLanguageEnabled(lang: unknown, marketCode?: string | null): lang is BuyerLanguage {
  if (typeof lang !== "string") return false;
  return (getMarketConfig(marketCode).supportedLanguages as readonly string[]).includes(lang);
}
