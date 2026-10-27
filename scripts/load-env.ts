import { config } from "dotenv";

// Scripts run outside Next, so load .env.local (then .env) explicitly.
config({ path: ".env.local" });
config();
