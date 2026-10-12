# GAME-02 product-authored animated anchor through independent consumer — 2026-10-12

## Scope and evidence

The product E2E in `e2e/native-consumer.spec.ts` adds a `Tip Grip` anchor through the 3D game-information UI, attaches it to the authored `Tip` bone with local translation `[0.25, 0.5, 0]`, and creates a one-second bone animation from X=0 to X=1. It then exports GLB plus `game.json` through the product delivery UI and loads those downloaded bytes in a separate browser context running the independent Babylon consumer.

The consumer reports passing position/node oracles and one skeleton/animation. The anchor's world position is checked numerically at rest `[0.25, 1.5, 0]` and at one second `[1.25, 1.5, 0]`; the adjacent mixed-skin and rigid-attachment motion assertions remain in the same product-authored handoff test. Hash/runtime/position evidence and a consumer screenshot are attached to the test result.

## Local verification

The focused product-authored handoff passed 1/1 in Chromium and 1/1 in WebKit-critical. `npx tsc --noEmit`, focused ESLint, Prettier check, and `git diff --check` passed.

## Limits

This proves a generated project export path into the repository's independent Babylon CPU consumer, not compatibility with every external game engine/runtime, GPU rendering, real production deployment, or physical device. GAME-02 and overall acceptance remain partial/open; CI was not monitored.
