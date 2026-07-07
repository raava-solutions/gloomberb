import { describe, expect, test } from "bun:test";
import { extractExtendedHoursPrices } from "./mappers";
import type { ChartResult } from "./types";

describe("Yahoo mappers", () => {
  test("derives premarket change from the prior regular close", () => {
    const meta: NonNullable<ChartResult["meta"]> = {
      regularMarketPrice: 39.47,
      chartPreviousClose: 29,
      currentTradingPeriod: {
        pre: { start: 100, end: 200 },
        regular: { start: 300, end: 400 },
        post: { start: 500, end: 600 },
      },
    };

    const result = extractExtendedHoursPrices(
      meta,
      [100, 200],
      [39, 39.47],
      "PRE",
      38,
    );

    expect(result.preMarketPrice).toBe(39.47);
    expect(result.preMarketChange).toBeCloseTo(1.47, 8);
    expect(result.preMarketChangePercent).toBeCloseTo(3.8684210526, 8);
  });
});
