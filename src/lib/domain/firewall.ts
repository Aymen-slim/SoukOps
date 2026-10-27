/**
 * Price firewall: every amount in a model-written reply must be an amount the
 * pricing engine produced. Amounts are integer millimes (1 DT = 1000).
 * Full Derja money parsing lands Day 4 in derja.ts; Day 1 covers explicit
 * DT forms used by smoke/unit tests.
 */
export function extractAmountsMillimes(reply: string): number[] {
  const amounts: number[] = [];
  // "171DT", "171 dt", "171,500 DT", "171.5DT"
  const dtPattern = /(\d{1,6})(?:[.,](\d{1,3}))?\s*(?:dt|dinar)/gi;
  for (const match of reply.matchAll(dtPattern)) {
    const dinars = Number(match[1]);
    const fraction = match[2] ? Number(match[2].padEnd(3, "0")) : 0;
    amounts.push(dinars * 1000 + fraction);
  }
  // "170 alf" = 170 DT (170 thousand millimes)
  const alfPattern = /(\d{1,6})\s*alf\b/gi;
  for (const match of reply.matchAll(alfPattern)) {
    amounts.push(Number(match[1]) * 1000);
  }
  return amounts;
}

export function passesPriceFirewall(reply: string, allowedMillimes: Set<number>): boolean {
  return extractAmountsMillimes(reply).every((m) => allowedMillimes.has(m));
}
