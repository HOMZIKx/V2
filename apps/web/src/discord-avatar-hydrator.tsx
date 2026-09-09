'use client';

import { useEffect } from 'react';

import { fetchIdentityMe } from './identity-auth-client';

const AVATAR_TARGETS = '.profile-avatar, .profil-monogram, .profil-pulpit-avatar';
const DISCORD_AVATAR_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

function trustedDiscordAvatarUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !DISCORD_AVATAR_HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function applyAvatar(url: string): void {
  for (const node of document.querySelectorAll<HTMLElement>(AVATAR_TARGETS)) {
    node.style.backgroundImage = `url("${url.replace(/"/gu, '%22')}")`;
    node.style.backgroundPosition = 'center';
    node.style.backgroundRepeat = 'no-repeat';
    node.style.backgroundSize = 'cover';
    node.style.color = 'transparent';
  }
}

/**
 * Existing UI avatar slots were monograms only. Resolve the authoritative live
 * Identity image once, verify that the Discord CDN asset really loads, and then
 * paint it into every account-avatar slot. If the CDN image fails, monograms stay
 * untouched instead of showing a broken-image glyph.
 */
export function DiscordAvatarHydrator(): null {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    void fetchIdentityMe()
      .then((me) => {
        if (cancelled) return;
        const avatarUrl = trustedDiscordAvatarUrl(me?.image);
        if (!avatarUrl) return;

        const preload = new Image();
        preload.decoding = 'async';
        preload.referrerPolicy = 'no-referrer';
        preload.onload = () => {
          if (cancelled) return;
          applyAvatar(avatarUrl);
          observer = new MutationObserver(() => applyAvatar(avatarUrl));
          observer.observe(document.body, { childList: true, subtree: true });
        };
        preload.src = avatarUrl;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
