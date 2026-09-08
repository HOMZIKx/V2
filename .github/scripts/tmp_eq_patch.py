from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}")
    file_path.write_text(text.replace(old, new, 1))


store = "apps/web/src/player-store.ts"
marker = "export function updateEquipmentItemWeaponStats(\n"
functions = r'''/** Update the same physical item card. Catalog data remains authoritative when a match exists. */
export function updateEquipmentItemCard(
  state: PlayerStoreState,
  workspaceId: string,
  itemId: string,
  input: {
    readonly name: string;
    readonly category: EquipmentSlot;
    readonly enhancement?: number;
    readonly bonuses: readonly string[];
    readonly forCharacterClass?: CharacterClass;
  },
): { readonly state: PlayerStoreState; readonly ok: boolean } {
  const baseName = stripEnhancementFromName(input.name);
  if (baseName.length < 2) return { state, ok: false };
  const enhancement = clampEnhancement(input.enhancement ?? parseEnhancementFromName(input.name));
  const name = formatEnhancedItemName(baseName, enhancement);
  const catalogHit = findGameItemByCardName(baseName) ?? findGameItemByCardName(name);

  let category = input.category;
  if (catalogHit) {
    const catalogSlot = equipmentSlotForCategory(catalogHit.category);
    if (catalogSlot === null) return { state, ok: false };
    if (
      input.forCharacterClass &&
      !isItemCompatibleWithClass(catalogHit.category, input.forCharacterClass)
    ) {
      return { state, ok: false };
    }
    category = catalogSlot;
  }

  const cleaned = input.bonuses.map((line) => line.trim()).filter((line) => line.length > 0);
  let ok = false;
  const next = updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const existing = workspace.items.find((item) => item.id === itemId);
    if (!existing || existing.archived) return workspace;
    ok = true;

    const { additional } = splitItemBonuses(name, enhancement, cleaned);
    const nextBonuses = mergeItemBonusStorage(name, enhancement, additional, category);
    const categoryChanged = existing.category !== category;
    let clearedAssignments = 0;

    const characters = workspace.characters.map((character) => {
      if (!categoryChanged) return character;
      const sets = character.sets.map((set) => {
        const assignments = { ...set.assignments };
        let touched = false;
        for (const slot of equipmentSlots) {
          if (assignments[slot] === itemId) {
            assignments[slot] = null;
            clearedAssignments += 1;
            touched = true;
          }
        }
        return touched ? { ...set, assignments } : set;
      });
      const changed = sets.some((set, index) => set !== character.sets[index]);
      return changed ? { ...character, sets, revision: character.revision + 1 } : character;
    });

    const keepAverageSkill = category === 'weapon' && weaponHasAverageSkillDamage(name);
    const keepPvm = category === 'weapon' && weaponHasPhPvmAttackBonuses(name);
    const nextItem: EquipmentItem = {
      ...existing,
      name,
      enhancement,
      category,
      iconPath: resolveItemIconPath(name),
      bonuses: nextBonuses,
      levelLabel: catalogHit ? `katalog: ${catalogHit.category}` : 'własny wpis zespołu',
      catalogLayer: catalogHit ? 'project_hard_source' : 'team_private',
      averageDamagePercent: keepAverageSkill ? existing.averageDamagePercent : null,
      skillDamagePercent: keepAverageSkill ? existing.skillDamagePercent : null,
      attackValuePvm: keepPvm ? existing.attackValuePvm : null,
      magicAttackValuePvm: keepPvm ? existing.magicAttackValuePvm : null,
      lastConfirmedLocation:
        categoryChanged && clearedAssignments > 0 ? 'Torba I' : existing.lastConfirmedLocation,
      lastConfirmedBy:
        categoryChanged && clearedAssignments > 0 ? viewer.displayName : existing.lastConfirmedBy,
      lastConfirmedAt:
        categoryChanged && clearedAssignments > 0 ? nowLabel() : existing.lastConfirmedAt,
      revision: existing.revision + 1,
    };

    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters,
      items: workspace.items.map((item) => (item.id === itemId ? nextItem : item)),
      history: [
        historyEntry(workspace.id, viewer, {
          characterId: null,
          characterName: null,
          resource: 'equipment',
          title: `Zaktualizowano przedmiot: ${name}`,
          detail:
            categoryChanged && clearedAssignments > 0
              ? `Zmieniono typ na ${slotLabels[category]} · zdjęto z setu i przeniesiono do Torby I`
              : `Typ: ${slotLabels[category]} · dodatkowe bonusy: ${additional.length}`,
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });

  return { state: next, ok };
}

/** Soft-delete an item while preserving audit/history; all set assignments are cleared. */
export function archiveEquipmentItem(
  state: PlayerStoreState,
  workspaceId: string,
  itemId: string,
): PlayerStoreState {
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const existing = workspace.items.find((item) => item.id === itemId);
    if (!existing || existing.archived) return workspace;

    let clearedAssignments = 0;
    const characters = workspace.characters.map((character) => {
      const sets = character.sets.map((set) => {
        const assignments = { ...set.assignments };
        let touched = false;
        for (const slot of equipmentSlots) {
          if (assignments[slot] === itemId) {
            assignments[slot] = null;
            clearedAssignments += 1;
            touched = true;
          }
        }
        return touched ? { ...set, assignments } : set;
      });
      const changed = sets.some((set, index) => set !== character.sets[index]);
      return changed ? { ...character, sets, revision: character.revision + 1 } : character;
    });

    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters,
      items: workspace.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              archived: true,
              planned: false,
              lastConfirmedLocation: null,
              lastConfirmedBy: viewer.displayName,
              lastConfirmedAt: nowLabel(),
              revision: item.revision + 1,
            }
          : item,
      ),
      history: [
        historyEntry(workspace.id, viewer, {
          characterId: null,
          characterName: null,
          resource: 'equipment',
          title: `Usunięto przedmiot: ${existing.name}`,
          detail:
            clearedAssignments > 0
              ? `Karta zarchiwizowana · wyczyszczono przypisania setów: ${clearedAssignments}`
              : 'Karta zarchiwizowana.',
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

'''
replace_once(store, marker, functions + marker)

replace_once(
    store,
    '''          return {
            ...item,
            notes: Array.isArray(item.notes) ? item.notes : [],
            enhancement,
''',
    '''          return {
            ...item,
            archived:
              Boolean(item.archived) ||
              item.lastConfirmedLocation?.trim().toLocaleLowerCase('pl') === 'usunięte',
            notes: Array.isArray(item.notes) ? item.notes : [],
            enhancement,
''',
)

react = "apps/web/src/player-store-react.tsx"
replace_once(
    react,
    '''  archiveCharacter,
  updateEquipmentItemBonuses,
''',
    '''  archiveCharacter,
  archiveEquipmentItem,
  updateEquipmentItemCard,
  updateEquipmentItemBonuses,
''',
)
replace_once(
    react,
    '''  updateItemBonuses: (
    workspaceId: string,
''',
    '''  updateItem: (
    workspaceId: string,
    itemId: string,
    input: {
      readonly name: string;
      readonly category: EquipmentSlot;
      readonly enhancement?: number;
      readonly bonuses: readonly string[];
      readonly forCharacterClass?: CharacterClass;
    },
  ) => boolean;
  archiveItem: (workspaceId: string, itemId: string) => void;
  updateItemBonuses: (
    workspaceId: string,
''',
)
replace_once(
    react,
    '''      updateItemBonuses: (workspaceId, itemId, bonuses, options) => {
''',
    '''      updateItem: (workspaceId, itemId, input) => {
        let ok = false;
        apply((current) => {
          const result = updateEquipmentItemCard(current, workspaceId, itemId, input);
          ok = result.ok;
          return result.state;
        });
        return ok;
      },
      archiveItem: (workspaceId, itemId) => {
        apply((current) => archiveEquipmentItem(current, workspaceId, itemId));
      },
      updateItemBonuses: (workspaceId, itemId, bonuses, options) => {
''',
)

component = "apps/web/app/teams/[teamId]/characters/[characterId]/character-equipment-v2.tsx"
replace_once(
    component,
    '''    createItem,
    updateItemBonuses,
    confirmLocation,
''',
    '''    createItem,
    updateItem,
    archiveItem,
    confirmLocation,
''',
)
replace_once(
    component,
    '''    if (editorMode === 'edit' && selectedItem) {
      updateItemBonuses(workspace.id, selectedItem.id, bonuses, {
        enhancement: clampEnhancement(draft.enhancement),
      });
      closeEditor();
      return;
    }
''',
    '''    if (editorMode === 'edit' && selectedItem) {
      const categoryChanged = draft.category !== selectedItem.category;
      const updated = updateItem(workspace.id, selectedItem.id, {
        name: draft.name.trim(),
        category: draft.category,
        enhancement: clampEnhancement(draft.enhancement),
        bonuses,
        forCharacterClass: character.characterClass,
      });
      if (!updated) {
        setEditorError('Nie udało się zapisać zmian. Sprawdź nazwę, typ i zgodność przedmiotu z klasą.');
        return;
      }
      if (categoryChanged) {
        setBagLocation('Torba I');
        setInventoryMode('bag');
      }
      closeEditor();
      return;
    }
''',
)
replace_once(
    component,
    '''  const removeItemSoft = (item: EquipmentItem) => {
    if (!writesEnabled) return;
    if (!window.confirm(`Usunąć „${item.name}” z ekwipunku zespołu?`)) return;
    if (equipLocations.get(item.id)) unequipItem(workspace.id, item.id);
    confirmLocation(workspace.id, item.id, REMOVED_LOCATION);
    setSelectedItemId(null);
  };
''',
    '''  const removeItem = (item: EquipmentItem) => {
    if (!writesEnabled) return;
    if (!window.confirm(`Usunąć „${item.name}” z ekwipunku zespołu?`)) return;
    archiveItem(workspace.id, item.id);
    setSelectedItemId(null);
  };
''',
)
replace_once(component, "onClick={() => removeItemSoft(selectedItem)}", "onClick={() => removeItem(selectedItem)}")
replace_once(component, "Edytuj +{selectedItem.enhancement} / bonusy", "Edytuj przedmiot")
replace_once(
    component,
    "                    disabled={editorMode === 'edit'}\n                    onChange={(event) => {",
    "                    onChange={(event) => {",
)
replace_once(
    component,
    "                {editorMode !== 'edit' && catalogSuggestions.length > 0 ? (",
    "                {catalogSuggestions.length > 0 ? (",
)
replace_once(
    component,
    "                      disabled={editorMode === 'edit'}\n                      onChange={(event) => {",
    "                      onChange={(event) => {",
)

Path(".github/workflows/tmp-eq-item-mutations.yml").unlink()
Path(".github/scripts/tmp_eq_patch.py").unlink()
