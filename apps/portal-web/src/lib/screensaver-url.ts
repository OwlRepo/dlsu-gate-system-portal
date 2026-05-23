/**
 * Normalizes screensaver image URLs from the API so they use the same
 * reachable host/protocol as NEXT_PUBLIC_API_URL.
 */
export function transformScreensaverImageUrl(url: string): string {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL;
    if (!apiBase) return url;

    const apiUrl = new URL(apiBase);
    const imageUrl = url.startsWith("http")
      ? new URL(url)
      : new URL(url, apiBase);

    imageUrl.hostname = apiUrl.hostname;
    imageUrl.protocol = apiUrl.protocol;

    return imageUrl.toString();
  } catch {
    return url;
  }
}
