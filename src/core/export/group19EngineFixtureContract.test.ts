import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAssetForPersistence } from "../schema/validate";

type Fixture = {
  root: string;
  engine: "unity" | "godot";
  version: string;
  targetFile: string;
};

type PackageManifest = {
  engine: string;
  engineVersion: string;
  status: string;
  files: Record<string, string>;
};

type DistributionManifest = {
  profile: string;
  pages: Array<{ path: string }>;
  frames: Array<{
    name: string;
    contentOffset: Record<string, number>;
  }>;
  animations: Array<{
    name: string;
    frames: string[];
    fps: number;
    loop: boolean;
  }>;
  integrity: {
    algorithm: string;
    manifestHash: string;
  };
};

type Integrity = {
  algorithm: string;
  entries: Array<{ path: string; sha256: string }>;
  excluded: string[];
  groups: {
    source: string[];
    output: string[];
    sidecar: string[];
  };
};

type RecordFile = {
  label: string;
  target: { engine: string; version: string };
  fixtureHash: string;
  manifestHash: string;
  runtime: {
    status: string;
    importErrors: null;
    artifact: null;
  };
  evidenceRefs: string[];
};

const fixtures: Fixture[] = [
  {
    root: "public/engine-fixtures/unity-6000-3-21f1",
    engine: "unity",
    version: "6000.3.21f1",
    targetFile: "targets/unity-6000-3-21f1.json",
  },
  {
    root: "public/engine-fixtures/godot-4-7-1-stable",
    engine: "godot",
    version: "4.7.1-stable",
    targetFile: "targets/godot-4-7-1-stable.json",
  },
];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

describe("Group 19 engine fixture contract", () => {
  for (const fixture of fixtures) {
    it(
      fixture.engine + " fixture is separated and unverified before runtime",
      async () => {
        const root = path.resolve(process.cwd(), fixture.root);
        const pkg = await readJson<PackageManifest>(
          path.join(root, "package-manifest.json"),
        );
        const manifest = await readJson<DistributionManifest>(
          path.join(root, "manifest.json"),
        );
        const integrity = await readJson<Integrity>(
          path.join(root, "integrity/files.json"),
        );
        const record = await readJson<RecordFile>(
          path.join(root, "verification/record.json"),
        );
        const asset = await readJson<Record<string, unknown>>(
          path.join(root, "asset.json"),
        );

        const assetResult = validateAssetForPersistence(asset);
        expect(assetResult.valid).toBe(true);
        expect(pkg.engine).toBe(fixture.engine);
        expect(pkg.engineVersion).toBe(fixture.version);
        expect(pkg.status).toBe("candidate");
        expect(JSON.stringify(pkg)).not.toContain("latest");
        expect(manifest.profile).toBe("g19-" + fixture.engine + "-candidate");
        expect(manifest.pages).toHaveLength(1);
        expect(manifest.frames.map((frame) => frame.name)).toEqual([
          "fixture-a",
          "fixture-b",
        ]);
        expect(manifest.animations[0]).toMatchObject({
          name: "loop",
          frames: ["fixture-a", "fixture-b"],
          fps: 4,
          loop: true,
        });
        expect(manifest.frames[0].contentOffset).toEqual({ x: 0, y: 0 });
        expect(manifest.integrity.algorithm).toBe("SHA-256");

        const unsigned = { ...manifest };
        delete (unsigned as { integrity?: DistributionManifest["integrity"] })
          .integrity;
        expect(manifest.integrity.manifestHash).toBe(
          sha256(JSON.stringify(canonicalize(unsigned))),
        );

        expect(record.label).toBe("candidate");
        expect(record.target).toEqual({
          engine: fixture.engine,
          version: fixture.version,
        });
        expect(record.runtime).toEqual({
          status: "not-run",
          importErrors: null,
          artifact: null,
        });
        expect(record.evidenceRefs).toEqual([]);
        expect(record.fixtureHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(record.manifestHash).toBe(
          "sha256:" + manifest.integrity.manifestHash,
        );

        expect(integrity.algorithm).toBe("SHA-256");
        expect(integrity.excluded).toEqual([
          "integrity/files.json",
          "verification/record.json",
        ]);
        expect(integrity.groups.source).toEqual(["asset.json"]);
        expect(integrity.groups.output).toEqual([
          "manifest.json",
          "textures/main.png",
        ]);
        expect(integrity.groups.sidecar).toEqual([fixture.targetFile]);

        const sortedPaths = integrity.entries.map((entry) => entry.path);
        expect(sortedPaths).toEqual(
          [...sortedPaths].sort((a, b) => a.localeCompare(b)),
        );

        for (const entry of integrity.entries) {
          const file = path.join(root, entry.path);
          await access(file);
          const bytes = await readFile(file);
          expect(bytes.byteLength).toBeGreaterThan(0);
          expect(sha256(bytes)).toBe(entry.sha256);
        }

        expect(asset.id).toContain("g19-");
        const textures = asset.textures as Array<Record<string, unknown>>;
        expect(textures[0].mimeType).toBe("image/png");
        expect(textures[0].path).toBe("textures/main.png");
      },
    );
  }
});
