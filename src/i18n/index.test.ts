import { describe, expect, test } from "bun:test";
import {
  applyLanguageFromConfig,
  applyLanguagePreference,
  getLanguage,
  setLanguage,
} from ".";

function restoreEnvironmentLanguageOverride(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.GLOOMBERB_LANG;
  } else {
    process.env.GLOOMBERB_LANG = value;
  }
}

describe("language selection", () => {
  test("keeps a valid environment override ahead of runtime preferences", () => {
    const previousOverride = process.env.GLOOMBERB_LANG;
    const previousLanguage = getLanguage();
    try {
      process.env.GLOOMBERB_LANG = "zh-CN";
      setLanguage("en");

      applyLanguagePreference("en");

      expect(getLanguage()).toBe("zh-CN");
    } finally {
      restoreEnvironmentLanguageOverride(previousOverride);
      setLanguage(previousLanguage);
    }
  });

  test("ignores an unsupported override instead of blocking saved config", () => {
    const previousOverride = process.env.GLOOMBERB_LANG;
    const previousLanguage = getLanguage();
    try {
      process.env.GLOOMBERB_LANG = "zh-TW";
      setLanguage("en");

      applyLanguageFromConfig({ language: "zh-CN" });

      expect(getLanguage()).toBe("zh-CN");
    } finally {
      restoreEnvironmentLanguageOverride(previousOverride);
      setLanguage(previousLanguage);
    }
  });

  test("auto-selects only supported Simplified Chinese locale tags", () => {
    const previousOverride = process.env.GLOOMBERB_LANG;
    const previousLanguage = getLanguage();
    try {
      for (const locale of ["zh", "zh-CN", "zh-SG", "zh-Hans-CN", "zh_CN.UTF-8"]) {
        process.env.GLOOMBERB_LANG = locale;
        applyLanguagePreference("auto");
        expect(getLanguage()).toBe("zh-CN");
      }

      for (const locale of ["zh-TW", "zh-HK", "zh-Hant"]) {
        process.env.GLOOMBERB_LANG = locale;
        applyLanguagePreference("auto");
        expect(getLanguage()).toBe("en");
      }
    } finally {
      restoreEnvironmentLanguageOverride(previousOverride);
      setLanguage(previousLanguage);
    }
  });
});
