/**
 * Which reel pages may be indexed: exactly ONE watch page per video.
 *
 * Search Console (Video indexing, Nov 2026) left ~67 reel videos at "Video not
 * processed yet" and several reel pages at "Video isn't on a watch page". The
 * pages and files were fine (VideoObject with contentUrl + thumbnailUrl, one
 * <video>, files fetchable). What was wrong was the set of pages:
 *
 *   - 98 indexable reel pages carried only 78 distinct videos. Re-shares and
 *     re-uploads point at ANOTHER reel's Storage file, so up to 3 pages each
 *     claimed the same video and Google indexes a video once, on one page.
 *   - Internal test uploads ("test-3", "test reels") were in the sitemap.
 *
 * Pure functions, no Firebase imports, so scripts/tests can exercise them.
 */

export interface DedupeReel {
  id: string;
  title: string;
  videoUrl: string;
  createdAtMs: number;
}

/**
 * The Storage folder a reel's video lives in — the identity of "the same video".
 *
 * videoUrl is .../o/reels%2F{folder}%2Fvideo_optimized.mp4?alt=media&token=…
 * A re-shared reel reuses the original's folder, and video.mp4 (raw upload) vs
 * video_optimized.mp4 in one folder are the same clip, so the folder — not the
 * file name or the token — is the key. Anything not in that shape falls back
 * to the URL without its query string.
 */
export function reelVideoKey(videoUrl: string): string {
  const m = videoUrl.match(/\/o\/([^?#]+)/);
  if (m) {
    let path: string;
    try {
      path = decodeURIComponent(m[1]);
    } catch {
      path = m[1];
    }
    const parts = path.split("/");
    if (parts.length >= 3 && parts[0] === "reels" && parts[1]) return `reels/${parts[1]}`;
    return path;
  }
  return videoUrl.split(/[?#]/)[0];
}

/** Internal test uploads ("test-3", "Test reels"): never indexed. */
export function isTestReel(r: Pick<DedupeReel, "title">): boolean {
  return /^\s*test\b/i.test(r.title);
}

/**
 * The one indexable reel among reels that share a video, or null when they
 * are all test reels.
 *   1. never a test reel;
 *   2. the reel that owns the Storage folder (the original upload);
 *   3. otherwise the oldest, then the lowest id — stable across renders, so
 *      the sitemap and the page always agree.
 */
export function pickPrimaryReel<T extends DedupeReel>(group: T[]): T | null {
  const candidates = group.filter((r) => !isTestReel(r));
  if (candidates.length === 0) return null;
  const owner = candidates.find((r) => reelVideoKey(r.videoUrl) === `reels/${r.id}`);
  if (owner) return owner;
  return [...candidates].sort(
    (a, b) => (a.createdAtMs || Infinity) - (b.createdAtMs || Infinity) || a.id.localeCompare(b.id),
  )[0];
}

/** Ids of the reels that may be indexed and listed in the sitemap. */
export function indexableReelIds<T extends DedupeReel>(reels: T[]): Set<string> {
  const groups = new Map<string, T[]>();
  for (const r of reels) {
    const key = reelVideoKey(r.videoUrl);
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const ids = new Set<string>();
  groups.forEach((g) => {
    const primary = pickPrimaryReel(g);
    if (primary) ids.add(primary.id);
  });
  return ids;
}

/**
 * Should this reel's page be indexed? `all` is every listable reel; the reel
 * itself is added if it is missing (older than the fetched window), so a reel
 * is never noindexed just because the list was short.
 */
export function isReelIndexable<T extends DedupeReel>(reel: T, all: T[]): boolean {
  if (isTestReel(reel)) return false;
  const key = reelVideoKey(reel.videoUrl);
  const group = all.filter((r) => r.id !== reel.id && reelVideoKey(r.videoUrl) === key);
  return pickPrimaryReel([reel, ...group])?.id === reel.id;
}
