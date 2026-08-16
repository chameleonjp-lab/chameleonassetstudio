# Group 19 Unity runtime fixture

This directory contains a minimal, fixture-local Unity project and an Editor
runner. It is not a product export, native project template, package, Prefab,
or plugin.

The manual workflow copies
`public/engine-fixtures/unity-6000-3-21f1` into the project, imports the PNG
with Unity 6000.3.21f1, and uses Unity's Sprite Editor Data Provider API from
the `com.unity.2d.sprite` core package to create the two Sprite slices. It
then builds an in-memory animation clip and checks the pivot, trim/content
metadata, scale, origin, anchor, and rectangle/circle colliders. It writes
`TestResults/g19-unity-runtime.json` and fails when the artifact is missing or
a check fails.

The workflow is deliberately `workflow_dispatch` only. A licensed Unity
environment is required; the repository does not contain credentials or a
native Unity project. Configure the appropriate Unity secrets before running
`Group 19 Unity runtime`:

- Personal license: `UNITY_LICENSE`, `UNITY_EMAIL`, `UNITY_PASSWORD`
- Professional license: `UNITY_SERIAL`, `UNITY_EMAIL`, `UNITY_PASSWORD`

Until that workflow produces and reviews a separate artifact, the Unity
fixture remains `candidate` and Group 19 is not promoted to `verified`.
