// Durable relayer state (data/state.jsonl): append-only snapshots of each
// case's off-chain metadata and each open draft. The last snapshot per key
// wins on load. Holds side-token HASHES only (never plaintext tokens) and no
// IPs, API keys or emails. It DOES hold each case's webhook callback URL
// (customer configuration, possibly with a secret in the query), so it is
// private operator data: created mode 0600, never published, never on-chain.
// Draft snapshots hold already-moderated entry texts that the submitting side
// consented to publish.

import { JsonlFile } from "./journal.js";

type Snapshot<T> = { kind: "case"; id: number; data: T } | { kind: "draft"; id: string; data: T | null };

export class StateStore<C extends object, D extends object> {
  private readonly log: JsonlFile;
  constructor(file: string) {
    this.log = new JsonlFile(file);
  }

  load(): { cases: Map<number, C>; drafts: Map<string, D> } {
    const cases = new Map<number, C>();
    const drafts = new Map<string, D>();
    for (const r of this.log.readAll() as Array<Snapshot<C | D>>) {
      if (r.kind === "case") cases.set(r.id, r.data as C);
      else if (r.data === null) drafts.delete(r.id);
      else drafts.set(r.id, r.data as D);
    }
    return { cases, drafts };
  }

  saveCase(id: number, data: C): void {
    this.log.append({ kind: "case", id, data });
  }

  saveDraft(id: string, data: D | null): void {
    this.log.append({ kind: "draft", id, data });
  }
}
