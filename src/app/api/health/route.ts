import { json } from "@/lib/http";
import { modeInfo } from "@/lib/services/board";

export const dynamic = "force-dynamic";

/**
 * Public (no owner auth, see src/proxy.ts): liveness plus the mode badges. Internal provider state (why and until
 * when AI calls are paused) is owner-only and served with the board data instead.
 */
export const GET = async () => {
  const { aiPausedUntil: _until, aiPausedReason: _reason, ...publicMode } = modeInfo();
  return json({ ok: true, ...publicMode });
};
