// Prints the canonical code digest of contracts/judge_router.py (or the file
// given) for EXPECTED_CONTRACT_CODE_DIGEST: sha256 after CRLF/CR -> LF and
// exactly one trailing newline (relayer/src/lib/pinning.ts codeDigest).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? path.resolve(here, "../../contracts/judge_router.py");
const text = readFileSync(file, "utf8").replace(/\r\n?/g, "\n").replace(/\n+$/, "") + "\n";
console.log(createHash("sha256").update(text, "utf8").digest("hex"));
