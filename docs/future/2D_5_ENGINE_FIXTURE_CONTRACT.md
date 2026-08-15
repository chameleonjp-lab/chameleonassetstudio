# Group 19 engine fixture contract

最終更新日: 2026-08-15

## Adopted scope

- G19-C1 A: Unity 6000.3.21f1 / Godot 4.7.1-stable
- G19-C2 A: engine別fixture、検証記録、artifact
- G19-C3 A: 既存PNG/sheet/sidecarを正本とし、fixture-local手順だけを追加

## Fixture roots

- `public/engine-fixtures/unity-6000-3-21f1/`
- `public/engine-fixtures/godot-4-7-1-stable/`

各rootは `package-manifest.json`、`asset.json`、`manifest.json`、`textures/main.png`、engine sidecar、`import-notes/`、`integrity/files.json`、`verification/record.json`、READMEを持つ。Unity/Godot間でfixtureファイルや成功記録を共有しない。

## Label and hash rules

- 実行前のlabelは `candidate` または `import-notes`。未実行を `verified` にしない。
- JSON hashは辞書順object・配列順維持のcanonical JSONをUTF-8 SHA-256にする。
- `manifest.integrity.manifestHash` はintegrity自身を除外する。
- `integrity/files.json` は相対path順のstatic file hash一覧を持つ。自己参照になるintegrity file、verification record、動的CI artifactは除外する。
- `verification/record.json` は`sourceAssetPath`（Group 17 source metadata reference at `sourceCommit`）の`sourceAssetHash`、fixture-local生成asset.jsonの`fixtureAssetHash`、output/sidecar/fixtureのhashを分離して参照する。sourceAssetPathはproduct exportの原本を意味せず、record自身をfixtureHashへ含めない。

## Runtime gate

このDraftのcandidate PNGはsource metadataから生成したfixture-local payloadであり、product export provenanceはruntime Gateで置き換えまたは確認する。fixture-local verification recordはGroup 18のcandidate / verified / import-notesラベルへmappingする。

Runtime完了には、engine/version、import error 0、frame順、trim/content offset、scale、origin/pivot、anchor、rect/circle collider、animation、console/import log、engine別artifactが必要である。artifact欠落は失敗とする。現行CIにはUnity licensed editorもGodot binaryもないため、このDraft PRではruntime未実行・verified未昇格である。

## Non-goals

このcontractは製品export、schema、migration、IndexedDB、.casproj、legacy ZIP、Atlas 0.1.0、既存helper、package dependency、Unity .meta/Prefab/Animator Controller、Godot .tscn/Resource/pluginを変更しない。
