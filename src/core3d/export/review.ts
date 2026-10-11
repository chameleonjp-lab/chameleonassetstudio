import { validateProject, type Project3D } from '../model/project';
import { composeTransform, multiplyMatrices } from '../model/coordinates';
import { ASSET_IO_PROFILE as P } from '../profile/assetIoProfile';
import { estimateCanonicalBytes } from '../profile/resourceEstimates';
import { inverseAffineMatrix } from '../rig/math';
import { validateSkinProfile } from '../rig/profile';

/** Review admission limits, not a new native format or a physical-device guarantee. */
export const NATIVE_EXPORT_REVIEW_LIMITS = Object.freeze({
  items: 256,
  metadataBytes: 32 * 1024 * 1024,
  entities: 4096,
  hierarchyDepth: 256,
});

export interface NativeExportReviewItem {
  code: string;
  severity: 'info' | 'warning' | 'error';
  target: {
    kind: 'project' | 'node' | 'mesh' | 'material' | 'skin' | 'clip' | 'track' | 'source';
    id: string;
    parentId?: string;
  };
  /** Number of affected entities, corners, keys or endpoint holds, as stated in message. */
  count: number;
  message: string;
  preservation: string;
}

export interface NativeExportReview {
  projectId: string;
  revision: number;
  profileId: string;
  items: NativeExportReviewItem[];
  hasBlockers: boolean;
  omittedItems: number;
  estimatedMetadataBytes: number | null;
  outputs: { id: string; label: string; description: string }[];
  limitations: string[];
}

export const isNativeExportReviewStale = (
  report: Pick<NativeExportReview, 'projectId' | 'revision'>,
  project: Pick<Project3D, 'id' | 'revision'>,
) => report.projectId !== project.id || report.revision !== project.revision;

const backup = '編集用バックアップ（.cas3dproj）に正本を保持します。元作品は変更しません。';

function boundedHierarchyDepth(parents: ReadonlyMap<string, string | null | undefined>): number {
  let maximum = 0;
  for (const start of parents.keys()) {
    let id: string | null | undefined = start;
    let depth = 0;
    while (id != null) {
      if (++depth > NATIVE_EXPORT_REVIEW_LIMITS.hierarchyDepth)
        throw new Error('Review hierarchy limit');
      id = parents.get(id);
    }
    maximum = Math.max(maximum, depth);
  }
  return maximum;
}

/**
 * Synchronous, renderer/encoder/Blob-free explanation of the existing export profile.
 * A clear report is not export validation: final snapshot, bytes and worker checks remain mandatory.
 * IDs/revision bind the explanation, not authorization; the UI must separately confirm its session.
 */
export function analyzeNativeExport(project: Project3D): NativeExportReview {
  const report: NativeExportReview = {
    projectId: project.id,
    revision: project.revision,
    profileId: P.id,
    items: [],
    hasBlockers: false,
    omittedItems: 0,
    estimatedMetadataBytes: null,
    outputs: [
      {
        id: 'original-glb',
        label: '原本GLB（バックアップ内の保持原本）',
        description:
          '取込時のGLB原本bytesを編集用バックアップ内に保持します。原本GLBだけを保存する操作はありません。現在の編集は反映しません。原本だけにある情報も編集後GLBへ自動転送されません。',
      },
      {
        id: 'edited-glb',
        label: '編集後GLB（model.glb）',
        description:
          '現在の正本から対応する形状・階層・材質・skin・TRSキーを生成します。画像とbufferを内包する基本glTF 2.0用モデルです。原本コピーや編集用バックアップではありません。',
      },
      {
        id: 'game-sidecar',
        label: 'game.json',
        description:
          'モデルhashと対応ID、clip名・長さ・loop・空clip、game設定・anchor・collider、未検証の来歴を保持するmetadataです。形状・画像・原本bytesや空trackは含めず、同じ出力のmodel.glbと組み合わせます。',
      },
      {
        id: 'asset-zip',
        label: '3D asset ZIP',
        description:
          'model.glb・game.json・manifest.json（hash・revision・出力時の警告）をまとめます。原本一式や編集正本は同梱しないため、編集用バックアップの代用にはなりません。',
      },
      {
        id: 'native-backup',
        label: '編集用バックアップ（.cas3dproj）',
        description:
          '正本project、編集ID・階層・材質・skin・clip・game情報と参照する原本bytesを保持します。原本が欠ける場合は完全なバックアップを作れません。Undo履歴・画面の選択状態は含みません。',
      },
    ],
    limitations: [
      'この確認は現在の正本metadataだけを読みます。原本bytes・原本hash・未知extension・画像実体・画像寸法・色・alpha・decode結果は未検査（unverified）です。',
      '保存されたMIMEや利用条件は記録・申告です。形式の実体、権利・配布許諾、原本の完全保持を検証済みとは判定しません。',
      '出力の成功、最終GLB/ZIPの容量・hash・自己完結性、skinの全演算、consumerでの表示・再生は未検証です。確認後も既存のsnapshot・encoder・出力後検査を実施します。',
      '数量・構造見積りは確認処理の上限です。実際のメモリ使用量や実機性能の測定・保証ではありません。',
    ],
  };
  const add = (
    code: string,
    severity: NativeExportReviewItem['severity'],
    target: NativeExportReviewItem['target'],
    count: number,
    message: string,
    preservation = backup,
  ) => {
    if (severity === 'error') report.hasBlockers = true;
    // Reserve one slot for a fail-closed summary, including errors found after the cap.
    if (report.items.length < NATIVE_EXPORT_REVIEW_LIMITS.items - 1)
      report.items.push({ code, severity, target, count, message, preservation });
    else report.omittedItems++;
  };
  const projectTarget: NativeExportReviewItem['target'] = { kind: 'project', id: project.id };
  const finish = () => {
    if (report.omittedItems) {
      report.hasBlockers = true;
      report.items.push({
        code: 'review-item-limit',
        severity: 'error',
        target: projectTarget,
        count: report.omittedItems,
        message: `説明の上限により ${report.omittedItems} 件を表示できません。全内容を確認できないため、この確認では出力を開始できません。`,
        preservation:
          '表示された問題を確認し、元作品を保持した別コピーで対象を整理して再確認してください。',
      });
    }
    return report;
  };

  let nativeHierarchyDepth = 0;
  try {
    // Traverse without JSON.stringify or cloning; the estimator also bounds depth/value count.
    report.estimatedMetadataBytes = estimateCanonicalBytes(project);
    if (report.estimatedMetadataBytes > NATIVE_EXPORT_REVIEW_LIMITS.metadataBytes)
      throw new Error('Review metadata limit');
    for (const values of [
      project.nodes,
      project.meshes,
      project.materials,
      project.skins,
      project.sources,
      project.clips,
    ])
      if (values.length > NATIVE_EXPORT_REVIEW_LIMITS.entities)
        throw new Error('Review entity limit');
    // Bound the native validator's ancestor scans before calling it.
    nativeHierarchyDepth = boundedHierarchyDepth(
      new Map(project.nodes.map((node) => [node.id, node.parentId])),
    );
    boundedHierarchyDepth(
      new Map(project.sources.map((source) => [source.id, source.derivedFrom?.sourceId])),
    );
  } catch {
    add(
      'review-metadata-limit',
      'error',
      projectTarget,
      1,
      '正本metadataの構造・件数・深さを確認上限内で読み取れません。詳細検査は未実施です。',
    );
    return finish();
  }
  try {
    validateProject(project);
  } catch {
    add(
      'invalid-native-project',
      'error',
      projectTarget,
      1,
      '現在の正本形式・値・参照が検証を通りません。未対応fieldや壊れた参照を削って出力することはしません。',
    );
    return finish();
  }

  if (!project.nodes.length)
    add(
      'empty-scene',
      'error',
      projectTarget,
      1,
      '部品のない作品はGLB sceneとして出力できません。',
    );
  const roots = project.nodes.filter((node) => node.parentId === null);
  if (roots.length > 1)
    add(
      'identity-root',
      'warning',
      projectTarget,
      roots.length,
      `${roots.length} 個のrootをまとめる恒等変換の親nodeを編集後GLBだけに追加します。位置・回転・大きさを変えるwrapperではありません。`,
      '正本の階層は変更しません。追加nodeはGLBの独自extrasとgame.jsonの対応IDに記録します。',
    );
  const quantity = (count: number, maximum: number, label: string) => {
    if (count > maximum)
      add(
        'export-profile-limit',
        'error',
        projectTarget,
        count,
        `${label} ${count} 件が現行GLB上限 ${maximum} 件を超えます。自動削減しません。`,
      );
  };
  quantity(project.nodes.length + (roots.length > 1 ? 1 : 0), P.nodes, '追加rootを含むnode');
  quantity(project.meshes.length, P.nodes, 'mesh');
  quantity(
    project.materials.length +
      Number(project.meshes.some((mesh) => mesh.faces.some((face) => !face.materialId))),
    P.nodes,
    '既定材質を含むmaterial',
  );
  quantity(
    nativeHierarchyDepth + (roots.length > 1 ? 1 : 0),
    P.hierarchyDepth,
    '追加rootを含む階層深さ',
  );

  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const worlds = new Map<string, number[]>();
  const world = (id: string): number[] => {
    const cached = worlds.get(id);
    if (cached) return cached;
    const node = nodes.get(id)!;
    const local = composeTransform(node.transform);
    const matrix = node.parentId === null ? local : multiplyMatrices(world(node.parentId), local);
    worlds.set(id, matrix);
    return matrix;
  };
  for (const node of project.nodes) {
    const target: NativeExportReviewItem['target'] = { kind: 'node', id: node.id };
    if (node.visible === false)
      add(
        'hidden-node-retained',
        'warning',
        target,
        1,
        '非表示の部品も形状ごとGLBに残ります。標準consumerでは表示される可能性があり、非表示による配布除外にはなりません。',
        '表示設定はGLBの独自extras（casVisible）とnative backupに保持します。標準GLBの表示制御ではありません。',
      );
    if (node.locked)
      add(
        'lock-metadata-only',
        'warning',
        target,
        1,
        '編集ロックは標準GLBの保護機能ではなく、受取側の編集や利用を制限しません。',
        'lockはGLBの独自extras（casLocked）とnative backupに保持します。game.jsonにlock fieldはありません。',
      );
    try {
      inverseAffineMatrix(world(node.id));
    } catch {
      add(
        'unsupported-rest-transform',
        'error',
        target,
        1,
        '保存姿勢の変換が特異、または現行の数値範囲・逆行列検査を通りません。',
      );
    }
  }

  const materials = new Map(project.materials.map((material) => [material.id, material]));
  const textures = new Set<string>();
  for (const material of project.materials) {
    const target: NativeExportReviewItem['target'] = { kind: 'material', id: material.id };
    if (material.alphaMode === undefined || material.alphaMode === 'LEGACY_AUTO')
      add(
        'legacy-alpha-resolved',
        'warning',
        target,
        1,
        '互換用alphaを出力時に明示方式へ解決します。baseColorのalphaが1未満、または出力画像がPNGならBLEND、それ以外はOPAQUEです。PNGの実pixelの透明度判定ではありません。',
        '解決後の方式をGLBに保存します。互換設定はnative backupに保持します。画像実体を読まないこの確認では、画像付き材質の最終方式は確定しません。',
      );
    if (material.textureBlobId) {
      textures.add(material.textureBlobId);
      add(
        'texture-conversion-unverified',
        'warning',
        target,
        1,
        '画像実体は未検査です。現行出力は対応PNG/JPEGのbytesを保持し、対応する静止WebPはPNGへ変換します。WebPのanimation・EXIF・ICCP・XMP等は黙って削らず出力を拒否します。',
        '変換画像をGLB内へ含めます。画像原本はnative backupに保持し、game.jsonとZIPには原本一式を含めません。decode・寸法・色・向き・alphaの確認は出力時に必要です。',
      );
    }
  }
  quantity(textures.size, P.images, '画像');

  let corners = 0;
  let instancedCorners = 0;
  let accessors = 0;
  let decodedValues = 0;
  const skinned = new Set(project.skins.map((skin) => skin.meshId));
  for (const mesh of project.meshes) {
    const target: NativeExportReviewItem['target'] = { kind: 'mesh', id: mesh.id };
    const vertices = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position]));
    const used = new Set<string>();
    const groups = new Set<string>();
    let nonTriangles = 0,
      degenerate = 0,
      zeroNormals = 0,
      changedNormals = 0,
      missingUv = 0,
      overflow = 0;
    if (!mesh.faces.length)
      add('empty-mesh', 'error', target, 1, '面のないmeshは現行GLBとして出力できません。');
    for (const face of mesh.faces) {
      face.vertexIds.forEach((id) => used.add(id));
      groups.add(face.materialId ?? '');
      if (face.vertexIds.length !== 3) nonTriangles++;
      else {
        const [a, b, c] = face.vertexIds.map((id) => vertices.get(id)!);
        const u = b.map((value, axis) => value - a[axis]);
        const v = c.map((value, axis) => value - a[axis]);
        const length = Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        );
        if (!length) degenerate++;
        else if (!Number.isFinite(length)) overflow++;
      }
      if (face.materialId && materials.get(face.materialId)?.textureBlobId && !face.uv) missingUv++;
      for (const normal of face.normals ?? []) {
        const length = Math.hypot(...normal);
        // The existing exporter first checks rest-pose math on native, not normalized, values.
        if (normal.some((value) => !Number.isFinite(Math.fround(value)))) overflow++;
        if (!length) zeroNormals++;
        else if (!Number.isFinite(length)) overflow++;
        else if (Math.abs(length - 1) > 1e-5) changedNormals++;
      }
      if (
        face.uv?.some(
          (uv) => !Number.isFinite(Math.fround(uv[0])) || !Number.isFinite(Math.fround(1 - uv[1])),
        )
      )
        overflow++;
    }
    for (const id of used)
      if (vertices.get(id)!.some((value) => !Number.isFinite(Math.fround(value)))) overflow++;
    for (const [code, count, message] of [
      [
        'non-triangle-face',
        nonTriangles,
        '三角形以外の面は現行GLB出力に未対応です。明示的な三角形化が必要です。',
      ],
      ['degenerate-triangle', degenerate, '面積0の三角形があり、GLB出力を開始できません。'],
      ['zero-normal', zeroNormals, '長さ0の法線cornerがあり、明示的な修復が必要です。'],
      [
        'textured-face-missing-uv',
        missingUv,
        '画像付き材質の面にUVがありません。画像位置を自動推測しません。',
      ],
      [
        'geometry-float32-overflow',
        overflow,
        '形状・法線・UVの数値が現行GLBの演算範囲を超えます。',
      ],
    ] as const)
      if (count) add(code, 'error', target, count, message);
    if (changedNormals)
      add(
        'normal-normalized',
        'warning',
        target,
        changedNormals,
        `${changedNormals} cornerの法線を編集後GLBだけで単位長に正規化します。`,
      );
    if (mesh.vertices.length > used.size)
      add(
        'unused-vertices-omitted',
        'warning',
        target,
        mesh.vertices.length - used.size,
        '面から使われていない頂点は編集後GLBのgeometryへ出力されません。',
        '未使用頂点を含む編集構造はnative backupに保持します。game.jsonにはgeometryを保持しません。',
      );
    corners += mesh.faces.length * 3;
    const copies = skinned.has(mesh.id)
      ? Math.max(1, project.nodes.filter((node) => node.meshId === mesh.id).length)
      : 1;
    instancedCorners += mesh.faces.length * 3 * copies;
    const attributes = skinned.has(mesh.id) ? 5 : 3;
    accessors += groups.size * attributes;
    decodedValues += mesh.faces.length * 3 * (skinned.has(mesh.id) ? 16 : 8);
  }
  quantity(corners, P.vertices, '展開後のgeometry頂点');
  quantity(instancedCorners, P.vertices, 'skin instanceを含む展開後の頂点');
  if (project.meshes.length)
    add(
      'native-editing-data',
      'info',
      projectTarget,
      project.meshes.length,
      'GLBは三角形cornerへ展開した形状です。法線のない面は法線を生成し、画像なし・UVなしの面は既定UVを補います。面IDや元の編集構造の完全復元は保証しません。',
      '編集IDと元の構造はnative backupに保持します。一部の安定IDをGLB extrasへ残しても、編集正本の代用にはなりません。',
    );

  for (const skin of project.skins) {
    const target: NativeExportReviewItem['target'] = { kind: 'skin', id: skin.id };
    const mesh = project.meshes.find((value) => value.id === skin.meshId)!;
    const instances = project.nodes.filter((node) => node.meshId === skin.meshId);
    const ambiguous = project.skins.filter((value) => value.meshId === skin.meshId).length > 1;
    if (ambiguous)
      add(
        'multiple-skins-per-mesh',
        'error',
        target,
        1,
        '同じmeshに複数のskinがあり、現行GLB出力では対応を一意に決められません。',
      );
    if (!instances.length)
      add('uninstanced-skin', 'error', target, 1, 'scene内に使用nodeのないskinは出力できません。');
    // These mappings cannot be emitted. Do not multiply palettes for every ambiguous instance.
    if (ambiguous || !instances.length) continue;
    try {
      validateSkinProfile(skin, mesh, project.nodes);
      if (skin.joints.length > P.joints) throw new Error('Skin joint limit');
      for (const instance of instances)
        for (const joint of skin.joints)
          if (
            multiplyMatrices(joint.inverseBind, world(instance.id)).some(
              (value) => !Number.isFinite(Math.fround(value)),
            )
          )
            throw new Error('Skin bind overflow');
    } catch {
      add(
        'unsupported-skin-profile',
        'error',
        target,
        1,
        'skinのjoint数・bind行列・weight・数値範囲が現行出力profileを通りません。',
      );
    }
    accessors += instances.length;
    decodedValues += instances.length * skin.joints.length * 16;
  }

  let emittedClips = 0;
  let emittedKeys = 0;
  for (const clip of project.clips) {
    const target: NativeExportReviewItem['target'] = { kind: 'clip', id: clip.id };
    add(
      'clip-sidecar-settings',
      'warning',
      target,
      1,
      'loop指定と明示的なclip長さは標準GLB animationの設定ではありません。GLB単体の受取側がloopするとは限りません。',
      'clip名・長さ・loopをgame.jsonに保持します。ZIPは両方を同梱します。正本の設定はnative backupに保持します。',
    );
    if (!clip.tracks.some((track) => track.keys.length))
      add(
        'empty-clip-sidecar-only',
        'warning',
        target,
        1,
        'キーのないclipはGLB animationを作りません。',
        'clipのID・名前・長さ・loopはgame.jsonに保持します。空trackの定義はgame.jsonには保持せず、native backupだけに残ります。',
      );
    else emittedClips++;
    for (const track of clip.tracks) {
      const trackTarget: NativeExportReviewItem['target'] = {
        kind: 'track',
        id: `${track.nodeId}/${track.property}`,
        parentId: clip.id,
      };
      if (!track.keys.length) {
        add(
          'empty-track-backup-only',
          'warning',
          trackTarget,
          1,
          'キーのないtrackのnode・属性・補間指定はGLBにもgame.jsonにも出力されません。',
          '空trackの定義はnative backupだけに保持します。空clipの概要を保持するsidecarとは保持範囲が異なります。',
        );
        continue;
      }
      const start = track.keys[0].time > 0;
      const end = track.keys.at(-1)!.time < clip.duration;
      const holds = Number(start) + Number(end);
      if (holds)
        add(
          'endpoint-hold-inserted',
          'warning',
          trackTarget,
          holds,
          `${start ? '0秒' : ''}${start && end ? 'と' : ''}${end ? 'clip終端' : ''}へ端点値のholdキーを追加し、疎なキーの時間範囲をGLBに表します。`,
          '追加キーは編集後GLBだけです。元のキー配列とclip長さはnative backupに保持し、明示長さはgame.jsonにも記録します。',
        );
      let previous = -1;
      let collapsed = 0;
      let timeError = 0;
      const checkTime = (time: number) => {
        const rounded = Math.fround(time);
        if (!Number.isFinite(rounded) || Math.abs(rounded - time) > 1e-6) timeError++;
        if (rounded <= previous) collapsed++;
        previous = rounded;
      };
      if (start) checkTime(0);
      let valueOverflow = 0;
      for (const key of track.keys) {
        checkTime(key.time);
        if (key.value.some((value) => !Number.isFinite(Math.fround(value)))) valueOverflow++;
      }
      if (end) checkTime(clip.duration);
      if (timeError)
        add(
          'key-time-float32-error',
          'error',
          trackTarget,
          timeError,
          '追加holdを含むキー時刻がFloat32秒の許容誤差（1e-6秒）を超えます。',
        );
      if (collapsed)
        add(
          'key-time-float32-collapse',
          'error',
          trackTarget,
          collapsed,
          '追加holdを含む別々のキー時刻がFloat32で同一になり、出力できません。',
        );
      if (valueOverflow)
        add(
          'key-value-float32-overflow',
          'error',
          trackTarget,
          valueOverflow,
          'キーの値がFloat32の数値範囲を超えます。',
        );
      emittedKeys += track.keys.length + holds;
      accessors += 2;
      decodedValues += (track.keys.length + holds) * (track.property === 'rotation' ? 5 : 4);
    }
  }
  quantity(emittedClips, P.clips, '非空clip');
  quantity(emittedKeys, P.keys, '追加holdを含むキー');
  quantity(accessors, P.accessors, 'accessor');
  quantity(decodedValues, P.decodedAccessorValues, '展開した数値');
  if (project.meshes.length || project.skins.length || emittedClips)
    add(
      'float32-derived-values',
      'info',
      projectTarget,
      project.meshes.length + project.skins.length + emittedClips,
      '形状・法線・UV・weight・bind行列・animationキーの出力値はFloat32へ丸めます。キー時刻の許容誤差は1e-6秒で、範囲超過や時刻の重複は出力を拒否します。',
      'GLBは丸め後の派生値です。正本の数値を保つにはnative backupを保存してください。',
    );
  add(
    'game-sidecar-only',
    'warning',
    projectTarget,
    1 + project.game.anchors.length + project.game.colliders.length,
    'game設定・anchor・colliderは標準GLB機能ではありません。GLBはm・Y上・+Z前の正本座標で、受渡し単位・原点・前方向の設定をgeometryへ自動適用しません。',
    'game情報はgame.jsonとnative backupに保持します。対応consumerで意味を解釈し、必要な座標変換は一度だけ適用してください。',
  );
  for (const source of project.sources)
    add(
      'source-only-information-unverified',
      'warning',
      { kind: 'source', id: source.id },
      1,
      '原本だけに未知extension・VRM・未対応情報がある可能性があります。原本bytesを読んでいないため有無と保持差の詳細は未検査です。編集後GLBへの完全な転送は保証しません。',
      '原本bytesはnative backupに保持します。game.jsonには原本の参照・来歴・未検証の利用条件を記録し、原本bytesそのものは含めません。',
    );
  return finish();
}
