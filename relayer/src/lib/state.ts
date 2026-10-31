// Durable relayer state (data/state.jsonl): append-only snapshots of each
// case's off-chain metadata and each open draft. The last snapshot per key
// wins on load. Holds side-token HASHES only (never plaintext tokens) and no
// IPs, API keys or emails. It DOES hold each case's webhook callback URL
// (customer configuration, possibly with a secret in the query), so it is
// private operator data: created mode 0600, never published, never on-chain.
// Draft snapshots hold already-moderated entry texts that the submitting side
// consented to publish.

import { JsonlFile } from "./journal.js";

type Snapshot<T> = { kind: "case"; id: number; data: T } | { kind: "draft"; id: string; data: T | null } | { kind: "meta"; id: string; data: unknown };

export class StateStore<C extends object, D extends object> {
  private readonly log: JsonlFile;
  constructor(file: string) {
    this.log = new JsonlFile(file);
  }

  load(): { cases: Map<number, C>; drafts: Map<string, D>; meta: Map<string, unknown> } {
    const cases = new Map<number, C>();
    const drafts = new Map<string, D>();
    const meta = new Map<string, unknown>();
    for (const r of this.log.readAll() as Array<Snapshot<C | D>>) {
      if (r.kind === "meta") meta.set(r.id, r.data);
      else if (r.kind === "case") cases.set(r.id, r.data as C);
      else if (r.data === null) drafts.delete(r.id);
      else drafts.set(r.id, r.data as D);
    }
    return { cases, drafts, meta };
  }

  saveCase(id: number, data: C): void {
    this.log.append({ kind: "case", id, data });
  }

  saveDraft(id: string, data: D | null): void {
    this.log.append({ kind: "draft", id, data });
  }

  /** Relayer-wide singletons (e.g. the publish budget and queue). Last write wins. */
  saveMeta(id: string, data: unknown): void {
    this.log.append({ kind: "meta", id, data });
  }
}
