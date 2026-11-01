import { describe, expect, it } from "vitest";
import { buildOAuthDialogUrl, buildQuickReplies, parseFacebookWebhook } from "@/lib/channels/facebook";

function pagePayload(object: string, messaging: unknown[]) {
  return { object, entry: [{ id: "page-1", time: 1, messaging }] };
}

describe("Facebook webhook parsing (Messenger + Instagram)", () => {
  it("extracts Messenger text, quick replies, postbacks and images", () => {
    const parsed = parseFacebookWebhook(
      pagePayload("page", [
        { sender: { id: "psid-1" }, message: { mid: "m1", text: "b9addech?" } },
        { sender: { id: "psid-1" }, message: { mid: "m2", text: "Akked", quick_reply: { payload: "akked" } } },
        { sender: { id: "psid-1" }, postback: { mid: "m3", title: "Beddel", payload: "beddel" } },
        {
          sender: { id: "psid-1" },
          message: { mid: "m4", attachments: [{ type: "image", payload: { url: "https://cdn.example/x.jpg" } }] },
        },
        { sender: { id: "page-1" }, message: { mid: "m5", text: "echo", is_echo: true } },
        { sender: { id: "psid-1" }, delivery: { mids: ["m1"] } },
      ]),
    );
    expect(parsed.map((m) => [m.platform, m.kind, m.body])).toEqual([
      ["messenger", "text", "b9addech?"],
      ["messenger", "button", "Akked"],
      ["messenger", "button", "Beddel"],
      ["messenger", "image", null],
    ]);
    expect(parsed[3].attachmentUrl).toBe("https://cdn.example/x.jpg");
    expect(parsed[0].platformUserId).toBe("psid-1");
  });

  it("extracts Instagram DMs and ignores other objects", () => {
    const parsed = parseFacebookWebhook(
      pagePayload("instagram", [{ sender: { id: "igsid-9" }, message: { mid: "ig1", text: "salut, dispo?" } }]),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ platform: "instagram", platformUserId: "igsid-9", kind: "text" });
    expect(parseFacebookWebhook(pagePayload("user", [{ sender: { id: "x" }, message: { mid: "y", text: "hi" } }]))).toEqual([]);
    expect(parseFacebookWebhook(null)).toEqual([]);
  });

  it("builds the server-side OAuth dialog URL (no JS SDK, no http FB.login)", () => {
    const url = buildOAuthDialogUrl({
      appId: "1476562851235645",
      redirectUri: "http://localhost:3000/api/meta/oauth/callback",
      state: "messenger.abc",
      scope: "pages_messaging,pages_show_list",
    });
    expect(url).toContain("facebook.com/v21.0/dialog/oauth");
    expect(url).toContain("client_id=1476562851235645");
    expect(url).toContain("scope=pages_messaging");
    const wa = buildOAuthDialogUrl({
      appId: "1",
      redirectUri: "http://localhost:3000/api/meta/oauth/callback",
      state: "whatsapp.abc",
      configId: "1174595044892264",
    });
    expect(wa).toContain("config_id=1174595044892264");
    expect(wa).not.toContain("scope=");
  });

  it("caps quick replies at 3 with 20-char titles", () => {
    const replies = buildQuickReplies([
      { id: "a", title: "Akked" },
      { id: "b", title: "Un titre beaucoup trop long pour la plateforme" },
      { id: "c", title: "Beddel" },
      { id: "d", title: "Ignored" },
    ]);
    expect(replies).toHaveLength(3);
    expect(replies[1].title.length).toBeLessThanOrEqual(20);
    expect(replies[0]).toMatchObject({ content_type: "text", payload: "a" });
  });
});
