import { describe, expect, test } from "bun:test";
import { canonicalExchange, CANONICAL_EXCHANGE_ALIASES, EXCHANGE_TIME_ZONES, resolveExchangeTimeZone } from "./exchanges";

describe("exchange metadata", () => {
  test("has a valid timezone for every canonical exchange", () => {
    const canonicalExchanges = [...new Set(Object.values(CANONICAL_EXCHANGE_ALIASES))].sort();
    const missing = canonicalExchanges.filter((exchange) => !EXCHANGE_TIME_ZONES[exchange]);

    expect(missing).toEqual([]);
    for (const exchange of canonicalExchanges) {
      expect(() => new Intl.DateTimeFormat("en-US", {
        timeZone: EXCHANGE_TIME_ZONES[exchange],
      })).not.toThrow();
    }
  });

  test("normalizes broker venue aliases used by portfolio rows", () => {
    expect(canonicalExchange("LSEETF")).toBe("LSE");
    expect(canonicalExchange("TSE")).toBe("TSX");
    expect(canonicalExchange("AEB")).toBe("AMS");
    expect(canonicalExchange("EURONEXT")).toBe("AMS");
    expect(resolveExchangeTimeZone("LSEETF")).toBe("Europe/London");
    expect(resolveExchangeTimeZone("TSE")).toBe("America/Toronto");
    expect(resolveExchangeTimeZone("AEB")).toBe("Europe/Amsterdam");
  });
});
