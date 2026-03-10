#!/usr/bin/env tsx
import { parseCliInput } from "./cli/args.js";
import { loadLocalEnv } from "./cli/env.js";
import { renderHelp } from "./cli/help.js";
import { loadCliMeta } from "./cli/meta.js";
import { runCommand } from "./cli/router.js";
loadLocalEnv();
const meta = loadCliMeta();
const parsed = parseCliInput();
export const SKILL_VERSION = meta.skillVersion;
export const SKILL_NAME = meta.skillName;
if (!parsed.command || parsed.help) {
    console.log(renderHelp(meta));
    process.exit(0);
}
runCommand(parsed.command, parsed.args, meta).catch((err) => {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
});
