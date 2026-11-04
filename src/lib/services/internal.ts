import { repo } from "../db";
import { executeAction } from "./actions";

/** System approval for actions the policy marked `auto` (e.g. a payer accepting an in-policy plan). */
export async function approveActionInternal(id: string) {
  const a = repo.getAction(id);
  if (!a || a.decision !== "auto") throw new Error("Only policy-approved actions can be auto-approved");
  if (repo.transitionAction(id, ["proposed"], "approved")) await executeAction(id, { ownerApproved: false });
}
