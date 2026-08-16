import { useCallback, useEffect, useState } from 'react';

import { errorFromUnknown, type LoadState } from '../components/ui.js';
import { useRequiredGuildId } from '../layout/GuildContext.js';

export function useGuildResource<T>(loader: (guildId: string) => Promise<T>) {
  const guildId = useRequiredGuildId();
  const [state, setState] = useState<LoadState<T>>({ kind: 'loading' });
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (guildId === null) {
      setState({ kind: 'empty' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const data = await loader(guildId);
        if (cancelled) {
          return;
        }
        setState({ kind: 'ready', data });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const parsed = errorFromUnknown(error);
        setState({
          kind: 'error',
          message: parsed.message,
          ...(parsed.forbidden ? { forbidden: true } : {}),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, loader, version]);

  return { guildId, state, reload, setState };
}
