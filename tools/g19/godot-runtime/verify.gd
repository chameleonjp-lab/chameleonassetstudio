extends SceneTree

const FIXTURE_ROOT := "res://fixture"
const RESULT_DIR := "res://test-results"

var failures: Array[String] = []

func _init() -> void:
    call_deferred("_run")

func _fail(message: String) -> void:
    failures.append(message)
    push_error(message)

func _check(condition: bool, message: String) -> void:
    if not condition:
        _fail(message)

func _read_json(file_path: String) -> Dictionary:
    if not FileAccess.file_exists(file_path):
        _fail("missing JSON: " + file_path)
        return {}
    var file := FileAccess.open(file_path, FileAccess.READ)
    if file == null:
        _fail("cannot open JSON: " + file_path)
        return {}
    var parsed = JSON.parse_string(file.get_as_text())
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("JSON is not an object: " + file_path)
        return {}
    return parsed

func _find_collider(colliders: Array, shape_name: String) -> Dictionary:
    for collider in colliders:
        if typeof(collider) == TYPE_DICTIONARY and collider.get("shape") == shape_name:
            return collider
    return {}

func _vector_matches(value, expected_x: float, expected_y: float) -> bool:
    if typeof(value) != TYPE_DICTIONARY:
        return false
    return is_equal_approx(float(value.get("x", -999999.0)), expected_x) and is_equal_approx(float(value.get("y", -999999.0)), expected_y)

func _rect_matches(value, expected_x: float, expected_y: float, expected_width: float, expected_height: float) -> bool:
    if typeof(value) != TYPE_DICTIONARY:
        return false
    return _vector_matches(value, expected_x, expected_y) and is_equal_approx(float(value.get("width", -999999.0)), expected_width) and is_equal_approx(float(value.get("height", -999999.0)), expected_height)

func _run() -> void:
    var manifest := _read_json(FIXTURE_ROOT + "/manifest.json")
    var target := _read_json(FIXTURE_ROOT + "/targets/godot-4-7-1-stable.json")
    var record := _read_json(FIXTURE_ROOT + "/verification/record.json")
    var package_manifest := _read_json(FIXTURE_ROOT + "/package-manifest.json")

    _check(manifest.get("profile") == "g19-godot-candidate", "unexpected fixture profile")
    _check(target.get("engine") == "godot", "target engine is not godot")
    _check(target.get("engineVersion") == "4.7.1-stable", "target version is not pinned")
    _check(package_manifest.get("engineVersion") == "4.7.1-stable", "package version is not pinned")

    var frames: Array = manifest.get("frames", [])
    _check(frames.size() == 2, "expected exactly two frames")
    if frames.size() >= 2:
        _check(frames[0].get("name") == "fixture-a", "frame 0 order mismatch")
        _check(frames[1].get("name") == "fixture-b", "frame 1 order mismatch")
        _check(_rect_matches(frames[0].get("rect"), 0, 0, 32, 32), "frame 0 rect mismatch")
        _check(_rect_matches(frames[1].get("rect"), 32, 0, 32, 32), "frame 1 rect mismatch")
        _check(_vector_matches(frames[0].get("contentOffset"), 8, 8), "frame 0 trim offset mismatch")
        _check(_vector_matches(frames[1].get("contentOffset"), 6, 4), "frame 1 trim offset mismatch")

    var animations: Array = manifest.get("animations", [])
    _check(animations.size() == 1, "expected exactly one animation")
    var animation: Dictionary = animations[0] if animations.size() > 0 else {}
    _check(animation.get("name") == "loop", "animation name mismatch")
    _check(animation.get("frames") == ["fixture-a", "fixture-b"], "animation order mismatch")
    _check(animation.get("fps") == 4, "animation fps mismatch")
    _check(animation.get("loop") == true, "animation loop flag mismatch")

    var texture = load(FIXTURE_ROOT + "/textures/main.png") as Texture2D
    _check(texture != null, "Godot could not load the fixture texture")
    var image = texture.get_image() if texture != null else null
    _check(image != null, "Godot returned no image for the fixture texture")
    if image != null:
        _check(image.get_width() == 64 and image.get_height() == 32, "texture dimensions mismatch")
        var frame_a_image := image.get_region(Rect2i(0, 0, 32, 32))
        var frame_b_image := image.get_region(Rect2i(32, 0, 32, 32))
        _check(frame_a_image.get_width() == 32 and frame_a_image.get_height() == 32, "frame 0 region decode failed")
        _check(frame_b_image.get_width() == 32 and frame_b_image.get_height() == 32, "frame 1 region decode failed")

    var atlas_a := AtlasTexture.new()
    atlas_a.atlas = texture
    atlas_a.region = Rect2(0, 0, 32, 32)
    var atlas_b := AtlasTexture.new()
    atlas_b.atlas = texture
    atlas_b.region = Rect2(32, 0, 32, 32)

    var sprite_frames := SpriteFrames.new()
    sprite_frames.add_animation("loop")
    sprite_frames.set_animation_speed("loop", 4.0)
    sprite_frames.set_animation_loop("loop", true)
    sprite_frames.add_frame("loop", atlas_a)
    sprite_frames.add_frame("loop", atlas_b)
    _check(sprite_frames.get_frame_count("loop") == 2, "SpriteFrames frame count mismatch")
    _check(sprite_frames.get_animation_speed("loop") == 4.0, "SpriteFrames fps mismatch")
    _check(sprite_frames.get_animation_loop("loop"), "SpriteFrames loop flag mismatch")
    var stored_a := sprite_frames.get_frame_texture("loop", 0) as AtlasTexture
    var stored_b := sprite_frames.get_frame_texture("loop", 1) as AtlasTexture
    _check(stored_a != null and stored_a.region == Rect2(0, 0, 32, 32), "SpriteFrames frame 0 region mismatch")
    _check(stored_b != null and stored_b.region == Rect2(32, 0, 32, 32), "SpriteFrames frame 1 region mismatch")

    var animated := AnimatedSprite2D.new()
    animated.sprite_frames = sprite_frames
    animated.animation = "loop"
    _check(animated.sprite_frames == sprite_frames, "AnimatedSprite2D did not receive SpriteFrames")
    _check(animated.animation == "loop", "AnimatedSprite2D animation mismatch")

    var origin: Dictionary = manifest.get("origin", {})
    var anchors: Array = manifest.get("anchors", [])
    _check(_vector_matches(origin, 20, 36), "origin mismatch")
    _check(anchors.size() == 1, "anchor count mismatch")
    if anchors.size() > 0:
        _check(_vector_matches(anchors[0], 20, 20), "anchor mismatch")

    var sprite := Sprite2D.new()
    sprite.texture = atlas_a
    sprite.scale = Vector2(float(manifest.get("scale", 0)), float(manifest.get("scale", 0)))
    sprite.position = Vector2(float(origin.get("x", 0)), float(origin.get("y", 0)))
    sprite.centered = false
    _check(sprite.texture == atlas_a, "Sprite2D texture assignment failed")
    _check(sprite.scale == Vector2(2, 2), "Sprite2D scale mismatch")
    _check(sprite.position == Vector2(20, 36), "Sprite2D origin mismatch")

    var colliders: Array = manifest.get("colliders", [])
    var rect_meta := _find_collider(colliders, "rect")
    var circle_meta := _find_collider(colliders, "circle")
    var rect_shape := RectangleShape2D.new()
    rect_shape.size = Vector2(float(rect_meta.get("rect", {}).get("width", 0)), float(rect_meta.get("rect", {}).get("height", 0)))
    var circle_shape := CircleShape2D.new()
    circle_shape.radius = float(circle_meta.get("circle", {}).get("radius", 0))
    var rect_node := CollisionShape2D.new()
    rect_node.shape = rect_shape
    var circle_node := CollisionShape2D.new()
    circle_node.shape = circle_shape
    _check(_rect_matches(rect_meta.get("rect", {}), 4, 6, 24, 28), "rectangle collider metadata mismatch")
    _check(rect_shape.size == Vector2(24, 28), "rectangle collider size mismatch")
    _check(_vector_matches(circle_meta.get("circle", {}), 20, 20) and is_equal_approx(float(circle_meta.get("circle", {}).get("radius", 0)), 14.0), "circle collider metadata mismatch")
    _check(circle_shape.radius == 14.0, "circle collider radius mismatch")
    _check(rect_node.shape == rect_shape and circle_node.shape == circle_shape, "collision shape assignment failed")

    var checks := {
        "textureLoaded": texture != null,
        "imageDecoded": image != null,
        "frameOrder": frames.size() == 2 and frames[0].get("name") == "fixture-a" and frames[1].get("name") == "fixture-b",
        "animation": sprite_frames.get_frame_count("loop") == 2 and sprite_frames.get_animation_speed("loop") == 4.0 and sprite_frames.get_animation_loop("loop"),
        "originAnchorScale": sprite.position == Vector2(20, 36) and sprite.scale == Vector2(2, 2),
        "colliders": rect_shape.size == Vector2(24, 28) and circle_shape.radius == 14.0
    }

    # Release temporary engine objects before Godot exits so the log reflects the
    # import/runtime result rather than runner-owned leaked nodes.
    rect_node.shape = null
    circle_node.shape = null
    animated.sprite_frames = null
    sprite.texture = null
    sprite_frames.remove_animation("loop")
    atlas_a.atlas = null
    atlas_b.atlas = null
    rect_node.free()
    circle_node.free()
    animated.free()
    sprite.free()
    texture = null
    image = null

    var artifact := {
        "format": "chameleon-g19-runtime",
        "engine": "godot",
        "version": "4.7.1-stable",
        "engineReleaseCommit": OS.get_environment("G19_GODOT_COMMIT"),
        "status": "passed" if failures.is_empty() else "failed",
        "importErrors": failures.size(),
        "sourceCommit": record.get("sourceCommit"),
        "fixtureHash": record.get("fixtureHash"),
        "manifestHash": record.get("manifestHash"),
        "checks": checks,
        "failureMessages": failures,
        "generatedAt": Time.get_datetime_string_from_system(true)
    }

    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(RESULT_DIR))
    var output := FileAccess.open(RESULT_DIR + "/g19-godot-runtime.json", FileAccess.WRITE)
    if output == null:
        push_error("cannot write runtime artifact")
        quit(1)
        return
    output.store_string(JSON.stringify(artifact))
    output.close()
    quit(1 if failures.size() > 0 else 0)
