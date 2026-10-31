// Prints sha256(contracts/judge_router.py) for EXPECTED_CONTRACT_CODE_DIGEST.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? path.resolve(here, "../../contracts/judge_router.py");
console.log(createHash("sha256").update(readFileSync(file)).digest("hex"));
