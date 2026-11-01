import { describe, expect, it } from "vitest";
import {
  buildDispatchReconfirmText,
  parseDispatchReconfirmReply,
  reconfirmBlocksApproval,
} from "@/lib/domain/reconfirm";

describe("dispatch reconfirmation replies", () => {
  it("parses the button titles and plain answers", () => {
    expect(parseDispatchReconfirmReply("Oui, ab3ath")).toBe("confirmed");
    expect(parseDispatchReconfirmReply("oui")).toBe("confirmed");
    expect(parseDispatchReconfirmReply("La, stannew")).toBe("declined");
    expect(parseDispatchReconfirmReply("la")).toBe("declined");
    expect(parseDispatchReconfirmReply("win toskon?")).toBeNull();
    expect(parseDispatchReconfirmReply("")).toBeNull();
  });

  it("template carries no amount", () => {
    expect(buildDispatchReconfirmText("Sweat jaune")).not.toMatch(/\d+\s*(dt|dinar|alf)/i);
    expect(buildDispatchReconfirmText(null)).toContain("m2akked");
  });
});

describe("reconfirmation approval gate", () => {
  const orderId = "11111111-1111-4111-8111-111111111111";
  it("does not block when nothing was requested", () => {
    expect(reconfirmBlocksApproval({}, orderId)).toBeNull();
    expect(reconfirmBlocksApproval({ dispatchReconfirm: { status: "pending", orderId: "other" } }, orderId)).toBeNull();
  });
  it("blocks while pending or declined, allows after confirmation", () => {
    expect(reconfirmBlocksApproval({ dispatchReconfirm: { status: "pending", orderId } }, orderId)).toBe("pending");
    expect(reconfirmBlocksApproval({ dispatchReconfirm: { status: "declined", orderId } }, orderId)).toBe("declined");
    expect(reconfirmBlocksApproval({ dispatchReconfirm: { status: "confirmed", orderId } }, orderId)).toBeNull();
  });
});
