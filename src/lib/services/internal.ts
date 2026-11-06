import { repo } from "../db";
import { withLock } from "../locks";
import { executeAction } from "./actions";

/** System approval for actions the policy marked `auto` (e.g. a payer accepting an in-policy plan). */
export async function approveActionInternal(id: string) {
  const found = repo.getAction(id);
  if (!found || found.decision !== "auto") throw new Error("Only policy-approved actions can be auto-approved");
  // Same per-invoice lock as proposals and owner approvals (see proposeAction).
  await withLock(`act:${found.invoice_id}`, async () => {
    if (repo.transitionAction(id, ["proposed"], "approved")) await executeAction(id, { ownerApproved: false });
  });
}
