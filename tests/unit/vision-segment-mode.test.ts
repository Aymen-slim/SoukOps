import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";

const segmentImageMock = vi.hoisted(() => vi.fn());
const embedImagesMock = vi.hoisted(() => vi.fn());
const sparkJsonMock = vi.hoisted(() => vi.fn());
const traceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/sam", () => ({
  segmentImage: segmentImageMock,
  segmentImageAtPoint: vi.fn(),
  samConfigured: () => true,
}));
vi.mock("@/lib/ai/embeddings", () => ({
  embedImages: embedImagesMock,
  embedTexts: vi.fn(),
  PE_DIMENSIONS: 1024,
}));
vi.mock("@/lib/ai/spark", () => ({ sparkJson: sparkJsonMock }));
vi.mock("@/lib/ai/trace", () => ({ trace: traceMock, traced: async (_m: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/media/crop", () => ({
  imageSize: async () => ({ width: 200, height: 200 }),
  clampBox: (b: unknown) => b,
  expandBox: (b: unknown) => b,
  cropToBox: async (buf: Buffer) => buf,
  drawNumberedBoxes: async (buf: Buffer) => buf,
}));

import { resolveScreenshot } from "@/lib/pipeline/vision";

function mockSupabase(distance: number) {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: [{ product_image_id: "img1", product_id: "p1", distance }],
      error: null,
    }),
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data:
            table === "products"
              ? [{ id: "p1", name: "Sweat jaune", category_phrase: "sweatshirt", price_millimes: 120_000, floor_millimes: 105_000, stock: 5, ai_enabled: true }]
              : [{ id: "img1", crop_path: "c.png", source_path: "s.jpg" }],
          error: null,
        }),
      })),
    })),
  } as unknown as Parameters<typeof resolveScreenshot>[0]["supabase"];
}

const OLD_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  embedImagesMock.mockResolvedValue([new Array(1024).fill(0.1)]);
  sparkJsonMock.mockRejectedValue(new Error("skip rerank"));
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  resetEnvCache();
});

describe("VISION_SEGMENT_MODE comparison switch", () => {
  it("never skips SAM in mode=never and logs vision.sam_skipped", async () => {
    process.env.VISION_SEGMENT_MODE = "never";
    resetEnvCache();

    const res = await resolveScreenshot({
      supabase: mockSupabase(0.08),
      merchantId: "m1",
      image: Buffer.from("img"),
      mime: "image/jpeg",
      samNounPhrase: "hoodie",
      conversationId: "c1",
    });

    expect(segmentImageMock).not.toHaveBeenCalled();
    expect(res.status).toBe("matched");
    expect(traceMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "vision.sam_skipped", detail: expect.objectContaining({ reason: "mode_never" }) }),
    );
  });

  it("skips SAM in mode=auto when direct multimodal embedding hits >= 0.85", async () => {
    process.env.VISION_SEGMENT_MODE = "auto";
    resetEnvCache();

    const res = await resolveScreenshot({
      supabase: mockSupabase(0.05),
      merchantId: "m1",
      image: Buffer.from("img"),
      mime: "image/jpeg",
      samNounPhrase: "hoodie",
      conversationId: "c2",
    });

    expect(segmentImageMock).not.toHaveBeenCalled();
    expect(res.status).toBe("matched");
    expect(traceMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "vision.sam_skipped", detail: expect.objectContaining({ reason: "auto_confident_direct" }) }),
    );
  });

  it("falls back to SAM in mode=auto when direct embedding is below propose threshold", async () => {
    process.env.VISION_SEGMENT_MODE = "auto";
    resetEnvCache();
    segmentImageMock.mockResolvedValue({
      objects: [{ objectId: "0", box: { left: 10, top: 10, right: 100, bottom: 100 }, mask: { width: 0, height: 0, encoding: "", payload: "" }, rasterBase64: "" }],
      diagnostics: [],
    });

    const res = await resolveScreenshot({
      supabase: mockSupabase(0.3), // similarity 0.70 < 0.85 propose gate
      merchantId: "m1",
      image: Buffer.from("img"),
      mime: "image/jpeg",
      samNounPhrase: "hoodie",
    });

    expect(segmentImageMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("matched");
  });
});
