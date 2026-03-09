/**
 * Shared video URL utilities — used by both server validation and client embed rendering.
 */

/** Extract a YouTube/Vimeo embed URL from a user-submitted video link. Returns null if unsupported. */
export function getEmbedUrl(url: string): string | null {
  // YouTube (youtube.com/watch, youtube.com/embed, youtu.be short links)
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) return `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`;

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return null;
}

/** Check if a URL is a supported video provider (YouTube or Vimeo). */
export function isSupportedVideoUrl(url: string): boolean {
  return getEmbedUrl(url) !== null;
}
