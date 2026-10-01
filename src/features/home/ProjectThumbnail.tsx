import { useEffect, useState } from 'react';
import { blobKeyFor } from '../../core/images/importImage';
import { listProjectAssets, loadBlob } from '../../core/storage';

export function ProjectThumbnail({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const assets = await listProjectAssets(projectId);
        const asset = assets[0];
        const texture = asset?.textures.find((entry) => entry.kind === 'thumbnail');
        if (!asset || !texture) return;
        const blob = await loadBlob(blobKeyFor(asset.id, texture.path));
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        // A missing thumbnail must not prevent opening or recovering a project.
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId]);
  return (
    <span className="home-thumbnail" aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span>▧</span>}
    </span>
  );
}
