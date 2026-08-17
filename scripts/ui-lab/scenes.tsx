/* @jsxImportSource @opentui/react */
import { useState } from "react";
import {
  ActionRow,
  Button,
  Modal,
  ScrollArea,
  Select,
  TextInput,
} from "../../src/ui/components/index.js";
import { COLOR } from "../../src/ui/theme/tui.js";
import type { LabScene } from "./scene-list.js";

const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `ligne ${String(i + 1)} — some wrapped content`).join(
  "\n",
);
const UNICODE_TEXT = "héllo wörld — 日本語のテキスト 🚀 ñandú";

function TextInputEmpty(): React.ReactNode {
  const [value, setValue] = useState("");
  return (
    <TextInput
      value={value}
      onChange={setValue}
      onSubmit={() => undefined}
      rows={4}
      width={64}
      autoFocus
    />
  );
}

function TextInputPlaceholder(): React.ReactNode {
  const [value, setValue] = useState("");
  return (
    <TextInput
      value={value}
      onChange={setValue}
      onSubmit={() => undefined}
      rows={4}
      width={64}
      autoFocus
      placeholder="Describe what you want to build..."
    />
  );
}

function TextInputWithValue(): React.ReactNode {
  const [value, setValue] = useState("fais moi une landing page pour mon site");
  return (
    <TextInput value={value} onChange={setValue} onSubmit={() => undefined} rows={4} width={64} autoFocus />
  );
}

function TextInputDisabled(): React.ReactNode {
  return <TextInput value="read only" onChange={() => undefined} onSubmit={() => undefined} rows={4} width={64} disabled />;
}

function TextInputError(): React.ReactNode {
  const [value, setValue] = useState("invalid input");
  return (
    <TextInput
      value={value}
      onChange={setValue}
      onSubmit={() => undefined}
      rows={4}
      width={64}
      autoFocus
      error
    />
  );
}

function TextInputLong(): React.ReactNode {
  const [value, setValue] = useState(LONG_TEXT);
  return <TextInput value={value} onChange={setValue} onSubmit={() => undefined} rows={6} width={64} autoFocus />;
}

function TextInputNarrow(): React.ReactNode {
  const [value, setValue] = useState("une phrase assez longue pour tester le retour à la ligne");
  return <TextInput value={value} onChange={setValue} onSubmit={() => undefined} rows={4} width={26} autoFocus />;
}

function TextInputUnicode(): React.ReactNode {
  const [value, setValue] = useState(UNICODE_TEXT);
  return <TextInput value={value} onChange={setValue} onSubmit={() => undefined} rows={4} width={64} autoFocus />;
}

function TextInputContinuation(): React.ReactNode {
  const [value, setValue] = useState("première ligne\\");
  return (
    <TextInput value={value} onChange={setValue} onSubmit={() => undefined} rows={4} width={64} autoFocus />
  );
}

function ButtonDefault(): React.ReactNode {
  return (
    <box flexDirection="column" rowGap={2} style={{ padding: 2 }}>
      <Button label="Generate" hint="^G" onActivate={() => undefined} />
      <Button label="Open profile" hint="^P" onActivate={() => undefined} />
    </box>
  );
}

function ButtonLongLabel(): React.ReactNode {
  return (
    <box style={{ padding: 2 }}>
      <Button
        label="A rather long label to see how the button stretches and wraps"
        onActivate={() => undefined}
      />
    </box>
  );
}

function ButtonDisabled(): React.ReactNode {
  return (
    <box flexDirection="column" rowGap={2} style={{ padding: 2 }}>
      <Button label="Enabled" onActivate={() => undefined} />
      <Button label="Disabled" disabled onActivate={() => undefined} />
    </box>
  );
}

function ActionRowStates(): React.ReactNode {
  return (
    <box flexDirection="column" rowGap={1} style={{ padding: 2 }}>
      <ActionRow label="Default row" />
      <ActionRow label="Highlighted row" highlighted />
      <ActionRow label="Selected row" selected />
      <ActionRow label="Disabled row" disabled />
      <ActionRow label="Row with a hint" hint="^G" />
    </box>
  );
}

function ActionRowFocusable(): React.ReactNode {
  return (
    <box flexDirection="column" rowGap={1} style={{ padding: 2 }}>
      <text fg={COLOR.muted}>Click a row to focus it, then press Enter.</text>
      <ActionRow label="Clickable row" focusable onActivate={() => undefined} />
      <ActionRow label="Another row" focusable onActivate={() => undefined} />
    </box>
  );
}

function ActionRowLongText(): React.ReactNode {
  return (
    <box style={{ padding: 2, width: 40 }}>
      <ActionRow label="A very long label that should truncate or wrap gracefully inside a narrow row" />
    </box>
  );
}

const SELECT_OPTIONS = [
  { label: "auto — detected", value: "auto" },
  { label: "landing — marketing pages", value: "landing" },
  { label: "api — backend endpoints", value: "api" },
  { label: "data — analysis and reporting", value: "data" },
  { label: "creative — copy and storytelling", value: "creative" },
];

function SelectDefault(): React.ReactNode {
  const [value, setValue] = useState("landing");
  return (
    <box style={{ padding: 2 }}>
      <Select options={SELECT_OPTIONS} value={value} onSelect={setValue} height={6} width={52} autoFocus />
    </box>
  );
}

function SelectLongList(): React.ReactNode {
  const options = Array.from({ length: 30 }, (_, i) => ({
    label: `option-${String(i + 1).padStart(2, "0")} — description`,
    value: String(i),
  }));
  const [value, setValue] = useState("07");
  return (
    <box style={{ padding: 2 }}>
      <Select options={options} value={value} onSelect={setValue} height={10} width={52} autoFocus />
    </box>
  );
}

function SelectDisabled(): React.ReactNode {
  return (
    <box style={{ padding: 2 }}>
      <Select options={SELECT_OPTIONS} value="auto" onSelect={() => undefined} height={6} width={52} disabled />
    </box>
  );
}

function ModalWithControls(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("landing");
  return (
    <box flexDirection="column" rowGap={2} style={{ padding: 2 }}>
      <Button label={`Open modal (choice: ${choice})`} onActivate={() => setOpen(true)} />
      {open && (
        <Modal title="Change profile" hint="  ↑↓ navigate · Enter select · Esc close" onClose={() => setOpen(false)} width={56}>
          <Select
            options={SELECT_OPTIONS}
            value={choice}
            onSelect={(value) => {
              setChoice(value);
              setOpen(false);
            }}
            height={6}
            width={50}
            autoFocus
          />
        </Modal>
      )}
    </box>
  );
}

function ModalFocusRestore(): React.ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <box flexDirection="column" rowGap={2} style={{ padding: 2 }}>
      <text fg={COLOR.muted}>
        Focus the button, open the modal, close it — focus must come back to the button.
      </text>
      <Button label="Focus me, then open" onActivate={() => setOpen(true)} />
      {open && (
        <Modal title="Focus restore" hint="  Esc close" onClose={() => setOpen(false)} width={56}>
          <box style={{ padding: 1 }}>
            <text>The modal is open. Press Esc to close.</text>
          </box>
        </Modal>
      )}
    </box>
  );
}

function ScrollAreaShort(): React.ReactNode {
  return (
    <box style={{ padding: 2 }}>
      <ScrollArea height={5} width={52}>
        <text>Just two lines.</text>
        <text>No scrollbar needed.</text>
      </ScrollArea>
    </box>
  );
}

function ScrollAreaLong(): React.ReactNode {
  return (
    <box style={{ padding: 2 }}>
      <ScrollArea height={8} width={52} focused>
        {Array.from({ length: 40 }, (_, i) => (
          <text key={i} fg={i % 2 === 0 ? COLOR.text : COLOR.muted}>
            {`line ${String(i + 1).padStart(2, "0")} — scroll with the wheel, arrows, or drag`}
          </text>
        ))}
      </ScrollArea>
    </box>
  );
}

export const LAB_SCENES: LabScene[] = [
  {
    id: "text-input-empty",
    component: "TextInput",
    name: "Empty",
    check: "type characters, move the caret with arrows, Backspace, Home/End",
    render: TextInputEmpty,
  },
  {
    id: "text-input-placeholder",
    component: "TextInput",
    name: "Placeholder",
    check: "placeholder visible until the first character",
    render: TextInputPlaceholder,
  },
  {
    id: "text-input-value",
    component: "TextInput",
    name: "With value",
    check: "caret lands at the end; edit in the middle with arrows",
    render: TextInputWithValue,
  },
  {
    id: "text-input-continuation",
    component: "TextInput",
    name: "Backslash + Enter",
    check: "the trailing backslash becomes a newline, Enter alone submits",
    render: TextInputContinuation,
  },
  {
    id: "text-input-disabled",
    component: "TextInput",
    name: "Disabled",
    check: "no caret, no typing, dimmed",
    render: TextInputDisabled,
  },
  {
    id: "text-input-error",
    component: "TextInput",
    name: "Error",
    check: "error tint on text and caret",
    render: TextInputError,
  },
  {
    id: "text-input-long",
    component: "TextInput",
    name: "Long value",
    check: "word wrap, caret stays visible while moving",
    render: TextInputLong,
  },
  {
    id: "text-input-narrow",
    component: "TextInput",
    name: "Narrow width",
    check: "wrapping at 26 columns, caret movement across wrapped lines",
    render: TextInputNarrow,
  },
  {
    id: "text-input-unicode",
    component: "TextInput",
    name: "Unicode",
    check: "grapheme-aware caret over accented chars, CJK and emoji",
    render: TextInputUnicode,
  },
  {
    id: "button-default",
    component: "Button",
    name: "Default",
    check: "hover, click (whole surface), Tab focus, Enter/Space activate",
    render: ButtonDefault,
  },
  {
    id: "button-long",
    component: "Button",
    name: "Long label",
    check: "label stretches the button, hitbox stays the whole surface",
    render: ButtonLongLabel,
  },
  {
    id: "button-disabled",
    component: "Button",
    name: "Disabled",
    check: "dimmed, no hover, no focus, no activation",
    render: ButtonDisabled,
  },
  {
    id: "action-row-states",
    component: "ActionRow",
    name: "States",
    check: "hover each row — the whole row reacts, not just the label",
    render: ActionRowStates,
  },
  {
    id: "action-row-focus",
    component: "ActionRow",
    name: "Focusable",
    check: "click to focus, Enter activates, focus state visible",
    render: ActionRowFocusable,
  },
  {
    id: "action-row-long",
    component: "ActionRow",
    name: "Long text",
    check: "long label in a narrow row",
    render: ActionRowLongText,
  },
  {
    id: "select-default",
    component: "Select",
    name: "Default",
    check: "↑↓ move (wrapping), Enter selects, click any row, ● marks the current value",
    render: SelectDefault,
  },
  {
    id: "select-long",
    component: "Select",
    name: "Long list",
    check: "30 options scroll; the highlighted row stays visible",
    render: SelectLongList,
  },
  {
    id: "select-disabled",
    component: "Select",
    name: "Disabled",
    check: "dimmed, no keyboard, no mouse",
    render: SelectDisabled,
  },
  {
    id: "modal-controls",
    component: "Modal",
    name: "With controls",
    check: "open, the Select is focused, navigate, Enter closes with the choice",
    render: ModalWithControls,
  },
  {
    id: "modal-focus-restore",
    component: "Modal",
    name: "Focus restore",
    check: "focus the button → open → close → focus is back on the button",
    render: ModalFocusRestore,
  },
  {
    id: "scroll-area-short",
    component: "ScrollArea",
    name: "Short content",
    check: "no scrollbar when the content fits",
    render: ScrollAreaShort,
  },
  {
    id: "scroll-area-long",
    component: "ScrollArea",
    name: "Long content",
    check: "wheel scroll, arrow keys (focused), scrollbar tracks the content, resize the terminal",
    render: ScrollAreaLong,
  },
];
