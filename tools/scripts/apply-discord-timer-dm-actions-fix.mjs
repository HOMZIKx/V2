import fs from 'node:fs';

const path = 'apps/discord-gateway/src/interface/discord/team-sync-interaction-router.ts';

function replaceOnce(before, after, label) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

replaceOnce(
`function timerDeepLink(workspaceId: string | null, characterId: string | null): string {
  if (!workspaceId || !characterId) return 'https://desapp.zeabur.app/timers';
  return \`https://desapp.zeabur.app/teams/\${encodeURIComponent(workspaceId)}/characters/\${encodeURIComponent(characterId)}?view=timers\`;
}

/**`,
`function timerDeepLink(workspaceId: string | null, characterId: string | null): string {
  if (!workspaceId || !characterId) return 'https://desapp.zeabur.app/timers';
  return \`https://desapp.zeabur.app/teams/\${encodeURIComponent(workspaceId)}/characters/\${encodeURIComponent(characterId)}?view=timers\`;
}

function workspaceIdFromTimerMessage(content: string): string | null {
  const match = /\\/teams\\/([^/?#]+)\\/characters\\//.exec(content);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**`,
  'workspace hint helper',
);

replaceOnce(
`      if (interaction.isButton() && characterTimer.operation === 'gotowe') {
        await this.handleCharacterTimerRefresh(interaction, characterTimer.payload.timerId);
        return;
      }`,
`      if (interaction.isButton()) {
        const workspaceHint = workspaceIdFromTimerMessage(interaction.message.content ?? '');
        if (characterTimer.operation === 'gotowe') {
          await this.handleCharacterTimerRefresh(
            interaction,
            characterTimer.payload.timerId,
            workspaceHint,
          );
          return;
        }
        if (characterTimer.operation === 'przypomnij') {
          await this.handleCharacterTimerSnooze(
            interaction,
            characterTimer.payload.timerId,
            workspaceHint,
          );
          return;
        }
      }`,
  'intercept both character timer DM actions',
);

replaceOnce(
`  private async handleCharacterTimerRefresh(
    interaction: MessageComponentInteraction,
    timerId: string,
  ): Promise<void> {`,
`  private async handleCharacterTimerRefresh(
    interaction: MessageComponentInteraction,
    timerId: string,
    workspaceHint: string | null,
  ): Promise<void> {`,
  'refresh signature',
);

replaceOnce(
`    const located = await readCharacterTimerCardFromBot({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId: ownerViewerId,
      timerId,
    });`,
`    const locatedFromShared = workspaceHint
      ? await readSharedCharacterTimerCardFromBot({
          baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
          demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
          viewerId: ownerViewerId,
          workspaceId: workspaceHint,
          timerId,
        })
      : null;
    const located =
      locatedFromShared ??
      (await readCharacterTimerCardFromBot({
        baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
        demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
        viewerId: ownerViewerId,
        timerId,
      }));`,
  'prefer shared workspace on refresh',
);

replaceOnce(
`  private async sendDueTimerCard(job: CharacterTimerReminderJob): Promise<void> {`,
`  private async handleCharacterTimerSnooze(
    interaction: MessageComponentInteraction,
    timerId: string,
    workspaceHint: string | null,
  ): Promise<void> {
    const ownerViewerId = canonicalOwnerViewerId(interaction.user.id);
    const locatedFromShared = workspaceHint
      ? await readSharedCharacterTimerCardFromBot({
          baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
          demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
          viewerId: ownerViewerId,
          workspaceId: workspaceHint,
          timerId,
        })
      : null;
    const located =
      locatedFromShared ??
      (await readCharacterTimerCardFromBot({
        baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
        demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
        viewerId: ownerViewerId,
        timerId,
      }));

    if (!located?.workspaceId) {
      await interaction.reply({
        content: 'Nie udało się odnaleźć wspólnej karty tego timera.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const live = this.deps.getBotConfig?.() ?? defaultBotConfigValues();
    const characterCfg = live.characterTimers ?? live.timersNotify;
    const minutes = Math.max(1, Math.min(1440, Math.round(characterCfg.reminderMinutesBefore || 60)));
    const deepLinkUrl = timerDeepLink(located.workspaceId, located.characterId);
    const delayMs = minutes * 60_000;
    const scheduled = scheduleCharacterTimerReminder(
      {
        discordUserId: interaction.user.id,
        timerId,
        label: located.timerLabel,
        characterName: located.characterName,
        characterId: located.characterId,
        workspaceId: located.workspaceId,
        deepLinkUrl,
        delayMs,
      },
      {
        logger: this.deps.logger,
        send: (job) => this.sendSnoozedTimerCard(job),
      },
    );

    const who = located.characterName ? \` · \${located.characterName}\` : '';
    await interaction.reply({
      content: scheduled.ok
        ? \`Przypomnę ponownie za ok. \${minutes} min: **\${located.timerLabel}**\${who}.\`
        : \`Nie udało się zapisać przypomnienia: **\${located.timerLabel}**\${who}.\`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async sendSnoozedTimerCard(job: CharacterTimerReminderJob): Promise<void> {
    const card = job.workspaceId
      ? await readSharedCharacterTimerCardFromBot({
          baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
          demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
          viewerId: job.discordUserId,
          workspaceId: job.workspaceId,
          timerId: job.timerId,
        })
      : await readCharacterTimerCardFromBot({
          baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
          demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
          viewerId: job.discordUserId,
          timerId: job.timerId,
        });
    const resolvedWorkspaceId = card?.workspaceId ?? job.workspaceId;
    const resolvedCharacterId = card?.characterId ?? job.characterId;
    const resolvedCharacterName = card?.characterName ?? job.characterName;
    const focus = card?.liveTimers.find((timer) => timer.id === job.timerId);
    const deepLinkUrl =
      job.deepLinkUrl ?? timerDeepLink(resolvedWorkspaceId, resolvedCharacterId);
    const payload: TimerNotifyPayload = {
      discordUserId: job.discordUserId,
      title: \`\${job.label}\${resolvedCharacterName ? \` · \${resolvedCharacterName}\` : ''}\`,
      body: 'Przypomnienie. Poniżej aktualny stan wszystkich timerów tej postaci.',
      deepLinkUrl,
      ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
      ...(resolvedCharacterId ? { characterId: resolvedCharacterId } : {}),
      ...(resolvedCharacterName ? { characterName: resolvedCharacterName } : {}),
      timerId: job.timerId,
      timerLabel: job.label,
      ...(focus?.readyAtIso ? { endsAt: focus.readyAtIso } : {}),
      ...(card?.liveTimers ? { liveTimers: [...card.liveTimers] } : {}),
      includeButtons: Boolean(card),
      kind: 'reminder',
    };
    const content = formatTimerNotifyContent(payload);
    const message = renderTimerNotifyMessage({
      payload,
      content,
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      includeButtons: Boolean(card),
    });
    await this.deps.gateway.sendTimerNotify({
      discordUserId: job.discordUserId,
      content: message.content ?? content,
      ...(message.components ? { components: message.components } : {}),
    });
  }

  private async sendDueTimerCard(job: CharacterTimerReminderJob): Promise<void> {`,
  'shared snooze handler',
);

console.log('Discord timer DM actions patch applied.');
