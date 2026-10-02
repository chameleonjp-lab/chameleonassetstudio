import { createRoot } from 'react-dom/client';
import { TimelinePanel } from '../../src/features/editor/TimelinePanel';
import sample from '../../src/core/samples/asset.character.json';
import type { Asset } from '../../src/core/model';
const asset = structuredClone(sample) as unknown as Asset;
asset.frames = [{ id: 'frame', name: 'frame', layerStates: [] }];
asset.animations = [
  {
    id: 'animation',
    name: 'animation',
    fps: 12,
    loop: true,
    frameIds: ['frame'],
    events: [{ id: 'event', name: 'blocked', frameId: 'frame' }],
  },
];
const state = window as typeof window & { acceptPayload?: boolean; payloadCommits?: number };
state.payloadCommits = 0;
const noop = () => {};
createRoot(document.getElementById('root')!).render(
  <TimelinePanel
    asset={asset}
    playingFrameId={null}
    playingOccurrenceIndex={null}
    firedAnimationEvents={[]}
    isPlaying={false}
    selectedAnimationId="animation"
    onSelectAnimation={noop}
    onSelectFrame={noop}
    onDrawFrame={noop}
    onDuplicateFrame={noop}
    onSelectOccurrence={noop}
    showPreviousOnionSkin={false}
    showNextOnionSkin={false}
    onShowPreviousOnionSkinChange={noop}
    onShowNextOnionSkinChange={noop}
    onPlay={noop}
    onStop={noop}
    onRewind={noop}
    onLiveChange={noop}
    onBeginFieldEdit={noop}
    onCommitFieldEdit={noop}
    frameAlignmentDraft={null}
    frameAlignmentPreviewError={null}
    onStartFrameAlignment={noop}
    onFrameAlignmentDeltaInput={noop}
    onNudgeFrameAlignment={noop}
    onConfirmFrameAlignment={noop}
    onCancelFrameAlignment={noop}
    onCommit={() => {
      if (!state.acceptPayload) return false;
      state.payloadCommits! += 1;
      return true;
    }}
  />,
);
