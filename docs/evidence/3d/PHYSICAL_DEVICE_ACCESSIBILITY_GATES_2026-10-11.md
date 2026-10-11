# 3D physical-device and accessibility acceptance gates — prepared 2026-10-11

> **Status: plan only. No physical-device or assistive-technology run is claimed complete.** The local Chromium/WebKit production-preview records are diagnostic headless evidence and do not satisfy these gates.

This runbook operationalizes [`THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md`](../../THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md), especially §15.2–15.3 (device classes and MUST reachability) and §16 (UX/accessibility). Device models, minimum supported OS/browser versions, and numeric performance limits must be selected from evidence before release; this runbook does not invent them.

## Before each test session

1. Record the candidate commit/build hash, deployment path, device model, OS/build, browser/version, GPU, viewport/orientation, device scale, power/thermal state, and whether storage/cache is cold or warm. Use the same approved local fixtures and their hashes across repeated trials.
2. Start from an external `.cas3dproj` rescue copy. Keep a second known-good saved project. Do not use user material or personal account data as a fixture.
3. Capture the network allowlist/requests and confirm project data remains local. Distinguish observed browser telemetry from OS/GPU facts the platform does not expose.
4. For every MUST workflow, record exact steps, outcome, revision before/after, recovery result, and evidence path. A failure remains a failed gate until fixed and re-run on the same target class.

## Device matrix

| Target class | Required physical workflow | Required observations |
| --- | --- | --- |
| PC: each adopted Chrome-family, Safari, and Firefox target/version | Create primitive; select and perform numeric/interaction edits; edit supported mesh/material data; create/bind/adjust a rig and weights; edit/play/stop a clip; save, close/reopen, restore backup, and export/import GLB | OS/GPU/browser versions, cold/warm behavior, input and long-task traces, saved revision and backup equality, renderer recovery and errors |
| iPad Safari | Touch primitive/material work; limited mesh selection/move/extrude; joint create/fit/bind/manual weight edit; key/clip/time edits; save/backup/restore and GLB output. Test mouse separately if supported. | Portrait/landscape, panel scroll and pinch, touch target reachability, pointer cancellation, touch-vs-object drag separation, save/reopen and output |
| iPhone Safari | FLOW-06 plus the adopted preset's split-screen/numeric primitive/material, list/numeric mesh select/move/extrude, joint create/fit/bind/weight edit, key/clip edits, save/backup/restore and GLB output. | Portrait/landscape; app/tab switch and OS interruption; download; context loss/recovery; after OS kill, restore from the external backup rather than assuming a reliable pre-kill event |
| Android Chrome | Touch representative primitive/material, list/numeric mesh select/move/extrude, joint create/fit/bind/weight edit, key/clip edits, save/backup/restore and GLB output. | Physical memory pressure, app/tab switching, orientation, pointer cancellation and recovery; record device/browser/OS details |
| 3D unsupported/out-of-preset device | Open the home/explanation and recover an existing saved backup; confirm 2D remains usable | No infinite loading or crash loop; rescue path remains available and no unsupported 3D interaction is implied |

Use the same agreed representative project and the corresponding feature’s approved MUST cases on each target; do not silently reduce a phone/tablet to viewer-only behavior within an adopted preset. At least one physical device per adopted target class is required; unsupported/out-of-preset behavior is checked separately.

## Accessibility and input pass on physical targets

- **Keyboard:** traverse and operate all major editing, selection, transform, timeline, save/export, and dialog-exit paths without hover, right-click, or pointer-only access. Check focus order, visible focus, dialog focus restoration, and that shortcuts do not fire inside text inputs.
- **Japanese input:** use hardware and on-screen keyboards where available; exercise IME composition, empty/invalid values, Enter confirmation, Escape/cancel, and ensure composition confirmation does not double-commit.
- **Touch/pen/mouse:** run separately. Check pointer capture/cancel, object drag versus page pan/pinch, panel scrolling, orientation changes, and accidental edit prevention. Verify required controls remain reachable at the supported text zoom and do not depend on hover.
- **Screen readers:** test VoiceOver on adopted Apple targets and TalkBack on Android. Verify accessible names/roles/states, scene/property/timeline text alternatives to canvas-only information, reading order, and announcement of selection/mode, save success/failure, cancel, loading, unsupported, offline, and recovery states.
- **Visual/motion:** verify contrast, status not conveyed by color alone, touch-target size, reduced-motion preference, and that playback can be stopped. Check zoom/text enlargement does not hide essential controls or create blocking horizontal overflow.

## Evidence and exit criteria

Store a dated record per device class with the exact build and environment, fixture hash, cold/warm declaration, steps, result, visible screenshot or short local capture, screen-reader notes, and any available raw timing data. Redact account names, private paths, and unrelated notifications. Do not substitute browser emulation, desktop WebKit, or headless timing for a physical-device result.

The physical/accessibility release gate is **open** until every adopted MUST workflow and the applicable accessibility checks pass on each selected target class, recovery is demonstrated, and the concrete target matrix/performance limits are reviewed and recorded. Any unresolved MUST failure blocks the gate; do not turn a missing device, unsupported observer, or unmeasured performance value into zero or a pass.

| Gate | Status | Run owner / date | Evidence |
| --- | --- | --- | --- |
| PC adopted browser targets | Not run | — | — |
| iPad Safari | Not run | — | — |
| iPhone Safari | Not run | — | — |
| Android Chrome | Not run | — | — |
| Unsupported/out-of-preset rescue path | Not run | — | — |
| Keyboard + Japanese IME | Not run | — | — |
| VoiceOver / TalkBack | Not run | — | — |
