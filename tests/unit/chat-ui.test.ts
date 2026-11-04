import { describe, expect, it } from "vitest";
import { formatClock, isNearBottom, mediaExtFromMime, sameMessages, stabilizeMediaUrls } from "@/lib/sim/chat-ui";

const msg = (id: string, mediaUrl: string | null = null) => ({
  id,
  direction: "in",
  kind: "audio",
  body: null,
  mediaUrl,
  created_at: "2026-11-03T20:00:00.000Z",
});

describe("chat scroll pinning", () => {
  it("follows new messages only near the bottom", () => {
    expect(isNearBottom(860, 400, 1400)).toBe(true); // 140px from bottom
    expect(isNearBottom(100, 400, 1400)).toBe(false); // reading history
    expect(isNearBottom(0, 400, 380)).toBe(true); // shorter than viewport
  });
});

describe("poll diffing (voice playback + scroll stability)", () => {
  it("treats a fresh signed URL as the same message", () => {
    expect(sameMessages([msg("1", "https://x/a?token=1")], [msg("1", "https://x/a?token=2")])).toBe(true);
    expect(sameMessages([msg("1")], [msg("1"), msg("2")])).toBe(false);
  });

  it("keeps the first signed URL per message so playback never remounts", () => {
    const cache = new Map<string, string>();
    const first = stabilizeMediaUrls(cache, [msg("1", "https://x/a?token=1")]);
    const second = stabilizeMediaUrls(cache, [msg("1", "https://x/a?token=2")]);
    expect(first[0]?.mediaUrl).toBe("https://x/a?token=1");
    expect(second[0]?.mediaUrl).toBe("https://x/a?token=1");
  });
});

describe("product image + voice helpers", () => {
  it("maps fetched image mime types to upload extensions", () => {
    expect(mediaExtFromMime("image/png")).toBe("png");
    expect(mediaExtFromMime("image/webp")).toBe("webp");
    expect(mediaExtFromMime("image/jpeg")).toBe("jpg");
  });

  it("formats voice durations", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(Number.NaN)).toBe("0:00");
  });
});
