import { handleCommand, type CommandResult } from "../memory/commands";

/**
 * The only "tool" the Phase 1 chat agent exposes: explicit memory commands
 * (remember/forget/correct/why). Kept as a thin, explicitly named seam so a
 * later phase can add real multi-tool dispatch and a TOOL OUTPUT prompt
 * block without touching chat-agent.ts's control flow. External content
 * (retrieved memory, imported documents) never reaches this path directly —
 * only the user's own chat message can trigger a memory command.
 */
export async function runMemoryCommandTool(userId: string, sourceId: string, message: string): Promise<CommandResult> {
  return handleCommand(userId, sourceId, message);
}
