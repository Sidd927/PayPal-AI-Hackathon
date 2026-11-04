import { json, route } from "@/lib/http";
import { insightsTables } from "@/lib/services/insights";

export const dynamic = "force-dynamic";

/** Read-only, predefined reporting tables for AG Studio (owner-only via proxy when OWNER_BASIC_AUTH is set). */
export const GET = route(async () => json(insightsTables()));
