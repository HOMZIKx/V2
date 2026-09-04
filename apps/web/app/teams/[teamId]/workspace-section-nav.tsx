'use client';

export type WorkspaceSection = 'overview' | 'characters' | 'members' | 'history';

export function WorkspaceSectionNav({
  workspaceId,
  active,
}: {
  readonly workspaceId: string;
  readonly active: WorkspaceSection;
}) {
  const items = [
    { id: 'overview' as const, href: `/teams/${workspaceId}`, label: 'Przegląd' },
    { id: 'characters' as const, href: '/characters', label: 'Postacie' },
    { id: 'members' as const, href: `/teams/${workspaceId}/members`, label: 'Członkowie' },
    { id: 'history' as const, href: `/teams/${workspaceId}/history`, label: 'Historia' },
  ];

  return (
    <nav aria-label="Sekcje zespołu" className="workspace-tabs">
      {items.map((item) => (
        <a aria-current={item.id === active ? 'page' : undefined} href={item.href} key={item.id}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
