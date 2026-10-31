/**
 * Day 5 landmark seed: committed OSM snapshot (scripts/landmarks.json,
 * Grand Tunis pharmacies/cafés/schools/mosques/posts/banks/clinics/
 * supermarkets/fuel) -> `landmarks` table for the search_landmarks RPC.
 * Idempotent: the snapshot fully replaces the table (landmark ids are not
 * referenced elsewhere; addresses store the landmark name as text).
 * Run: npm run seed:landmarks
 */
import "./load-env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createAdminClient, hasAdminConfig } from "../src/lib/supabase/admin";

const snapshotSchema = z.array(
  z.object({
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    type: z.string(),
    governorate: z.string(),
    delegation: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
  }),
);

async function main(): Promise<void> {
  if (!hasAdminConfig()) {
    console.log("Seeding needs Supabase URL + SUPABASE_SECRET_KEY in .env.local.");
    process.exit(0);
  }
  const snapshot = snapshotSchema.parse(
    JSON.parse(await readFile(path.join("scripts", "landmarks.json"), "utf8")),
  );
  const supabase = createAdminClient();
  const { error: clearError } = await supabase.from("landmarks").delete().not("id", "is", null);
  if (clearError) throw new Error(`landmarks clear failed: ${clearError.message}`);
  const { error } = await supabase.from("landmarks").insert(
    snapshot.map((l) => ({
      name: l.name,
      aliases: l.aliases,
      type: l.type,
      governorate: l.governorate,
      delegation: l.delegation,
      lat: l.lat,
      lng: l.lng,
    })),
  );
  if (error) throw new Error(`landmarks insert failed: ${error.message}`);
  console.log(`Seeded ${snapshot.length} landmarks.`);
}

void main();
