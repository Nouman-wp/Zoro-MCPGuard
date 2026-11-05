import type { Policy, ProfileId, Rule } from './types';

const r = <T extends Rule>(rule: T): T => rule;

export function defaultPolicy(profile: ProfileId): Policy {
  if (profile === 'strict') {
    return {
      version: 1,
      profile,
      rules: [
        r({ id: 'verdicts', type: 'verdict_handling', enabled: true, sealed: 'allow', sealed_with_warnings: 'ask' }),
        r({ id: 'auto-release', type: 'auto_release', enabled: true, cosmetic: 'auto', documentation: 'ask', functional: 'ask', capability_expansion: 'ask' }),
        r({ id: 'high-impact', type: 'high_impact_ask', enabled: true, capabilities: ['financial_action', 'transaction_signing', 'code_execution'], humanSeal: true }),
        r({ id: 'flow-untrusted', type: 'data_flow', enabled: true, from: 'untrusted_external', to: ['external_communication', 'external_network', 'financial_action', 'code_execution', 'privileged_write'], action: 'block', humanSeal: true }),
        r({ id: 'flow-private', type: 'data_flow', enabled: true, from: 'private_sensitive', to: ['external_communication', 'external_network'], action: 'ask', humanSeal: true }),
        r({ id: 'network-grace', type: 'network_grace', enabled: true, mode: 'strict', highImpactMode: 'strict', graceMinutes: 0 }),
        r({ id: 'human-seal', type: 'human_seal', enabled: true, for: ['override', 'high_risk_ask', 'policy_weakening', 'capability_expansion_release', 'namespace_claim', 'dispute'] }),
        r({ id: 'shield', type: 'output_shield', enabled: true, server: '*', tool: '*', action: 'redact' }),
      ],
    };
  }
  if (profile === 'lab') {
    return {
      version: 1,
      profile,
      rules: [
        r({ id: 'verdicts', type: 'verdict_handling', enabled: true, sealed: 'allow', sealed_with_warnings: 'allow' }),
        r({ id: 'auto-release', type: 'auto_release', enabled: true, cosmetic: 'auto', documentation: 'auto', functional: 'auto', capability_expansion: 'ask' }),
        r({ id: 'flow-untrusted', type: 'data_flow', enabled: true, from: 'untrusted_external', to: ['external_communication', 'external_network', 'financial_action'], action: 'ask', humanSeal: true }),
        r({ id: 'network-grace', type: 'network_grace', enabled: true, mode: 'grace', highImpactMode: 'grace', graceMinutes: 240 }),
        r({ id: 'human-seal', type: 'human_seal', enabled: true, for: ['override', 'high_risk_ask', 'namespace_claim', 'dispute'] }),
        r({ id: 'shield', type: 'output_shield', enabled: true, server: '*', tool: '*', action: 'annotate' }),
      ],
    };
  }
  return {
    version: 1,
    profile: 'standard',
    rules: [
      r({ id: 'verdicts', type: 'verdict_handling', enabled: true, sealed: 'allow', sealed_with_warnings: 'ask' }),
      r({ id: 'auto-release', type: 'auto_release', enabled: true, cosmetic: 'auto', documentation: 'auto', functional: 'ask', capability_expansion: 'ask' }),
      r({ id: 'high-impact', type: 'high_impact_ask', enabled: true, capabilities: ['financial_action', 'transaction_signing'], humanSeal: true }),
      r({ id: 'flow-untrusted', type: 'data_flow', enabled: true, from: 'untrusted_external', to: ['external_communication', 'external_network', 'financial_action', 'code_execution'], action: 'ask', humanSeal: true }),
      r({ id: 'flow-private', type: 'data_flow', enabled: true, from: 'private_sensitive', to: ['external_communication', 'external_network'], action: 'ask', humanSeal: false }),
      r({ id: 'network-grace', type: 'network_grace', enabled: true, mode: 'grace', highImpactMode: 'strict', graceMinutes: 60 }),
      r({ id: 'human-seal', type: 'human_seal', enabled: true, for: ['override', 'high_risk_ask', 'namespace_claim', 'dispute'] }),
      r({ id: 'shield', type: 'output_shield', enabled: true, server: '*', tool: '*', action: 'annotate' }),
    ],
  };
}

export const PROFILE_DESCRIPTIONS: Record<ProfileId, string> = {
  standard: 'Balanced protection for individuals. Sealed tools run; warnings and risky data flows ask first; payments and signing need a Human Seal.',
  strict: 'For organizations and financial tools. Only cosmetic updates auto-release, untrusted-to-external flows are blocked, and every loosening change needs a Human Seal.',
  lab: 'Permissive profile for the Attack Lab and testing. Never use it for real servers.',
};
