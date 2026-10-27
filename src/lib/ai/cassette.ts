import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/env";

/**
 * Record/replay for every AI call. Keyed by a hash of the (stable) input:
 * callers must not include timestamps or random ids in the input object.
 * AI_MODE=live passes through, record passes through and writes,
 * replay reads and throws on a miss. Files live in CASSETTE_DIR (gitignored).
 */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function cassetteKey(namespace: string, input: unknown): string {
  return createHash("sha256").update(`${namespace}:${stableStringify(input)}`).digest("hex").slice(0, 32);
}

function cassetteFile(namespace: string, key: string): string {
  const dir = getServerEnv().CASSETTE_DIR;
  return path.join(process.cwd(), dir, namespace, `${key}.json`);
}

export async function withCassette<T>(
  namespace: string,
  input: unknown,
  call: () => Promise<T>,
): Promise<T> {
  const mode = getServerEnv().AI_MODE;
  const key = cassetteKey(namespace, input);
  const file = cassetteFile(namespace, key);

  if (mode === "replay") {
    try {
      const raw = await readFile(file, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`Cassette miss in replay mode: ${namespace}/${key}. Re-run with AI_MODE=record.`);
    }
  }

  const result = await call();

  if (mode === "record") {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(result, null, 2), "utf8");
  }
  return result;
}
