import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookState = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  intervalCallback: null as (() => void) | null,
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initial: unknown) => [initial, vi.fn()],
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
    useEffect: (effect: () => void | (() => void)) => {
      hookState.effects.push(effect);
    },
    useRef: <T,>(initial: T) => ({ current: initial }),
  };
});

import { AdminStatusPage } from './status-page.js';

type InteractiveProps = {
  readonly children?: ReactNode;
  readonly onClick?: () => void;
  readonly onChange?: (event: { target: { checked: boolean } }) => void;
  readonly type?: string;
};

function elements(node: ReactNode): Array<ReactElement<InteractiveProps>> {
  const result: Array<ReactElement<InteractiveProps>> = [];
  const visit = (value: ReactNode): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isValidElement<InteractiveProps>(value)) return;
    result.push(value);
    visit(value.props.children);
  };
  visit(node);
  return result;
}

describe('AdminStatusPage interactions', () => {
  beforeEach(() => {
    hookState.effects.length = 0;
    hookState.intervalCallback = null;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      }),
    );
    vi.stubGlobal('window', {
      setInterval: vi.fn((callback: () => void) => {
        hookState.intervalCallback = callback;
        return 1;
      }),
      clearInterval: vi.fn(),
    });
  });

  it('executes startup refresh, interval refresh, manual refresh and auto-refresh toggle', async () => {
    const tree = AdminStatusPage();
    const all = elements(tree);
    const refreshButton = all.find(
      (element) => element.type === 'button' && typeof element.props.onClick === 'function',
    );
    const autoRefresh = all.find(
      (element) => element.type === 'input' && typeof element.props.onChange === 'function',
    );

    expect(refreshButton).toBeDefined();
    expect(autoRefresh).toBeDefined();
    expect(hookState.effects).toHaveLength(2);

    hookState.effects[0]?.();
    const cleanup = hookState.effects[1]?.();
    await Promise.resolve();
    await Promise.resolve();

    hookState.intervalCallback?.();
    refreshButton?.props.onClick?.();
    autoRefresh?.props.onChange?.({ target: { checked: false } });
    await Promise.resolve();
    await Promise.resolve();

    expect(fetch).toHaveBeenCalled();
    expect(window.setInterval).toHaveBeenCalled();
    if (typeof cleanup === 'function') cleanup();
    expect(window.clearInterval).toHaveBeenCalledWith(1);
  });
});
