import { json } from "@/lib/http";
import { modeInfo } from "@/lib/services/board";

export const dynamic = "force-dynamic";
export const GET = async () => json({ ok: true, ...modeInfo() });
