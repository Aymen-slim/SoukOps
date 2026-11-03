import { redirect } from "next/navigation";

// The next URL depends on the query string, so this hop stays a blocking redirect.
export const instant = false;

export default async function SimulatorRedirect({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string | string[]; platform?: string | string[] }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (typeof sp.conversation === "string" && sp.conversation) qs.set("conversation", sp.conversation);
  if (typeof sp.platform === "string" && sp.platform) qs.set("platform", sp.platform);
  const query = qs.toString();
  redirect(query ? `/demo?${query}` : "/demo");
}
