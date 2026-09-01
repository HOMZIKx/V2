import { Button } from '@v2/design-system';

export type SaveState = 'idle' | 'saving' | 'saved';

export function FormActions(props: {
  readonly saveState: SaveState;
  readonly dirty: boolean;
  readonly onSave: () => void;
  readonly onCancel?: () => void;
  readonly saveLabel?: string;
  readonly cancelLabel?: string;
  readonly disabled?: boolean;
}) {
  const saving = props.saveState === 'saving';
  const saved = props.saveState === 'saved';
  return (
    <div className="form-actions">
      <Button
        variant="primary"
        disabled={props.disabled === true || saving || (!props.dirty && !saved)}
        onClick={props.onSave}
      >
        {saving
          ? 'Zapisywanie…'
          : saved && !props.dirty
            ? 'Zapisano'
            : (props.saveLabel ?? 'Zapisz zmiany')}
      </Button>
      {props.onCancel !== undefined ? (
        <Button variant="ghost" disabled={saving} onClick={props.onCancel}>
          {props.cancelLabel ?? 'Anuluj'}
        </Button>
      ) : null}
    </div>
  );
}

export function DestructiveAction(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <div className="destructive-actions">
      <Button variant="danger" disabled={props.disabled === true} onClick={props.onClick}>
        {props.label}
      </Button>
    </div>
  );
}
