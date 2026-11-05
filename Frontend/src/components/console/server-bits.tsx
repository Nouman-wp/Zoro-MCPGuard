'use client';

import { Select } from '../ui';
import { useProtectedAction, type ProtectedResult } from './protected';
import { api } from '@/lib/api';

export interface ServerSummary {
  id: string;
  name: string;
  label: string;
  transport: 'stdio' | 'http' | 'lab';
  command: string | null;
  args: string[];
  url: string | null;
  mode: 'enforce' | 'observe' | 'disabled';
  source: string;
  status: string;
  online: string;
  last_error: string | null;
  tools: number;
  prompts: number;
  templates: number;
  sealed: number;
  total: number;
  quarantined: number;
  highestSeverity: string | null;
  last_change_at: number | null;
  publisher_verified: number;
  unstable: number;
  ensName: string | null;
  envKeys: string[];
  headerKeys: string[];
  declared_name: string | null;
  declared_version: string | null;
}

export function ModeSelect({ server, onChanged }: { server: ServerSummary; onChanged: () => void }) {
  const p = useProtectedAction(() => onChanged());
  return (
    <>
      <Select
        ariaLabel={`Mode for ${server.name}`}
        value={server.mode}
        onChange={(mode) => void p.run((confirm) => api<ProtectedResult>(`/api/console/servers/${server.id}/mode`, { method: 'PATCH', json: { mode, confirm } }))}
        options={[{ value: 'enforce', label: 'Enforce' }, { value: 'observe', label: 'Observe (no protection)' }, { value: 'disabled', label: 'Disabled' }]}
        className="h-8 w-48 text-[13px]"
      />
      {p.ui}
    </>
  );
}

