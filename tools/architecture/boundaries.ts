const appTargetTypes = new Set(['type:util', 'type:contracts', 'type:ui', 'type:config']);
const serviceTargetTypes = new Set(['type:util', 'type:contracts', 'type:config']);

export function isDependencyAllowed(
  sourceTags: readonly string[],
  targetTags: readonly string[],
): boolean {
  const source = new Set(sourceTags);
  const target = new Set(targetTags);

  if (source.has('scope:identity') && target.has('scope:authorization')) {
    return false;
  }

  if (source.has('scope:authorization') && target.has('scope:identity')) {
    return false;
  }

  if (source.has('type:app')) {
    return [...appTargetTypes].some((tag) => target.has(tag));
  }

  if (source.has('type:service')) {
    return [...serviceTargetTypes].some((tag) => target.has(tag));
  }

  if (source.has('type:contracts')) {
    return target.has('type:contracts');
  }

  return true;
}
