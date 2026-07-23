---
date: 2026-07-23
topic: positioning-workstation
title: Positioning Workstation Requirements
---

# Positioning Workstation Requirements

## Summary

Gloomberb will add a local-first Positioning pane and local report archive for COT-based cross-market research. It will combine positioning changes, crowdedness, macro regime, and relevant CFTC releases into a source-visible investigation queue that can hand a selected instrument to ticker research.

---

## Problem Frame

Ticker research is not a good entry point for weekly market positioning. A user must first discover which contracts changed or became crowded across rates, FX, equity-index futures, energy, and metals. Current research also makes switching the active symbol harder than it should be.

COT is weekly regulatory data, not live quote data. A trustworthy surface must make the report date, publication time, source, and coverage clear. CFTC releases add useful regulatory context, but they are not positioning inputs.

---

## Key Decisions

- **Dedicated Positioning pane over a ticker-research tab.** Cross-market discovery is the first job. A selected contract then opens the evidence already available in ticker research.
- **One investigation queue answers four questions.** The landing view must support macro-regime reading, crowdedness, weekly changes, and a ranked "research next" list without four competing dashboards.
- **COT plus relevant CFTC releases.** CFTC releases appear as linked context and do not change COT positioning scores.
- **Report workflow over generic chat.** Natural-language requests produce a fixed, saved intelligence report with its inputs and sources rather than an opaque conversation.
- **Local-first data posture.** Provenance and freshness are part of the product. The first release does not promise an arbitrary API-endpoint builder.

---

## Requirements

**Positioning discovery**

- R1. The Positioning pane must ship with a curated cross-market universe spanning financial futures and commodities.
- R2. The landing view must rank contracts for investigation using positioning extremes, week-over-week changes, and cross-asset regime context.
- R3. Each result must identify its contract, report family, participant group, report date, publication time, data source, and freshness state.
- R4. A contract detail view must show its positioning history, current net positioning, weekly change, and the participant groups that explain the change.
- R5. The pane must show relevant CFTC releases alongside the contract detail without presenting those releases as COT measurements.

**Research handoff and reports**

- R6. Selecting a contract must let the user open or replace the active ticker-research context with one direct action.
- R7. Ticker research must expose its current symbol and provide an in-place symbol switcher that uses the existing search and instrument-resolution behavior.
- R8. A user must be able to request a natural-language intelligence report for a selected contract or saved queue item.
- R9. Each intelligence report must show its COT inputs, linked CFTC releases, source links, as-of times, material uncertainty, and a local input manifest.
- R10. The report archive must retain local reports and let the user reopen the corresponding underlying research context.

**Data control**

- R11. Every COT value, release, and AI report input must expose source provenance and freshness.
- R12. The positioning workflow must function without a required Gloomberb cloud subscription.
- R13. The product must make active local and user-enabled data sources visible before a user relies on a report.

---

## Key Flows

- F1. Cross-market scan
  - **Trigger:** The user opens Positioning.
  - **Steps:** The pane loads the curated universe, shows the current cross-asset regime, and ranks contracts by crowdedness and weekly change.
  - **Outcome:** The user can identify a contract to investigate without first knowing its ticker.

- F2. Contract investigation
  - **Trigger:** The user selects a ranked contract.
  - **Steps:** The detail view shows the COT series and participant changes, then links relevant CFTC releases.
  - **Outcome:** The user can distinguish a reported positioning change from regulatory context.

- F3. Research handoff
  - **Trigger:** The user chooses to inspect a contract further.
  - **Steps:** Gloomberb resolves the instrument and opens or replaces ticker research; the research header permits another in-place symbol switch.
  - **Outcome:** The user can move between positioning and ticker research without rebuilding a layout or opening a separate search pane.

- F4. Intelligence report
  - **Trigger:** The user asks a natural-language question from a contract or queue item.
  - **Steps:** The user approves the evidence bundle, Gloomberb generates a fixed report, and the archive stores the report with its local input manifest.
  - **Outcome:** The user receives a reproducible, source-visible research artifact rather than an untraceable chat response.

---

## Acceptance Examples

- AE1. **Covers R2, R3.** Given a new weekly COT release, when the user opens Positioning, then the queue identifies the report date and ranks changed or crowded contracts without calling the information live market data.
- AE2. **Covers R4, R5.** Given a selected crude-oil contract with a related CFTC release, when the user views its detail, then the release is visible as context and remains separate from positioning metrics.
- AE3. **Covers R6, R7.** Given ticker research is open on one symbol, when the user selects another resolved instrument, then the same research context updates to the new symbol without requiring layout changes.
- AE4. **Covers R8, R9, R10.** Given a selected queue item, when the user requests a report, then the saved artifact identifies its evidence, timestamps, uncertainty, and a path back to its research context.

---

## Scope Boundaries

### Deferred for later

- Arbitrary user-defined API endpoint mapping and credential proxying.
- A Raava-operated market-data relay.
- CFTC enforcement scoring, broad regulatory-news intelligence, and a general CFTC news product.
- Automated trading, execution recommendations, or trade instructions.

### Outside this product's identity

- Treating COT as a live-data feed.
- Replacing source-visible reports with an unsourced general-purpose chat assistant.

---

## Dependencies and Assumptions

- The official CFTC COT data source remains publicly accessible and is used according to its publication cadence.
- The first release uses a curated contract universe and explicit mappings; it does not infer every equity-to-futures relationship.
- Existing provider search and ticker-research context can resolve the selected instrument for the research handoff.
- Existing local-first provider capabilities remain the default path for core research.

---

## Success Criteria

- A user can answer all four landing questions: current macro regime, crowded contracts, weekly positioning changes, and what to investigate next.
- Every visible positioning claim and report input has a source and as-of time.
- A user can change the active ticker-research symbol from the research view without layout management.
- A saved intelligence report can be reopened with its evidence and original research context.

---

## Outstanding Questions

### Deferred to planning

- Define the first curated contract universe and the participant-group presentation for each report family.
- Define the ranking model and how it communicates uncertainty without implying a trade recommendation.
- Select the narrowest first user-controlled data connector after the Positioning workflow exposes the highest-value source gap.

---

## Sources

- [CFTC Commitments of Traders](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm)
- [CFTC Historical Compressed COT Data](https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm)
- `concepts/projects/gloomberb-data-independence` in raava-brain
- `docs/gloomberb-agent-pane-grid/2026-07-20-agent-pane-grid-public-release-plan` in raava-brain
- `src/plugins/builtin/ticker-detail/`, `src/plugins/builtin/research/`, and `src/plugins/builtin/ai/`
