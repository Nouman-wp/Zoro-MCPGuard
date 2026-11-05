import type { ReasonCategory } from './policy/types';

const MESSAGES: Record<ReasonCategory, string> = {
  allowed: 'allowed',
  server_disabled: 'the server is disabled in Zoro',
  not_sealed: 'this tool version has not been security-reviewed yet',
  tool_changed: 'this tool changed and is quarantined pending a security review',
  unsafe_verdict: 'a security review found this tool version unsafe',
  revoked: 'the approval for this tool version was revoked',
  expired: 'the approval for this tool version expired and is being renewed',
  trust_chain_contradiction: 'Zoro could not confirm this tool version against its public record',
  artifact_changed: 'the code behind this tool changed and is being reviewed',
  registry_unreachable: 'Zoro cannot reach its registry to confirm this tool',
  policy_denied: 'the user’s policy does not allow this tool',
  approval_required: 'this action needs the user’s approval',
  argument_constraint: 'the arguments are outside what the user’s policy allows',
  rate_limited: 'the call rate limit for this tool was reached',
  agent_restricted: 'this agent is not permitted to use this kind of tool',
  data_flow: 'this call would move data in a way the user’s policy requires approving',
  time_window: 'this tool is restricted outside its allowed hours',
};

export interface RefusalInput {
  /** a tool name the agent already knows from the sealed list, or null */
  toolName: string | null;
  category: ReasonCategory;
  incidentRef: string | null;
  approvalRef?: string | null;
  kind: 'blocked' | 'approval_pending' | 'approval_denied' | 'approval_expired' | 'unavailable';
}

/**
 * A structured, consistent refusal (§4.13). It never contains upstream-provided text: no unsealed descriptions,
 * no suspicious content, no server error messages — only Zoro's own fixed wording and references.
 */
export function buildRefusal(input: RefusalInput) {
  const tool = input.toolName && /^[\w.\-:]{1,128}$/.test(input.toolName) ? `“${input.toolName}”` : 'the requested tool';
  let text: string;
  switch (input.kind) {
    case 'approval_pending':
      text = `[Zoro] The call to ${tool} is waiting for the user’s approval because ${MESSAGES[input.category]}. Approval was requested${input.approvalRef ? ` (${input.approvalRef})` : ''}. Do not retry repeatedly; tell the user an approval is pending, and continue once they approve.`;
      break;
    case 'approval_denied':
      text = `[Zoro] The call to ${tool} was not approved by the user, so it did not run. Tell the user, and continue without this action.`;
      break;
    case 'approval_expired':
      text = `[Zoro] The approval window for the call to ${tool} ended without a decision, so it did not run. Tell the user; they can approve a new request.`;
      break;
    case 'unavailable':
      text = `[Zoro] ${tool} is temporarily unavailable because its server cannot be reached. Tell the user, or continue without this tool.`;
      break;
    default:
      text = `[Zoro] ${tool} is unavailable because ${MESSAGES[input.category]}. The call did not run.${input.incidentRef ? ` Incident: ${input.incidentRef}.` : ''} Tell the user, or continue without this tool.`;
  }
  return {
    isError: true,
    content: [{ type: 'text' as const, text }],
    structuredContent: {
      zoro: {
        outcome: input.kind,
        reason: input.category,
        incident: input.incidentRef,
        approval: input.approvalRef ?? null,
      },
    },
  };
}
