import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { repo } from "@/lib/db";
import { PolicySchema } from "@/lib/policy";

export const dynamic = "force-dynamic";
export const GET = route(async () => json(repo.getPolicy()));
export const PUT = route(async (req: Request) => {
  assertSameOrigin(req);
  const policy = PolicySchema.parse({ ...repo.getPolicy(), ...(await readJson(req)) });
  repo.setPolicy(policy);
  repo.logEvent({ kind: "policy_updated", actor: "owner", summary: "You updated your collection policy", data: policy });
  return json(policy);
});
