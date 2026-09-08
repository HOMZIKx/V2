import { readFileSync, writeFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, contents) {
  writeFileSync(path, contents, 'utf8');
}

function replaceOnce(path, from, to) {
  const source = read(path);
  if (!source.includes(from)) {
    throw new Error(`Pattern not found in ${path}: ${from.slice(0, 120)}`);
  }
  write(path, source.replace(from, to));
}

function replaceAllChecked(path, regex, replacer, minimum = 1) {
  const source = read(path);
  let count = 0;
  const next = source.replace(regex, (...args) => {
    count += 1;
    return typeof replacer === 'function' ? replacer(...args) : replacer;
  });
  if (count < minimum) {
    throw new Error(`Expected at least ${minimum} replacements in ${path}, got ${count}`);
  }
  write(path, next);
}

const roomsApi = 'apps/web/src/player-team-rooms-api.ts';
replaceOnce(
  roomsApi,
  `const baseUrl =\n  (process.env.NEXT_PUBLIC_PLAYER_TEAM_BASE_URL ?? '').trim() || 'http://127.0.0.1:4400';\n\nconst demoHeaderName = (\n  (process.env.NEXT_PUBLIC_PLAYER_TEAM_DEMO_VIEWER_HEADER ?? '').trim() || 'x-demo-viewer-id'\n).toLowerCase();\n\nfunction headers(viewerId: string, json = false): HeadersInit {\n  const h: Record<string, string> = { [demoHeaderName]: viewerId };\n  if (json) h['content-type'] = 'application/json';\n  return h;\n}\n`,
  `// Production Timers/Party requests always use the authenticated same-origin\n// Next proxy. A direct base URL is retained only for explicit local/dev work.\nconst configuredBaseUrl =\n  process.env.NODE_ENV === 'production'\n    ? ''\n    : (process.env.NEXT_PUBLIC_PLAYER_TEAM_BASE_URL ?? '').trim();\nconst baseUrl = configuredBaseUrl.replace(/\\/$/, '');\n\nconst demoHeaderName = (\n  (process.env.NEXT_PUBLIC_PLAYER_TEAM_DEMO_VIEWER_HEADER ?? '').trim() || 'x-demo-viewer-id'\n).toLowerCase();\n\nconst requestCredentials: RequestCredentials = baseUrl.length === 0 ? 'include' : 'same-origin';\n\nfunction headers(viewerId: string, json = false): HeadersInit {\n  const h: Record<string, string> = {};\n  // Only direct local/dev calls use the compatibility identity. Production\n  // identity is resolved server-side by /player-team/[...path].\n  if (baseUrl.length > 0) h[demoHeaderName] = viewerId;\n  if (json) h['content-type'] = 'application/json';\n  return h;\n}\n`,
);
replaceAllChecked(
  roomsApi,
  /(^\s*)headers: headers\(([^\n]+)\),\n/gm,
  (_match, indent, args) => `${indent}headers: headers(${args}),\n${indent}credentials: requestCredentials,\n`,
  8,
);
replaceOnce(
  roomsApi,
  `export async function patchPartyRoom(input: {\n  readonly viewerId: string;\n  readonly roomId: string;\n  readonly expectedRevision: number;\n  readonly patch: {\n    readonly mapKey?: string;\n    readonly activeChannel?: number;\n    readonly sessionKills?: number;\n    readonly visibility?: 'open' | 'closed';\n  };\n}): Promise<PartyRoomSnapshot> {`,
  `export async function patchPartyRoom(input: {\n  readonly viewerId: string;\n  readonly roomId: string;\n  readonly expectedRevision: number;\n  readonly patch: {\n    readonly mapKey?: string;\n    readonly activeChannel?: number;\n    readonly sessionKills?: number;\n    readonly sessionKillsDelta?: number;\n    readonly visibility?: 'open' | 'closed';\n    readonly requests?: PartyRoomSnapshot['requests'];\n  };\n}): Promise<PartyRoomSnapshot> {`,
);
replaceOnce(
  roomsApi,
  `export async function confirmTimerKill(input: {\n  readonly viewerId: string;\n  readonly mapKey: string;\n  readonly channel: number;\n  readonly roomCode?: string | null;\n  readonly record: TimerRoomRecord;\n  readonly operationId: string;\n  readonly expectedRevision?: number | null;\n}): Promise<TimerRoomSnapshot> {\n  const res = await fetch(\n    \`${'${baseUrl}'}/player-team/v1/timer-rooms/${'${encodeURIComponent(input.mapKey)}'}/${'${input.channel}'}/confirm-kill\`,\n    {\n      method: 'POST',\n      headers: headers(input.viewerId, true),\n      credentials: requestCredentials,\n      body: JSON.stringify({\n        roomCode: input.roomCode ?? null,\n        record: input.record,\n        operationId: input.operationId,\n        expectedRevision: input.expectedRevision ?? undefined,\n      }),\n    },\n  );\n  if (!res.ok) throw new Error(\`confirmTimerKill failed: ${'${await readError(res)}'}\`);\n  return (await res.json()) as TimerRoomSnapshot;\n}\n`,
  `export async function confirmTimerKill(input: {\n  readonly viewerId: string;\n  readonly mapKey: string;\n  readonly channel: number;\n  readonly roomCode?: string | null;\n  readonly record: TimerRoomRecord;\n  readonly operationId: string;\n  readonly expectedRevision?: number | null;\n}): Promise<TimerRoomSnapshot> {\n  const post = (expectedRevision: number | null) =>\n    fetch(\n      \`${'${baseUrl}'}/player-team/v1/timer-rooms/${'${encodeURIComponent(input.mapKey)}'}/${'${input.channel}'}/confirm-kill\`,\n      {\n        method: 'POST',\n        headers: headers(input.viewerId, true),\n        credentials: requestCredentials,\n        body: JSON.stringify({\n          roomCode: input.roomCode ?? null,\n          record: input.record,\n          operationId: input.operationId,\n          expectedRevision: expectedRevision ?? undefined,\n        }),\n      },\n    );\n\n  let res = await post(input.expectedRevision ?? null);\n  if (res.status === 409) {\n    // Another online user changed the same map/CH between poll and click.\n    // Refresh revision and replay the idempotent operation once instead of\n    // dropping this user's confirmation.\n    const latest = await getOrCreateTimerRoom({\n      viewerId: input.viewerId,\n      mapKey: input.mapKey,\n      channel: input.channel,\n      roomCode: input.roomCode ?? null,\n    });\n    res = await post(latest.revision);\n  }\n  if (!res.ok) throw new Error(\`confirmTimerKill failed: ${'${await readError(res)}'}\`);\n  return (await res.json()) as TimerRoomSnapshot;\n}\n`,
);

const port = 'services/player-team-service/src/domain/ports/hunt-rooms.port.ts';
replaceOnce(
  port,
  `export type PatchPartyRoomInput = {\n  readonly roomId: string;\n  readonly viewerId: string;\n  readonly expectedRevision: number;\n  readonly mapKey?: string;\n  readonly activeChannel?: number;\n  readonly sessionKills?: number;\n  readonly visibility?: 'open' | 'closed';\n};`,
  `export type PatchPartyRoomInput = {\n  readonly roomId: string;\n  readonly viewerId: string;\n  readonly expectedRevision: number;\n  readonly mapKey?: string;\n  readonly activeChannel?: number;\n  readonly sessionKills?: number;\n  readonly sessionKillsDelta?: number;\n  readonly visibility?: 'open' | 'closed';\n  readonly requests?: readonly PartyRoomRequest[];\n};`,
);
replaceOnce(
  port,
  `  getPartyRoom(roomId: string): Promise<PartyRoomRecord | null>;\n  leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null>;\n  patchPartyRoom(input: PatchPartyRoomInput): Promise<PartyRoomRecord>;\n  addPartyRoomPin(roomId: string, pin: PartyRoomPin): Promise<PartyRoomRecord>;\n  removePartyRoomPin(roomId: string, pinId: string): Promise<PartyRoomRecord>;`,
  `  getPartyRoom(roomId: string): Promise<PartyRoomRecord | null>;\n  leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null>;\n  patchPartyRoom(input: PatchPartyRoomInput): Promise<PartyRoomRecord>;\n  addPartyRoomPin(roomId: string, viewerId: string, pin: PartyRoomPin): Promise<PartyRoomRecord>;\n  removePartyRoomPin(roomId: string, viewerId: string, pinId: string): Promise<PartyRoomRecord>;`,
);

const useCases = 'services/player-team-service/src/application/use-cases/hunt-rooms.use-cases.ts';
replaceOnce(
  useCases,
  `  public async getPartyRoom(roomId: string): Promise<PartyRoomRecord | null> {\n    return this.repository.getPartyRoom(roomId);\n  }`,
  `  public async getPartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null> {\n    const room = await this.repository.getPartyRoom(roomId);\n    if (room === null) return null;\n    if (!room.members.some((member) => member.id === viewerId)) {\n      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');\n    }\n    return room;\n  }`,
);
replaceOnce(
  useCases,
  `  public addPartyRoomPin(roomId: string, pin: PartyRoomPin): Promise<PartyRoomRecord> {\n    return this.repository.addPartyRoomPin(roomId, pin);\n  }\n\n  public removePartyRoomPin(roomId: string, pinId: string): Promise<PartyRoomRecord> {\n    return this.repository.removePartyRoomPin(roomId, pinId);\n  }`,
  `  public addPartyRoomPin(\n    roomId: string,\n    viewerId: string,\n    pin: PartyRoomPin,\n  ): Promise<PartyRoomRecord> {\n    return this.repository.addPartyRoomPin(roomId, viewerId, pin);\n  }\n\n  public removePartyRoomPin(\n    roomId: string,\n    viewerId: string,\n    pinId: string,\n  ): Promise<PartyRoomRecord> {\n    return this.repository.removePartyRoomPin(roomId, viewerId, pinId);\n  }`,
);

const controller = 'services/player-team-service/src/interface/hunt-rooms.controller.ts';
replaceOnce(
  controller,
  `  Inject,\n  Param,`,
  `  Inject,\n  NotFoundException,\n  Param,`,
);
replaceOnce(
  controller,
  `const patchPartyBodySchema = z.object({\n  expectedRevision: z.number().int().nonnegative(),\n  mapKey: z.string().min(1).optional(),\n  activeChannel: z.number().int().positive().optional(),\n  sessionKills: z.number().int().nonnegative().optional(),\n  visibility: z.enum(['open', 'closed']).optional(),\n});`,
  `const partyRequestSchema = z.object({\n  id: z.string().min(1),\n  displayName: z.string().min(1),\n  status: z.enum(['pending', 'accepted', 'rejected']),\n});\n\nconst patchPartyBodySchema = z.object({\n  expectedRevision: z.number().int().nonnegative(),\n  mapKey: z.string().min(1).optional(),\n  activeChannel: z.number().int().positive().optional(),\n  sessionKills: z.number().int().nonnegative().optional(),\n  sessionKillsDelta: z.number().int().optional(),\n  visibility: z.enum(['open', 'closed']).optional(),\n  requests: z.array(partyRequestSchema).max(100).optional(),\n});`,
);
replaceOnce(
  controller,
  `  public async getPartyRoom(\n    @Headers() headers: Record<string, string | string[] | undefined>,\n    @Param('roomId') roomId: string,\n  ) {\n    this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));\n    return this.useCases.getPartyRoom(roomId);\n  }`,
  `  public async getPartyRoom(\n    @Headers() headers: Record<string, string | string[] | undefined>,\n    @Param('roomId') roomId: string,\n  ) {\n    const viewerId = this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));\n    const room = await this.useCases.getPartyRoom(roomId, viewerId);\n    if (room === null) throw new NotFoundException('party room not found');\n    return room;\n  }`,
);
replaceOnce(
  controller,
  `      ...(parsed.data.sessionKills !== undefined\n        ? { sessionKills: parsed.data.sessionKills }\n        : {}),\n      ...(parsed.data.visibility !== undefined\n        ? { visibility: parsed.data.visibility }\n        : {}),`,
  `      ...(parsed.data.sessionKills !== undefined\n        ? { sessionKills: parsed.data.sessionKills }\n        : {}),\n      ...(parsed.data.sessionKillsDelta !== undefined\n        ? { sessionKillsDelta: parsed.data.sessionKillsDelta }\n        : {}),\n      ...(parsed.data.visibility !== undefined\n        ? { visibility: parsed.data.visibility }\n        : {}),\n      ...(parsed.data.requests !== undefined ? { requests: parsed.data.requests } : {}),`,
);
replaceOnce(
  controller,
  `  ) {\n    this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));\n    const parsed = addPinBodySchema.safeParse(rawBody);`,
  `  ) {\n    const viewerId = this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));\n    const parsed = addPinBodySchema.safeParse(rawBody);`,
);
replaceOnce(
  controller,
  `    return this.useCases.addPartyRoomPin(roomId, {\n      ...pin,\n      partyId: pin.partyId ?? roomId,\n    });`,
  `    return this.useCases.addPartyRoomPin(roomId, viewerId, {\n      ...pin,\n      partyId: pin.partyId ?? roomId,\n    });`,
);
replaceOnce(
  controller,
  `  ) {\n    this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));\n    return this.useCases.removePartyRoomPin(roomId, pinId);\n  }`,
  `  ) {\n    const viewerId = this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));\n    return this.useCases.removePartyRoomPin(roomId, viewerId, pinId);\n  }`,
);

const repo = 'services/player-team-service/src/infrastructure/db/hunt-rooms.repository.ts';
replaceOnce(
  repo,
  `  public async leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null> {\n    const current = await this.getPartyRoom(roomId);\n    if (current === null) return null;\n\n    const nextMembers = current.members.filter((m) => m.id !== viewerId);`,
  `  public async leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null> {\n    const current = await this.getPartyRoom(roomId);\n    if (current === null) return null;\n    if (!current.members.some((member) => member.id === viewerId)) {\n      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');\n    }\n\n    const nextMembers = current.members.filter((m) => m.id !== viewerId);`,
);
replaceOnce(
  repo,
  `       SET map_key = COALESCE($2, map_key),\n           active_channel = COALESCE($3, active_channel),\n           session_kills = COALESCE($4, session_kills),\n           visibility = COALESCE($5, visibility),\n           revision = revision + 1,\n           updated_at = NOW()\n       WHERE id = $1 AND revision = $6\n       RETURNING *\`,\n      [\n        input.roomId,\n        input.mapKey ?? null,\n        input.activeChannel ?? null,\n        input.sessionKills ?? null,\n        input.visibility ?? null,\n        input.expectedRevision,\n      ],`,
  `       SET map_key = COALESCE($2, map_key),\n           active_channel = COALESCE($3, active_channel),\n           session_kills = CASE\n             WHEN $4::integer IS NOT NULL THEN $4::integer\n             WHEN $5::integer IS NOT NULL THEN GREATEST(0, session_kills + $5::integer)\n             ELSE session_kills\n           END,\n           visibility = COALESCE($6, visibility),\n           requests = COALESCE($7::jsonb, requests),\n           revision = revision + 1,\n           updated_at = NOW()\n       WHERE id = $1 AND revision = $8\n       RETURNING *\`,\n      [\n        input.roomId,\n        input.mapKey ?? null,\n        input.activeChannel ?? null,\n        input.sessionKills ?? null,\n        input.sessionKillsDelta ?? null,\n        input.visibility ?? null,\n        input.requests !== undefined ? JSON.stringify(input.requests) : null,\n        input.expectedRevision,\n      ],`,
);
replaceOnce(
  repo,
  `  public async addPartyRoomPin(roomId: string, pin: PartyRoomPin): Promise<PartyRoomRecord> {\n    const current = await this.getPartyRoom(roomId);\n    if (current === null) {\n      throw new PlayerTeamError('NOT_FOUND', 'party room not found');\n    }\n    const pins = [...current.pins.filter((p) => p.id !== pin.id), { ...pin, partyId: roomId }];\n    const updated = await this.db.query(\n      \`UPDATE player_team_party_rooms\n       SET pins = $2::jsonb,\n           revision = revision + 1,\n           updated_at = NOW()\n       WHERE id = $1\n       RETURNING *\`,\n      [roomId, JSON.stringify(pins)],\n    );\n    return this.mapPartyRow(updated.rows[0]);\n  }\n\n  public async removePartyRoomPin(roomId: string, pinId: string): Promise<PartyRoomRecord> {\n    const current = await this.getPartyRoom(roomId);\n    if (current === null) {\n      throw new PlayerTeamError('NOT_FOUND', 'party room not found');\n    }\n    const pins = current.pins.filter((p) => p.id !== pinId);\n    const updated = await this.db.query(\n      \`UPDATE player_team_party_rooms\n       SET pins = $2::jsonb,\n           revision = revision + 1,\n           updated_at = NOW()\n       WHERE id = $1\n       RETURNING *\`,\n      [roomId, JSON.stringify(pins)],\n    );\n    return this.mapPartyRow(updated.rows[0]);\n  }`,
  `  public async addPartyRoomPin(\n    roomId: string,\n    viewerId: string,\n    pin: PartyRoomPin,\n  ): Promise<PartyRoomRecord> {\n    const current = await this.getPartyRoom(roomId);\n    if (current === null) {\n      throw new PlayerTeamError('NOT_FOUND', 'party room not found');\n    }\n    if (!current.members.some((member) => member.id === viewerId)) {\n      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');\n    }\n    const normalizedPin = { ...pin, partyId: roomId };\n    const updated = await this.db.query(\n      \`UPDATE player_team_party_rooms\n       SET pins = COALESCE(\n             (SELECT jsonb_agg(item)\n                FROM jsonb_array_elements(pins) AS item\n               WHERE item->>'id' <> $2),\n             '[]'::jsonb\n           ) || $3::jsonb,\n           revision = revision + 1,\n           updated_at = NOW()\n       WHERE id = $1\n       RETURNING *\`,\n      [roomId, pin.id, JSON.stringify([normalizedPin])],\n    );\n    return this.mapPartyRow(updated.rows[0]);\n  }\n\n  public async removePartyRoomPin(\n    roomId: string,\n    viewerId: string,\n    pinId: string,\n  ): Promise<PartyRoomRecord> {\n    const current = await this.getPartyRoom(roomId);\n    if (current === null) {\n      throw new PlayerTeamError('NOT_FOUND', 'party room not found');\n    }\n    if (!current.members.some((member) => member.id === viewerId)) {\n      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');\n    }\n    const updated = await this.db.query(\n      \`UPDATE player_team_party_rooms\n       SET pins = COALESCE(\n             (SELECT jsonb_agg(item)\n                FROM jsonb_array_elements(pins) AS item\n               WHERE item->>'id' <> $2),\n             '[]'::jsonb\n           ),\n           revision = revision + 1,\n           updated_at = NOW()\n       WHERE id = $1\n       RETURNING *\`,\n      [roomId, pinId],\n    );\n    return this.mapPartyRow(updated.rows[0]);\n  }`,
);

const partyUi = 'apps/web/app/maps/party-hunt.tsx';
replaceOnce(
  partyUi,
  `    if (room.visibility === 'closed') {\n      setSavedClosedParty({\n        id: room.id,\n        name: room.name,\n        leaderId: room.leaderId,\n        visibility: room.visibility,\n        joinCode: room.joinCode,\n        mapKey: room.mapKey,\n        activeChannel: room.activeChannel,\n        members: room.members,\n        requests: room.requests,\n        sessionKills: room.sessionKills,\n      });\n    }`,
  `    if (room.visibility === 'closed') {\n      setSavedClosedParty({\n        id: room.id,\n        name: room.name,\n        leaderId: room.leaderId,\n        visibility: room.visibility,\n        joinCode: room.joinCode,\n        mapKey: room.mapKey,\n        activeChannel: room.activeChannel,\n        members: room.members,\n        requests: room.requests,\n        sessionKills: room.sessionKills,\n      });\n    } else {\n      setSavedClosedParty(null);\n    }`,
);
replaceOnce(
  partyUi,
  `  const addRequest = () => {\n    const name = requestName.trim();\n    if (!party || !name) return;\n    setParty((current) =>\n      current\n        ? requestPartyJoin(current, {\n            id: \`guest-${'${name.toLocaleLowerCase(\'pl\').replace(/\\s+/g, \'-\')}' }\`,\n            displayName: name,\n          })\n        : null,\n    );\n    setRequestName('');\n    setNotice(\`${'${name}'} czeka na decyzję lidera.\`);\n  };`,
  `  const addRequest = () => {\n    const name = requestName.trim();\n    if (!party || !name) return;\n    const next = requestPartyJoin(party, {\n      id: \`guest-${'${name.toLocaleLowerCase(\'pl\').replace(/\\s+/g, \'-\')}' }\`,\n      displayName: name,\n    });\n    setRequestName('');\n    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {\n      void patchPartyRoom({\n        viewerId,\n        roomId: partyRoomId,\n        expectedRevision: partyRevision,\n        patch: { requests: next.requests },\n      })\n        .then((room) => {\n          applyPartyRoom(room);\n          setNotice(\`${'${name}'} czeka na decyzję lidera · wspólny pokój.\`);\n        })\n        .catch((e) =>\n          setNotice(\`Nie udało się zapisać prośby online: ${'${e instanceof Error ? e.message : String(e)}'}\`),\n        );\n      return;\n    }\n    setParty(next);\n    setNotice(\`${'${name}'} czeka na decyzję lidera (offline).\`);\n  };\n\n  const resolveJoinRequest = (requestId: string, accepted: boolean) => {\n    if (!party) return;\n    const next = resolvePartyRequest(party, requestId, accepted);\n    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {\n      void patchPartyRoom({\n        viewerId,\n        roomId: partyRoomId,\n        expectedRevision: partyRevision,\n        patch: { requests: next.requests },\n      })\n        .then((room) => {\n          applyPartyRoom(room);\n          setNotice(accepted ? 'Prośba przyjęta · wspólny pokój.' : 'Prośba odrzucona · wspólny pokój.');\n        })\n        .catch((e) =>\n          setNotice(\`Nie udało się rozstrzygnąć prośby online: ${'${e instanceof Error ? e.message : String(e)}'}\`),\n        );\n      return;\n    }\n    setParty(next);\n  };`,
);
replaceOnce(
  partyUi,
  `  const markSessionKill = () => {\n    if (!party) return;\n    const nextKills = party.sessionKills + 1;\n    const next = incrementSessionKills(party);`,
  `  const toggleVisibility = () => {\n    if (!party) return;\n    const next = togglePartyVisibility(party);\n    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {\n      void patchPartyRoom({\n        viewerId,\n        roomId: partyRoomId,\n        expectedRevision: partyRevision,\n        patch: { visibility: next.visibility },\n      })\n        .then((room) => {\n          applyPartyRoom(room);\n          setNotice(room.visibility === 'open' ? 'Party otwarte · wspólny pokój.' : 'Party zamknięte · wspólny pokój.');\n        })\n        .catch((e) =>\n          setNotice(\`Zmiana widoczności online nieudana: ${'${e instanceof Error ? e.message : String(e)}'}\`),\n        );\n      return;\n    }\n    setParty(next);\n    setSavedClosedParty(next.visibility === 'closed' ? next : null);\n  };\n\n  const markSessionKill = () => {\n    if (!party) return;\n    const next = incrementSessionKills(party);`,
);
replaceOnce(
  partyUi,
  `        patch: { sessionKills: nextKills },`,
  `        patch: { sessionKillsDelta: 1 },`,
);
replaceOnce(
  partyUi,
  `                patch: { sessionKills: nextKills },`,
  `                patch: { sessionKillsDelta: 1 },`,
);
replaceOnce(
  partyUi,
  `                  onClick={() => {\n                    const next = togglePartyVisibility(party);\n                    setParty(next);\n                    setSavedClosedParty(next.visibility === 'closed' ? next : null);\n                  }}`,
  `                  onClick={toggleVisibility}`,
);
replaceAllChecked(
  partyUi,
  /onClick=\{\(\) =>\s*setParty\(\(current\) =>\s*current \? resolvePartyRequest\(current, request\.id, (true|false)\) : null,\s*\)\s*\}/g,
  (_match, accepted) => `onClick={() => resolveJoinRequest(request.id, ${accepted})}`,
  2,
);

const spec = 'services/player-team-service/src/application/use-cases/hunt-rooms.use-cases.spec.ts';
replaceOnce(
  spec,
  `  public async addPartyRoomPin(roomId: string, pin: PartyRoomPin): Promise<PartyRoomRecord> {`,
  `  public async addPartyRoomPin(\n    roomId: string,\n    viewerId: string,\n    pin: PartyRoomPin,\n  ): Promise<PartyRoomRecord> {`,
);
replaceOnce(
  spec,
  `    const current = this.parties.get(roomId);\n    if (!current) throw new PlayerTeamError('NOT_FOUND', 'party room not found');\n    const pins = [...current.pins.filter((p) => p.id !== pin.id), { ...pin, partyId: roomId }];`,
  `    const current = this.parties.get(roomId);\n    if (!current) throw new PlayerTeamError('NOT_FOUND', 'party room not found');\n    if (!current.members.some((member) => member.id === viewerId)) {\n      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');\n    }\n    const pins = [...current.pins.filter((p) => p.id !== pin.id), { ...pin, partyId: roomId }];`,
);
replaceOnce(
  spec,
  `  public async removePartyRoomPin(roomId: string, pinId: string): Promise<PartyRoomRecord> {`,
  `  public async removePartyRoomPin(\n    roomId: string,\n    viewerId: string,\n    pinId: string,\n  ): Promise<PartyRoomRecord> {`,
);
replaceOnce(
  spec,
  `    const current = this.parties.get(roomId);\n    if (!current) throw new PlayerTeamError('NOT_FOUND', 'party room not found');\n    const next: PartyRoomRecord = {\n      ...current,\n      pins: current.pins.filter((p) => p.id !== pinId),`,
  `    const current = this.parties.get(roomId);\n    if (!current) throw new PlayerTeamError('NOT_FOUND', 'party room not found');\n    if (!current.members.some((member) => member.id === viewerId)) {\n      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');\n    }\n    const next: PartyRoomRecord = {\n      ...current,\n      pins: current.pins.filter((p) => p.id !== pinId),`,
);
replaceOnce(
  spec,
  `      sessionKills: input.sessionKills ?? current.sessionKills,\n      visibility: input.visibility ?? current.visibility,`,
  `      sessionKills:\n        input.sessionKills ??\n        (input.sessionKillsDelta !== undefined\n          ? Math.max(0, current.sessionKills + input.sessionKillsDelta)\n          : current.sessionKills),\n      visibility: input.visibility ?? current.visibility,\n      requests: input.requests ?? current.requests,`,
);
replaceOnce(
  spec,
  `    const withPin = await useCases.addPartyRoomPin(room.id, {`,
  `    const withPin = await useCases.addPartyRoomPin(room.id, 'm1', {`,
);
replaceOnce(
  spec,
  `  it('confirmTimerKill jest idempotentny po operationId', async () => {`,
  `  it('odrzuca odczyt i mutację party przez osobę spoza pokoju', async () => {\n    const useCases = new HuntRoomsUseCases(new MemoryHuntRoomsRepo(), { allowDemoWrite: true });\n    const room = await useCases.createPartyRoom({\n      leaderId: 'm1',\n      displayName: 'Mateusz',\n      mapKey: 'Yongbi',\n      activeChannel: 1,\n      visibility: 'closed',\n    });\n    await expect(useCases.getPartyRoom(room.id, 'intruder')).rejects.toThrow(PlayerTeamError);\n    await expect(\n      useCases.addPartyRoomPin(room.id, 'intruder', {\n        id: 'pin-x',\n        partyId: room.id,\n        mapKey: 'Yongbi',\n        channel: 1,\n        location: { x: 1, y: 1 },\n        placedAt: 1,\n        placedBy: 'Intruder',\n        label: 'Metin',\n        kind: 'metin',\n      }),\n    ).rejects.toThrow(PlayerTeamError);\n  });\n\n  it('synchronizuje prośby i atomowy przyrost zbić przez patch pokoju', async () => {\n    const useCases = new HuntRoomsUseCases(new MemoryHuntRoomsRepo(), { allowDemoWrite: true });\n    const room = await useCases.createPartyRoom({\n      leaderId: 'm1',\n      displayName: 'Mateusz',\n      mapKey: 'Yongbi',\n      activeChannel: 1,\n      visibility: 'open',\n    });\n    const withRequest = await useCases.patchPartyRoom({\n      roomId: room.id,\n      viewerId: 'm1',\n      expectedRevision: room.revision,\n      requests: [{ id: 'guest-a', displayName: 'A', status: 'pending' }],\n      sessionKillsDelta: 1,\n    });\n    expect(withRequest.requests).toHaveLength(1);\n    expect(withRequest.sessionKills).toBe(1);\n  });\n\n  it('confirmTimerKill jest idempotentny po operationId', async () => {`,
);

console.log('Timers + Party online sync hardening patch applied.');
