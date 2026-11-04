import { json, route } from "@/lib/http";
import { boardSnapshot } from "@/lib/services/board";

export const dynamic = "force-dynamic";
export const GET = route(async () => json(boardSnapshot()));
