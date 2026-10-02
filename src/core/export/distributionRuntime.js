// Shared standalone ESM shipped verbatim in distribution 0.2.0 helpers.
function uniqueIds(entries, label) {
  const ids = new Set();
  for (const entry of entries) {
    if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id))
      throw new Error(`${label}: missing or duplicate ID`);
    ids.add(entry.id);
  }
}
function cycleAt(timeMs, durationMs) {
  let cycle = Math.floor(timeMs / durationMs);
  if (!Number.isSafeInteger(cycle)) throw new Error('Playback cycle overflow');
  // Division can round up at a boundary. Use the same absolute-time arithmetic
  // as event delivery rather than %, whose remainder may disagree at e.g. 60fps.
  if (cycle * durationMs > timeMs) cycle--;
  if ((cycle + 1) * durationMs <= timeMs) cycle++;
  if (!Number.isSafeInteger(cycle)) throw new Error('Playback cycle overflow');
  return cycle;
}
function assertTime(timeMs) {
  if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > Number.MAX_SAFE_INTEGER)
    throw new Error('Playback time must be finite, nonnegative and safely representable');
}
/** Validate serialized timeline structure before any consumer performs time arithmetic. */
export function assertDistributionTimeline(timeline) {
  if (
    typeof timeline.id !== 'string' ||
    !timeline.id ||
    typeof timeline.name !== 'string' ||
    typeof timeline.loop !== 'boolean' ||
    !Array.isArray(timeline.occurrences)
  )
    throw new Error('Invalid timeline metadata');
  let endMs = 0;
  for (const [index, entry] of timeline.occurrences.entries()) {
    if (
      entry.index !== index ||
      typeof entry.frameId !== 'string' ||
      !entry.frameId ||
      !Number.isSafeInteger(entry.frameIndex) ||
      entry.frameIndex < 0 ||
      !Number.isSafeInteger(entry.page) ||
      entry.page < 0 ||
      entry.startMs !== endMs ||
      !Number.isFinite(entry.durationMs) ||
      entry.durationMs <= 0 ||
      !Array.isArray(entry.events)
    )
      throw new Error('Invalid timeline occurrence');
    uniqueIds(entry.events, 'events');
    for (const event of entry.events) {
      if (event.frameId !== entry.frameId || typeof event.name !== 'string')
        throw new Error('Invalid timeline event');
      const primitive = (value) =>
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value));
      const payload = event.payload;
      if (
        payload !== undefined &&
        !primitive(payload) &&
        !(Array.isArray(payload)
          ? payload.every(primitive)
          : typeof payload === 'object' &&
            payload !== null &&
            Object.values(payload).every(primitive))
      )
        throw new Error('Invalid timeline event payload');
    }
    const nextMs = endMs + entry.durationMs;
    if (!Number.isFinite(nextMs) || nextMs <= endMs) throw new Error('Timeline time overflow');
    endMs = nextMs;
  }
  if (timeline.durationMs !== endMs) throw new Error('Invalid timeline total');
}
/** Half-open frame intervals; non-looping playback keeps its final frame at completion. */
export function sampleDistributionTimeline(timeline, timeMs) {
  assertDistributionTimeline(timeline);
  assertTime(timeMs);
  if (timeline.occurrences.length === 0) return null;
  const complete = !timeline.loop && timeMs >= timeline.durationMs;
  const cycle = timeline.loop ? cycleAt(timeMs, timeline.durationMs) : 0;
  let occurrence = complete ? timeline.occurrences[timeline.occurrences.length - 1] : undefined;
  if (!complete) {
    for (let index = timeline.occurrences.length - 1; index >= 0; index--) {
      const entry = timeline.occurrences[index];
      if (cycle * timeline.durationMs + entry.startMs <= timeMs) {
        occurrence = entry;
        break;
      }
    }
  }
  if (!occurrence) throw new Error('Invalid timeline interval');
  return { occurrence, cycle, complete };
}
/**
 * Deliver every event in (afterMs, throughMs], including crossed loops, in source order.
 * null includes time zero for a new playback. Equal consecutive times never redeliver.
 * Bounded catch-up rejects atomically rather than silently dropping event information.
 */
export function distributionEventsBetween(timeline, afterMs, throughMs, maxDeliveries = 10_000) {
  assertDistributionTimeline(timeline);
  assertTime(throughMs);
  if (afterMs !== null) assertTime(afterMs);
  if (afterMs !== null && throughMs < afterMs) throw new Error('Playback time moved backwards');
  if (!Number.isSafeInteger(maxDeliveries) || maxDeliveries < 0)
    throw new Error('Invalid event delivery limit');
  if (!timeline.occurrences.some((entry) => entry.events.length > 0)) return [];
  const firstCycle = timeline.loop ? cycleAt(afterMs ?? 0, timeline.durationMs) : 0;
  const lastCycle = timeline.loop ? cycleAt(throughMs, timeline.durationMs) : 0;
  const eventsPerCycle = timeline.occurrences.reduce((sum, entry) => sum + entry.events.length, 0);
  if (Math.max(0, lastCycle - firstCycle - 1) * eventsPerCycle > maxDeliveries)
    throw new Error('Event catch-up exceeds delivery limit');
  const deliveries = [];
  for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
    for (const occurrence of timeline.occurrences) {
      const timeMs = cycle * timeline.durationMs + occurrence.startMs;
      if ((afterMs !== null && timeMs <= afterMs) || timeMs > throughMs) continue;
      for (const event of occurrence.events) {
        if (deliveries.length >= maxDeliveries)
          throw new Error('Event catch-up exceeds delivery limit');
        deliveries.push({
          event: structuredClone(event),
          occurrenceIndex: occurrence.index,
          cycle,
          timeMs,
        });
      }
    }
  }
  return deliveries;
}
/** Shared tick state for Web, PixiJS and Phaser adapters; no engine-specific fixed fps. */
export function createDistributionPlayback(timeline) {
  assertDistributionTimeline(timeline);
  timeline = structuredClone(timeline);
  let elapsedMs = 0;
  let running = false;
  return {
    start() {
      const events = distributionEventsBetween(timeline, null, 0);
      const sample = sampleDistributionTimeline(timeline, 0);
      elapsedMs = 0;
      running = sample !== null;
      return { sample, events };
    },
    advance(deltaMs) {
      assertTime(deltaMs);
      if (!running) return { sample: sampleDistributionTimeline(timeline, elapsedMs), events: [] };
      const nextMs = elapsedMs + deltaMs;
      if (deltaMs > 0 && nextMs <= elapsedMs) throw new Error('Playback time precision exceeded');
      const sample = sampleDistributionTimeline(timeline, nextMs);
      const events = distributionEventsBetween(timeline, elapsedMs, nextMs);
      elapsedMs = nextMs;
      if (sample?.complete) running = false;
      return { sample, events };
    },
    stop() {
      running = false;
    },
    isRunning() {
      return running;
    },
  };
}
function finiteGeometry(values) {
  if (!values.every(Number.isFinite)) throw new Error('Non-finite distribution geometry');
}
export function assertFrameGeometry(frame) {
  finiteGeometry([
    frame.origin.x,
    frame.origin.y,
    frame.rect.x,
    frame.rect.y,
    frame.rect.width,
    frame.rect.height,
    frame.sourceSize.width,
    frame.sourceSize.height,
    frame.contentRect.x,
    frame.contentRect.y,
    frame.contentRect.width,
    frame.contentRect.height,
    frame.contentOffset.x,
    frame.contentOffset.y,
    ...frame.anchors.flatMap((anchor) => [anchor.position.x, anchor.position.y]),
    ...frame.colliders.flatMap((collider) =>
      collider.shape === 'rect'
        ? [collider.rect.x, collider.rect.y, collider.rect.width, collider.rect.height]
        : [collider.circle.x, collider.circle.y, collider.circle.radius],
    ),
  ]);
}
/**
 * Shared placement for Canvas/PixiJS/Phaser. position is the world position of the
 * asset origin, not the trimmed image corner. visible controls debug drawing only;
 * hidden colliders remain in the game data (canonical ColliderBase semantics).
 */
export function projectDistributionFrame(frame, position) {
  assertFrameGeometry(frame);
  if (![position.x, position.y].every(Number.isFinite)) throw new Error('Invalid world position');
  const offset = { x: position.x - frame.origin.x, y: position.y - frame.origin.y };
  finiteGeometry([
    offset.x,
    offset.y,
    frame.rect.x + frame.contentRect.x,
    frame.rect.y + frame.contentRect.y,
  ]);
  const worldPoint = (point) => {
    const result = { x: offset.x + point.x, y: offset.y + point.y };
    finiteGeometry([result.x, result.y]);
    return result;
  };
  return {
    frameId: frame.id,
    page: frame.page,
    sourceRect: {
      x: frame.rect.x + frame.contentRect.x,
      y: frame.rect.y + frame.contentRect.y,
      width: frame.contentRect.width,
      height: frame.contentRect.height,
    },
    destinationRect: {
      ...worldPoint(frame.contentOffset),
      width: frame.contentRect.width,
      height: frame.contentRect.height,
    },
    origin: { ...position },
    anchors: frame.anchors.map((anchor) => ({
      ...structuredClone(anchor),
      position: worldPoint(anchor.position),
    })),
    colliders: frame.colliders.map((collider) => {
      const copy = structuredClone(collider);
      return copy.shape === 'rect'
        ? { ...copy, rect: { ...copy.rect, ...worldPoint(copy.rect) } }
        : { ...copy, circle: { ...copy.circle, ...worldPoint(copy.circle) } };
    }),
  };
}

/** Adapter shared state. Pass a validated 0.2.0 manifest and fully decoded pages. */
export function createDistributionPlayer(options, render, release = () => {}, clear = () => {}) {
  const { manifest, images, animationId } = options;
  if (manifest?.version !== '0.2.0' || manifest?.format !== 'chameleon-distribution')
    throw new Error('Expected distribution 0.2.0');
  const frames = manifest.frames;
  let position = { ...(options.position ?? { x: 0, y: 0 }) };
  let disposed = false;
  let currentFrame = null;
  const timeline =
    animationId === undefined
      ? manifest.animations[0]
      : manifest.animations.find((entry) => entry.id === animationId);
  if (animationId !== undefined && !timeline) throw new Error('Unknown animation ID');
  const playback = timeline ? createDistributionPlayback(timeline) : null;
  const ready = () => {
    if (disposed) throw new Error('Distribution player disposed');
  };
  const draw = (frame) => {
    ready();
    if (!frame) {
      currentFrame = null;
      clear();
      return null;
    }
    if (!images[frame.page]) throw new Error('Missing decoded page');
    const projection = projectDistributionFrame(frame, position);
    render(projection, frame);
    currentFrame = frame;
    return projection;
  };
  const present = (result) => {
    const occurrence = result.sample?.occurrence;
    const frame = occurrence ? frames[occurrence.frameIndex] : timeline ? null : frames[0];
    if (occurrence && (!frame || frame.id !== occurrence.frameId || frame.page !== occurrence.page))
      throw new Error('Unresolved timeline frame');
    return { ...result, projection: draw(frame) };
  };
  return {
    start() {
      ready();
      return present(playback?.start() ?? { sample: null, events: [] });
    },
    advance(deltaMs) {
      ready();
      return present(playback?.advance(deltaMs) ?? { sample: null, events: [] });
    },
    stop() {
      ready();
      playback?.stop();
    },
    isRunning() {
      return !disposed && (playback?.isRunning() ?? false);
    },
    drawFrame(frameId) {
      ready();
      const frame = frames.find((entry) => entry.id === frameId);
      if (!frame) throw new Error('Unknown frame ID');
      return draw(frame);
    },
    setPosition(next) {
      ready();
      if (!next || ![next.x, next.y].every(Number.isFinite))
        throw new Error('Invalid world position');
      position = { x: next.x, y: next.y };
      return currentFrame ? draw(currentFrame) : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      playback?.stop();
      release();
    },
  };
}
