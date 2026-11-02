import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildButtonsPayload,
  buildTextPayload,
  buildTokenExchangeUrl,
  parseEmbeddedSignupMessage,
  parseWebhookPayload,
  truncateButtonTitle,
  verifyWebhookSignature,
} from "@/lib/channels/whatsapp";
import { encodeWav16kMono, resampleTo16k } from "@/lib/channels/oggToWav";

function payloadWith(messages: unknown[]) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: "21622123456", profile: { name: "Aymen" } }],
              messages,
            },
          },
        ],
      },
    ],
  };
}

describe("WhatsApp webhook parsing", () => {
  it("extracts text, button, location, image and voice messages", () => {
    const parsed = parseWebhookPayload(
      payloadWith([
        { from: "21622123456", id: "wamid.1", type: "text", text: { body: "b9addech el sweat?" } },
        {
          from: "21622123456",
          id: "wamid.2",
          type: "interactive",
          interactive: { type: "button_reply", button_reply: { id: "akked", title: "Akked" } },
        },
        { from: "21622123456", id: "wamid.3", type: "location", location: { latitude: 36.8, longitude: 10.18 } },
        { from: "21622123456", id: "wamid.4", type: "image", image: { id: "media-1", caption: "hedha" } },
        { from: "21622123456", id: "wamid.5", type: "audio", audio: { id: "media-2" } },
      ]),
    );
    expect(parsed.map((m) => m.kind)).toEqual(["text", "button", "location", "image", "audio"]);
    expect(parsed[0]).toMatchObject({ externalId: "wamid.1", waId: "21622123456", profileName: "Aymen", body: "b9addech el sweat?" });
    expect(parsed[1].body).toBe("Akked");
    expect(parsed[2].body).toBe("location:36.8,10.18");
    expect(parsed[3]).toMatchObject({ mediaId: "media-1", body: "hedha" });
    expect(parsed[4].mediaId).toBe("media-2");
  });

  it("ignores statuses and junk without throwing", () => {
    expect(parseWebhookPayload({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.x" }] } }] }] })).toEqual([]);
    expect(parseWebhookPayload(null)).toEqual([]);
    expect(parseWebhookPayload(payloadWith([{ nope: true }]))).toEqual([]);
  });
});

describe("WhatsApp signature + payload builders", () => {
  it("verifies X-Hub-Signature-256 and accepts when no secret is set", () => {
    const raw = JSON.stringify({ hello: "world" });
    const secret = "app-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifyWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(raw, signature, "wrong")).toBe(false);
    expect(verifyWebhookSignature(raw, null, secret)).toBe(false);
    expect(verifyWebhookSignature(raw, null, undefined)).toBe(true);
  });

  it("builds Graph payloads, capping buttons at 3 and titles at 20 chars", () => {
    expect(buildTextPayload("21622123456", "salut")).toMatchObject({ to: "21622123456", type: "text" });
    const buttons = buildButtonsPayload("21622123456", "Akked?", [
      { id: "a", title: "Akked" },
      { id: "b", title: "Un titre beaucoup trop long pour WhatsApp" },
      { id: "c", title: "Beddel" },
      { id: "d", title: "Ignored" },
    ]);
    const action = (buttons.interactive as { action: { buttons: Array<{ reply: { title: string } }> } }).action;
    expect(action.buttons).toHaveLength(3);
    expect(action.buttons[1].reply.title.length).toBeLessThanOrEqual(20);
    expect(truncateButtonTitle("court")).toBe("court");
  });
});

describe("Embedded Signup (one-click link)", () => {
  it("parses the FINISH session message and ignores other events", () => {
    expect(
      parseEmbeddedSignupMessage({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH",
        data: { waba_id: "1098", phone_number_id: "1065" },
      }),
    ).toEqual({ wabaId: "1098", phoneNumberId: "1065" });
    expect(parseEmbeddedSignupMessage({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: {} })).toBeNull();
    expect(parseEmbeddedSignupMessage({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: {} })).toBeNull();
    expect(parseEmbeddedSignupMessage(null)).toBeNull();
  });

  it("builds the code-exchange URL with encoded credentials", () => {
    const url = buildTokenExchangeUrl("app 1", "sec/ret", "co de");
    expect(url).toContain("graph.facebook.com/v21.0/oauth/access_token");
    expect(url).toContain("client_id=app+1");
    expect(url).toContain("client_secret=sec%2Fret");
    expect(url).toContain("code=co+de");
    expect(url).not.toContain("redirect_uri");
    const withRedirect = buildTokenExchangeUrl("app", "secret", "code", "https://localhost:3000/api/meta/oauth/callback");
    expect(withRedirect).toContain("redirect_uri=https%3A%2F%2Flocalhost%3A3000%2Fapi%2Fmeta%2Foauth%2Fcallback");
  });
});

describe("OGG voice-note conversion helpers", () => {
  it("resamples 48k to 16k and encodes a valid WAV header", () => {
    const samples = new Float32Array(48_000).fill(0.5);
    const resampled = resampleTo16k(samples, 48_000);
    expect(resampled.length).toBe(16_000);
    const wav = encodeWav16kMono(resampled);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.length).toBe(44 + 32_000);
  });
});
