/** Pure helpers for the demo chat: scroll pinning, message diffing, media types. */

export interface ChatMessageLike {
  id: string;
  direction: string;
  kind: string;
  body: string | null;
  mediaUrl?: string | null;
  created_at: string;
}

/** True when the scroller is close enough to the bottom to follow new messages. */
export function isNearBottom(scrollTop: number, clientHeight: number, scrollHeight: number, thresholdPx = 140): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= thresholdPx;
}

/** Signed URLs change on every poll; identity is id + content, never the URL. */
export function sameMessages(a: ChatMessageLike[], b: ChatMessageLike[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((m, i) => {
    const n = b[i];
    return n !== undefined && m.id === n.id && m.kind === n.kind && m.body === n.body && m.direction === n.direction;
  });
}

/**
 * Reuse the first signed URL seen per message id so a playing voice note is
 * never re-mounted with a fresh URL on the next poll.
 */
export function stabilizeMediaUrls<T extends ChatMessageLike>(cache: Map<string, string>, messages: T[]): T[] {
  return messages.map((m) => {
    if (!m.mediaUrl) return m;
    const cached = cache.get(m.id);
    if (cached) return cached === m.mediaUrl ? m : { ...m, mediaUrl: cached };
    cache.set(m.id, m.mediaUrl);
    return m;
  });
}

const MOJIBAKE_FIXES: Array<[string, string]> = [
  ["ðŸ‘‡", "👇"],
  ["â€¢", "•"],
  ["â€”", "—"],
  ["Ã©", "é"],
  ["Ã¨", "è"],
  ["Â·", "·"],
  ["ØŒ", "،"],
];

/** Repair UTF-8 text that was decoded as Latin-1 (Ã©, â€¢, ðŸ‘‡…) — incl. rows already stored. */
export function repairMojibake(text: string): string {
  let out = text;
  for (const [bad, good] of MOJIBAKE_FIXES) out = out.split(bad).join(good);
  return out;
}

export function mediaExtFromMime(mime: string): "jpg" | "png" | "webp" {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
