import { isPartyRoleKey, type PartyRoleKey } from '@v2/hub-core';

/** Compact durable DM context encoded in signed custom_id param (no colons). */
export type LfgDmDurableContext =
  | {
      readonly kind: 'intent';
      readonly intentOpaqueId: string;
      readonly guildId: string;
      readonly partyRole?: PartyRoleKey;
    }
  | {
      readonly kind: 'watch';
      readonly watchOpaqueId: string;
      readonly guildId: string;
      readonly partyRole?: PartyRoleKey;
    }
  | {
      readonly kind: 'ephemeral';
      readonly guildId: string;
      readonly partyRole?: PartyRoleKey;
    };

function assertOpaque12(value: string, label: string): void {
  if (!/^[a-f0-9]{12}$/.test(value)) {
    throw new Error(`${label} must be 12 lowercase hex characters.`);
  }
}

export function encodeLfgDmContext(context: LfgDmDurableContext): string {
  if (context.kind === 'intent') {
    assertOpaque12(context.intentOpaqueId, 'intentOpaqueId');
    return context.partyRole !== undefined
      ? `i.${context.intentOpaqueId}.${context.guildId}.${context.partyRole}`
      : `i.${context.intentOpaqueId}.${context.guildId}`;
  }
  if (context.kind === 'watch') {
    assertOpaque12(context.watchOpaqueId, 'watchOpaqueId');
    return context.partyRole !== undefined
      ? `w.${context.watchOpaqueId}.${context.guildId}.${context.partyRole}`
      : `w.${context.watchOpaqueId}.${context.guildId}`;
  }
  if (context.partyRole !== undefined) {
    return `e.${context.guildId}.${context.partyRole}`;
  }
  return context.guildId;
}

export function decodeLfgDmContext(param: string | undefined): LfgDmDurableContext | null {
  if (param === undefined || param.length === 0) {
    return null;
  }
  if (param.startsWith('i.')) {
    const parts = param.split('.');
    const intentOpaqueId = parts[1];
    const guildId = parts[2];
    const roleRaw = parts[3];
    if (intentOpaqueId === undefined || guildId === undefined) {
      return null;
    }
    assertOpaque12(intentOpaqueId, 'intentOpaqueId');
    const partyRole = roleRaw !== undefined && isPartyRoleKey(roleRaw) ? roleRaw : undefined;
    return { kind: 'intent', intentOpaqueId, guildId, ...(partyRole ? { partyRole } : {}) };
  }
  if (param.startsWith('w.')) {
    const parts = param.split('.');
    const watchOpaqueId = parts[1];
    const guildId = parts[2];
    const roleRaw = parts[3];
    if (watchOpaqueId === undefined || guildId === undefined) {
      return null;
    }
    assertOpaque12(watchOpaqueId, 'watchOpaqueId');
    const partyRole = roleRaw !== undefined && isPartyRoleKey(roleRaw) ? roleRaw : undefined;
    return { kind: 'watch', watchOpaqueId, guildId, ...(partyRole ? { partyRole } : {}) };
  }
  if (param.startsWith('e.')) {
    const parts = param.split('.');
    const guildId = parts[1];
    const roleRaw = parts[2];
    if (guildId === undefined) {
      return null;
    }
    const partyRole = roleRaw !== undefined && isPartyRoleKey(roleRaw) ? roleRaw : undefined;
    return { kind: 'ephemeral', guildId, ...(partyRole ? { partyRole } : {}) };
  }
  if (param.includes(':')) {
    const [guildId, roleRaw] = param.split(':');
    if (guildId === undefined || guildId.length === 0) {
      return null;
    }
    const partyRole = roleRaw !== undefined && isPartyRoleKey(roleRaw) ? roleRaw : undefined;
    return { kind: 'ephemeral', guildId, ...(partyRole ? { partyRole } : {}) };
  }
  return { kind: 'ephemeral', guildId: param };
}
