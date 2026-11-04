/** Stages of the resolution loop, shared by the server read model and the UI (no server imports). */
export const LOOP_STAGES = ["detected", "diagnosed", "approval", "acted", "agreed", "paid"] as const;
export type LoopStage = (typeof LOOP_STAGES)[number];
