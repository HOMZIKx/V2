import type {
  ButtonHTMLAttributes,
  CSSProperties,
  JSX,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant },
): JSX.Element {
  const { variant = 'secondary', className, type = 'button', ...rest } = props;
  const extra =
    variant === 'primary'
      ? 'v2-btn-primary'
      : variant === 'danger'
        ? 'v2-btn-danger'
        : variant === 'ghost'
          ? 'v2-btn-ghost'
          : '';
  return (
    <button
      type={type}
      className={['v2-btn', extra, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export function Panel(props: {
  title?: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={['v2-panel', props.className].filter(Boolean).join(' ')}>
      {props.title !== undefined ? <h2 className="v2-panel-title">{props.title}</h2> : null}
      {props.children}
    </section>
  );
}

export function FormField(props: {
  label: string;
  htmlFor?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}): JSX.Element {
  const errorId = props.htmlFor !== undefined ? `${props.htmlFor}-error` : undefined;
  return (
    <div className="v2-field">
      <label className="v2-field-label" htmlFor={props.htmlFor}>
        {props.label}
      </label>
      {props.children}
      {props.hint !== undefined ? <p className="v2-field-hint">{props.hint}</p> : null}
      {props.error !== undefined && props.error !== '' ? (
        <p className="v2-field-error" id={errorId} role="alert">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & {
    options: readonly { value: string; label: string; disabled?: boolean | undefined }[];
  },
): JSX.Element {
  const { options, className, ...rest } = props;
  return (
    <select className={['v2-select', className].filter(Boolean).join(' ')} {...rest}>
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled === true}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function MultiSelect(props: {
  legend: string;
  options: readonly {
    value: string;
    label: string;
    disabled?: boolean | undefined;
    hint?: string | undefined;
  }[];
  selected: readonly string[];
  disabled?: boolean | undefined;
  error?: string | undefined;
  onChange: (next: readonly string[]) => void;
}): JSX.Element {
  return (
    <fieldset className="v2-multiselect">
      <legend className="v2-field-label">{props.legend}</legend>
      {props.options.map((option) => {
        const checked = props.selected.includes(option.value);
        const id = `ms-${option.value}`;
        return (
          <label key={option.value} className="v2-check-row" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              checked={checked}
              disabled={props.disabled === true || option.disabled === true}
              onChange={() => {
                if (checked) {
                  props.onChange(props.selected.filter((value) => value !== option.value));
                } else {
                  props.onChange([...props.selected, option.value]);
                }
              }}
            />
            <span>
              {option.label}
              {option.hint !== undefined ? (
                <span className="v2-field-hint"> — {option.hint}</span>
              ) : null}
            </span>
          </label>
        );
      })}
      {props.error !== undefined && props.error !== '' ? (
        <p className="v2-field-error" role="alert">
          {props.error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function Toggle(props: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label className="v2-toggle" htmlFor={props.id}>
      <input
        id={props.id}
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled === true}
        onChange={(event) => {
          props.onChange(event.target.checked);
        }}
      />
      {props.label}
    </label>
  );
}

export type BadgeTone = 'ok' | 'warn' | 'error' | 'info';

export function Badge(props: { tone: BadgeTone; children: ReactNode }): JSX.Element {
  return <span className={`v2-badge v2-badge-${props.tone}`}>{props.children}</span>;
}

export function Alert(props: {
  tone: 'success' | 'error' | 'info';
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`v2-alert v2-alert-${props.tone}`} role="status">
      {props.children}
    </div>
  );
}

export function EmptyState(props: { children: ReactNode }): JSX.Element {
  return <p className="v2-empty">{props.children}</p>;
}

export function LoadingState(props: { label?: string }): JSX.Element {
  return (
    <p className="v2-loading" aria-busy="true">
      {props.label ?? 'Ładowanie…'}
    </p>
  );
}

export function DataTable(props: { children: ReactNode }): JSX.Element {
  return (
    <div className="v2-table-wrap">
      <table className="v2-table">{props.children}</table>
    </div>
  );
}

export type { CSSProperties };
