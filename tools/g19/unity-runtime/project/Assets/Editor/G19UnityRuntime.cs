using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class G19UnityRuntime
{
    private const string FixtureRoot = "Assets/G19Fixture";
    private const string ResultPath = "TestResults/g19-unity-runtime.json";
    private static readonly List<string> Failures = new List<string>();

    [Serializable]
    private class Vec
    {
        public float x;
        public float y;
    }

    [Serializable]
    private class RectData
    {
        public float x;
        public float y;
        public float width;
        public float height;
    }

    [Serializable]
    private class CircleData
    {
        public float x;
        public float y;
        public float radius;
    }

    [Serializable]
    private class Frame
    {
        public string name;
        public RectData rect;
        public Vec contentOffset;
    }

    [Serializable]
    private class Anchor
    {
        public string name;
        public string role;
        public float x;
        public float y;
    }

    [Serializable]
    private class AnimationData
    {
        public string name;
        public string[] frames;
        public float fps;
        public bool loop;
    }

    [Serializable]
    private class ColliderData
    {
        public string name;
        public string shape;
        public RectData rect;
        public CircleData circle;
    }

    [Serializable]
    private class Manifest
    {
        public string format;
        public string version;
        public string profile;
        public float scale;
        public Frame[] frames;
        public AnimationData[] animations;
        public Vec origin;
        public Anchor[] anchors;
        public ColliderData[] colliders;
    }

    [Serializable]
    private class Pivot
    {
        public string mode;
        public float x;
        public float y;
    }

    [Serializable]
    private class TargetCollider
    {
        public string name;
        public string shape;
        public float x;
        public float y;
        public float width;
        public float height;
        public float radius;
    }

    [Serializable]
    private class Target
    {
        public string format;
        public string engine;
        public string engineVersion;
        public float pixelsPerUnit;
        public string spriteMode;
        public Pivot pivot;
        public Vec origin;
        public Anchor[] anchors;
        public TargetCollider[] colliders;
        public AnimationData animation;
    }

    [Serializable]
    private class Record
    {
        public string fixtureId;
        public string sourceCommit;
        public string fixtureHash;
        public string manifestHash;
        public string sourceAssetHash;
        public string outputFilesHash;
        public string sidecarHash;
        public string fixtureAssetHash;
        public string sourceAssetPath;
        public string fixtureProvenance;
    }

    [Serializable]
    private class Checks
    {
        public bool textureLoaded;
        public bool imageDecoded;
        public bool frameRegions;
        public bool frameOrder;
        public bool trimContentOffset;
        public bool pivot;
        public bool animation;
        public bool origin;
        public bool anchor;
        public bool scale;
        public bool colliders;
        public bool colliderMetadata;
    }

    [Serializable]
    private class Execution
    {
        public string os;
        public string platform;
        public string unityVersion;
        public bool batchMode;
    }

    [Serializable]
    private class Artifact
    {
        public string format;
        public string engine;
        public string version;
        public string engineReleaseCommit;
        public string status;
        public int importErrors;
        public int consoleErrors;
        public string fixtureId;
        public string sourceCommit;
        public string fixtureHash;
        public string manifestHash;
        public string sourceAssetHash;
        public string outputFilesHash;
        public string sidecarHash;
        public string fixtureAssetHash;
        public string sourceAssetPath;
        public string fixtureProvenance;
        public string[] materialTypes;
        public string[] acceptanceIds;
        public Execution execution;
        public Checks checks;
        public string[] failureMessages;
        public string generatedAt;
    }

    private static void Check(bool condition, string message)
    {
        if (condition)
        {
            return;
        }

        Failures.Add(message);
        Debug.LogError(message);
    }

    private static bool Approx(float left, float right)
    {
        return Mathf.Abs(left - right) < 0.001f;
    }

    private static bool Approx(Vec value, float x, float y)
    {
        return value != null && Approx(value.x, x) && Approx(value.y, y);
    }

    private static bool Approx(RectData value, float x, float y, float width, float height)
    {
        return value != null
            && Approx(value.x, x)
            && Approx(value.y, y)
            && Approx(value.width, width)
            && Approx(value.height, height);
    }

    private static T ReadJson<T>(string path) where T : class
    {
        if (!File.Exists(path))
        {
            Check(false, "missing JSON: " + path);
            return null;
        }

        T value = JsonUtility.FromJson<T>(File.ReadAllText(path));
        Check(value != null, "invalid JSON: " + path);
        return value;
    }

    private static Sprite FindSprite(Dictionary<string, Sprite> sprites, string name)
    {
        Sprite sprite;
        return sprites.TryGetValue(name, out sprite) ? sprite : null;
    }

    private static void WriteArtifact(
        Record record,
        Checks checks,
        string[] failures)
    {
        Artifact artifact = new Artifact
        {
            format = "chameleon-g19-runtime",
            engine = "unity",
            version = "6000.3.21f1",
            engineReleaseCommit = Application.unityVersion,
            status = Failures.Count == 0 ? "passed" : "failed",
            importErrors = Failures.Count,
            consoleErrors = Failures.Count,
            fixtureId = record == null ? null : record.fixtureId,
            sourceCommit = record == null ? null : record.sourceCommit,
            fixtureHash = record == null ? null : record.fixtureHash,
            manifestHash = record == null ? null : record.manifestHash,
            sourceAssetHash = record == null ? null : record.sourceAssetHash,
            outputFilesHash = record == null ? null : record.outputFilesHash,
            sidecarHash = record == null ? null : record.sidecarHash,
            fixtureAssetHash = record == null ? null : record.fixtureAssetHash,
            sourceAssetPath = record == null ? null : record.sourceAssetPath,
            fixtureProvenance = record == null ? null : record.fixtureProvenance,
            materialTypes = new[]
            {
                "sprite",
                "animation",
                "trim-content-offset",
                "origin-pivot",
                "anchor",
                "rect-collider",
                "circle-collider"
            },
            acceptanceIds = new[]
            {
                "G19-VERSION-PIN",
                "G19-FIXTURE-SCOPE",
                "G19-UNITY-IMPORT",
                "G19-METADATA",
                "G19-EVIDENCE",
                "G19-LABEL-SCOPE",
                "G19-NO-REGRESSION"
            },
            execution = new Execution
            {
                os = Environment.OSVersion.Platform.ToString(),
                platform = Application.platform.ToString(),
                unityVersion = Application.unityVersion,
                batchMode = Application.isBatchMode
            },
            checks = checks,
            failureMessages = failures,
            generatedAt = DateTime.UtcNow.ToString("o")
        };

        string directory = Path.GetDirectoryName(ResultPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(ResultPath, JsonUtility.ToJson(artifact, true));
        AssetDatabase.Refresh();
    }

    public static void Run()
    {
        Failures.Clear();
        Checks checks = new Checks();
        Manifest manifest = null;
        Target target = null;
        Record record = null;
        GameObject probe = null;
        GameObject anchorProbe = null;
        AnimationClip clip = null;

        try
        {
            string manifestPath = FixtureRoot + "/manifest.json";
            string targetPath = FixtureRoot + "/targets/unity-6000-3-21f1.json";
            string recordPath = FixtureRoot + "/verification/record.json";
            string sheetPath = FixtureRoot + "/textures/main.png";

            manifest = ReadJson<Manifest>(manifestPath);
            target = ReadJson<Target>(targetPath);
            record = ReadJson<Record>(recordPath);

            Check(manifest != null && manifest.profile == "g19-unity-candidate", "unexpected fixture profile");
            Check(target != null && target.engine == "unity", "target engine is not unity");
            Check(target != null && target.engineVersion == "6000.3.21f1", "target version is not pinned");
            Check(manifest != null && manifest.version == "0.1.0", "manifest version mismatch");
            Check(target != null && target.pixelsPerUnit == 1, "pixels-per-unit mismatch");
            Check(target != null && target.spriteMode == "multiple", "sprite mode mismatch");

            Frame[] frames = manifest == null ? null : manifest.frames;
            Check(frames != null && frames.Length == 2, "expected exactly two frames");
            if (frames != null && frames.Length == 2)
            {
                checks.frameRegions = Approx(frames[0].rect, 0, 0, 32, 32)
                    && Approx(frames[1].rect, 32, 0, 32, 32);
                Check(checks.frameRegions, "frame region metadata mismatch");
                checks.frameOrder = frames[0].name == "fixture-a"
                    && frames[1].name == "fixture-b";
                Check(checks.frameOrder, "frame order mismatch");
                checks.trimContentOffset = Approx(frames[0].contentOffset, 8, 8)
                    && Approx(frames[1].contentOffset, 6, 4);
                Check(checks.trimContentOffset, "trim/content offset mismatch");
            }

            AnimationData animation = manifest == null || manifest.animations == null
                ? null
                : manifest.animations.FirstOrDefault();
            Check(animation != null && animation.name == "loop", "animation name mismatch");
            Check(animation != null && animation.frames != null
                && animation.frames.SequenceEqual(new[] { "fixture-a", "fixture-b" }),
                "animation order metadata mismatch");
            Check(animation != null && Approx(animation.fps, 4), "animation fps mismatch");
            Check(animation != null && animation.loop, "animation loop metadata mismatch");

            AssetDatabase.ImportAsset(sheetPath, ImportAssetOptions.ForceSynchronousImport);
            TextureImporter importer = AssetImporter.GetAtPath(sheetPath) as TextureImporter;
            Check(importer != null, "Unity could not create a TextureImporter");
            Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(sheetPath);
            checks.textureLoaded = texture != null;
            checks.imageDecoded = texture != null && texture.width == 64 && texture.height == 32;
            Check(checks.textureLoaded, "Unity could not load the fixture texture");
            Check(checks.imageDecoded, "Unity texture dimensions mismatch");

            if (importer != null && frames != null && frames.Length == 2 && target != null)
            {
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Multiple;
                importer.spritePixelsPerUnit = target.pixelsPerUnit;
                importer.mipmapEnabled = false;
                importer.isReadable = true;
                importer.textureCompression = TextureImporterCompression.Uncompressed;
                importer.filterMode = FilterMode.Point;

                SpriteMetaData[] metadata = frames.Select(frame => new SpriteMetaData
                {
                    name = frame.name,
                    rect = new Rect(frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height),
                    alignment = (int)SpriteAlignment.Custom,
                    pivot = new Vector2(
                        target.pivot.x / frame.rect.width,
                        target.pivot.y / frame.rect.height),
                    border = Vector4.zero
                }).ToArray();
                importer.spritesheet = metadata;
                importer.SaveAndReimport();

                Dictionary<string, SpriteMetaData> applied = importer.spritesheet.ToDictionary(item => item.name);
                checks.pivot = applied.ContainsKey("fixture-a")
                    && applied.ContainsKey("fixture-b")
                    && Approx(applied["fixture-a"].pivot.x, target.pivot.x / 32f)
                    && Approx(applied["fixture-a"].pivot.y, target.pivot.y / 32f);
                Check(checks.pivot, "Unity pivot metadata mismatch");

                Sprite[] sprites = AssetDatabase.LoadAllAssetsAtPath(sheetPath)
                    .OfType<Sprite>()
                    .OrderBy(sprite => sprite.name)
                    .ToArray();
                Dictionary<string, Sprite> byName = sprites.ToDictionary(sprite => sprite.name);
                Check(sprites.Length == 2, "Unity did not import exactly two sprites");
                Check(byName.ContainsKey("fixture-a") && byName.ContainsKey("fixture-b"),
                    "Unity sprite names mismatch");
                if (byName.ContainsKey("fixture-a") && target.pivot != null)
                {
                    Check(Approx(byName["fixture-a"].pivot.x, target.pivot.x)
                        && Approx(byName["fixture-a"].pivot.y, target.pivot.y),
                        "Unity Sprite pivot value mismatch");
                }

                if (animation != null && byName.Count == 2)
                {
                    clip = new AnimationClip
                    {
                        name = animation.name,
                        frameRate = animation.fps
                    };
                    EditorCurveBinding binding = EditorCurveBinding.PPtrCurve(
                        string.Empty,
                        typeof(SpriteRenderer),
                        "m_Sprite");
                    ObjectReferenceKeyframe[] keys = animation.frames
                        .Select((name, index) => new ObjectReferenceKeyframe
                        {
                            time = index / animation.fps,
                            value = FindSprite(byName, name)
                        })
                        .ToArray();
                    AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);
                    ObjectReferenceKeyframe[] roundTrip =
                        AnimationUtility.GetObjectReferenceCurve(clip, binding);
                    checks.animation = roundTrip != null
                        && roundTrip.Length == 2
                        && roundTrip[0].value == byName["fixture-a"]
                        && roundTrip[1].value == byName["fixture-b"]
                        && Approx(clip.frameRate, 4);
                    AnimationClipSettings clipSettings =
                        AnimationUtility.GetAnimationClipSettings(clip);
                    clipSettings.loopTime = animation.loop;
                    AnimationUtility.SetAnimationClipSettings(clip, clipSettings);
                    checks.animation = checks.animation
                        && AnimationUtility.GetAnimationClipSettings(clip).loopTime;
                    Check(checks.animation, "Unity animation import/order mismatch");
                }

                probe = new GameObject("G19UnityRuntimeProbe");
                SpriteRenderer renderer = probe.AddComponent<SpriteRenderer>();
                renderer.sprite = byName["fixture-a"];
                probe.transform.localScale = Vector3.one * manifest.scale;
                probe.transform.position = new Vector3(target.origin.x, target.origin.y, 0);
                checks.scale = probe.transform.localScale == Vector3.one * manifest.scale;
                checks.origin = manifest.origin != null
                    && target.origin != null
                    && Approx(manifest.origin.x, target.origin.x * manifest.scale)
                    && Approx(manifest.origin.y, target.origin.y * manifest.scale);
                Check(checks.scale, "Unity scale mismatch");
                Check(checks.origin, "Unity origin metadata mismatch");

                anchorProbe = new GameObject("G19UnityAnchorProbe");
                anchorProbe.transform.SetParent(probe.transform, false);
                anchorProbe.transform.localPosition = Vector3.zero;
                Anchor anchor = manifest.anchors == null ? null : manifest.anchors.FirstOrDefault();
                checks.anchor = anchor != null
                    && target.anchors != null
                    && target.anchors.Length > 0
                    && Approx(anchor.x, target.anchors[0].x * manifest.scale)
                    && Approx(anchor.y, target.anchors[0].y * manifest.scale)
                    && anchorProbe.transform.localPosition == Vector3.zero;
                Check(checks.anchor, "Unity anchor metadata mismatch");

                TargetCollider rect = target.colliders == null
                    ? null
                    : target.colliders.FirstOrDefault(item => item.shape == "rect");
                TargetCollider circle = target.colliders == null
                    ? null
                    : target.colliders.FirstOrDefault(item => item.shape == "circle");
                BoxCollider2D box = probe.AddComponent<BoxCollider2D>();
                box.offset = new Vector2(rect.x, rect.y);
                box.size = new Vector2(rect.width, rect.height);
                CircleCollider2D circleCollider = probe.AddComponent<CircleCollider2D>();
                circleCollider.offset = new Vector2(circle.x, circle.y);
                circleCollider.radius = circle.radius;
                checks.colliderMetadata = rect != null && circle != null
                    && Approx(rect.x, 2) && Approx(rect.y, 3)
                    && Approx(rect.width, 12) && Approx(rect.height, 14)
                    && Approx(circle.x, 10) && Approx(circle.y, 10)
                    && Approx(circle.radius, 7);
                checks.colliders = checks.colliderMetadata
                    && box.size == new Vector2(12, 14)
                    && box.offset == new Vector2(2, 3)
                    && Approx(circleCollider.radius, 7)
                    && circleCollider.offset == new Vector2(10, 10);
                Check(checks.colliderMetadata, "Unity collider metadata mismatch");
                Check(checks.colliders, "Unity collider assignment mismatch");
            }
        }
        catch (Exception exception)
        {
            Failures.Add("exception: " + exception.GetType().Name + ": " + exception.Message);
            Debug.LogException(exception);
        }
        finally
        {
            if (anchorProbe != null)
            {
                UnityEngine.Object.DestroyImmediate(anchorProbe);
            }

            if (probe != null)
            {
                UnityEngine.Object.DestroyImmediate(probe);
            }

            if (clip != null)
            {
                UnityEngine.Object.DestroyImmediate(clip);
            }
        }

        WriteArtifact(record, checks, Failures.ToArray());
        if (Failures.Count > 0)
        {
            throw new InvalidOperationException(
                "G19 Unity runtime gate failed: " + string.Join("; ", Failures));
        }
    }
}
