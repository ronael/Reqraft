interface PromptEditorProps {
  value: string;
  label: string;
  readOnly: boolean;
  onChange(text: string): void;
  onEditingChange(editing: boolean): void;
}

/** Le prompt de départ, modifiable sans changer l'apparence de la ligne « avant ». */
export function PromptEditor(props: Readonly<PromptEditorProps>): React.JSX.Element {
  return (
    <div className="capsule-source-editor" data-replicated-value={props.value}>
      <textarea
        className="capsule-source-input"
        aria-label={props.label}
        title={props.label}
        value={props.value}
        readOnly={props.readOnly}
        rows={1}
        spellCheck={false}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        onFocus={() => {
          props.onEditingChange(true);
        }}
        onBlur={() => {
          props.onEditingChange(false);
        }}
      />
    </div>
  );
}
