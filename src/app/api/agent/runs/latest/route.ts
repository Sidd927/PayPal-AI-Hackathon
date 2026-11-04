import { json, route } from "@/lib/http";
import { runView } from "@/lib/services/agent";

export const dynamic = "force-dynamic";
export const GET = route(async () => json(runView() ?? { none: true }));
