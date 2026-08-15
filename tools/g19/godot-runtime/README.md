# Group 19 Godot runtime fixture

This directory contains only the small runner used by CI. The actual candidate
fixture is copied from \`public/engine-fixtures/godot-4-7-1-stable\` during the
workflow, so the package closure and its hashes remain unchanged.

The runner loads the PNG through Godot 4.7.1-stable, builds an
\`AtlasTexture\`, \`SpriteFrames\`, \`AnimatedSprite2D\`, and collision shapes,
then writes a JSON artifact. It checks the fixed frame order, animation,
trim/content offsets, origin, anchor, scale, rectangle collider, and circle
collider. It does not promote the repository record to \`verified\`; that
requires review of the uploaded artifact and a separate Unity run.
