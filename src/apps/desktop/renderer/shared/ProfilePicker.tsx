import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Search } from "lucide-react";
import { type ProfileCatalogEntry } from "@/apps/desktop/shared/ipc-contract.js";
import { filterProfiles, groupProfiles } from "./profiles.js";

/**
 * Choosing a profile when there may be many of them.
 *
 * A row of chips works for the six built-ins and falls apart the moment
 * someone writes their own: eight profiles already wrapped onto three lines.
 * So the choice is progressive — a trigger showing what is active, and a
 * searchable list behind it, whose height never depends on the catalogue.
 *
 * The list takes over the popover body rather than floating above it. The
 * window is 320×260, fixed and not resizable, and Electron draws nothing
 * outside those bounds: an overlay panel is simply cut off. Replacing the body
 * is what keeps every row reachable at that size.
 */

export interface ProfileTriggerProps {
  label: string;
  onOpen(): void;
}

export function ProfileTrigger(props: Readonly<ProfileTriggerProps>): React.JSX.Element {
  return (
    <button type="button" className="profile-trigger" aria-haspopup="dialog" onClick={props.onOpen}>
      <span className="profile-trigger-label">profil</span>
      <span className="profile-trigger-value mono">{props.label}</span>
      <ChevronDown size={13} aria-hidden />
    </button>
  );
}

export interface ProfileSheetProps {
  entries: ProfileCatalogEntry[];
  selectedId: string;
  onSelect(id: string): void;
  onClose(): void;
  onManage(): void;
}

export function ProfileSheet(props: Readonly<ProfileSheetProps>): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => filterProfiles(props.entries, query), [props.entries, query]);
  const groups = useMemo(() => groupProfiles(matches), [matches]);
  // Flattened in display order, so the arrows walk the list as it is read.
  const walkable = useMemo(() => groups.flatMap((group) => group.entries), [groups]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  return (
    <section
      className="profile-sheet"
      role="dialog"
      aria-label="Choisir un profil"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose();
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          setHighlighted((current) =>
            walkable.length === 0 ? 0 : (current + step + walkable.length) % walkable.length,
          );
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const target = walkable[highlighted];
          if (target) props.onSelect(target.id);
        }
      }}
    >
      <div className="profile-sheet-head">
        <button
          type="button"
          className="profile-sheet-back"
          aria-label="Revenir à la saisie"
          onClick={props.onClose}
        >
          <ChevronLeft size={13} aria-hidden />
          Profils
        </button>
        <span className="profile-sheet-count">
          {props.entries.length} disponible{props.entries.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="profile-sheet-search">
        <Search size={12} aria-hidden />
        <input
          ref={searchRef}
          className="profile-sheet-input"
          placeholder="Rechercher un profil…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </div>

      <div className="profile-sheet-list">
        {walkable.length === 0 && (
          <p className="profile-sheet-empty">Aucun profil ne correspond.</p>
        )}
        {groups.map((group) => (
          <div key={group.origin} className="profile-sheet-group">
            <div className="profile-sheet-group-label">{group.label}</div>
            {group.entries.map((entry) => {
              const index = walkable.indexOf(entry);
              const active = entry.id === props.selectedId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={
                    index === highlighted
                      ? "profile-option profile-option-highlighted"
                      : "profile-option"
                  }
                  aria-current={active}
                  title={entry.description}
                  onMouseEnter={() => {
                    setHighlighted(index);
                  }}
                  onClick={() => {
                    props.onSelect(entry.id);
                  }}
                >
                  <span
                    className={active ? "profile-dot profile-dot-active" : "profile-dot"}
                    aria-hidden
                  />
                  <span className="profile-option-name mono">{entry.name}</span>
                  <span className="profile-option-hint">
                    {active ? "actif" : entry.description}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <button type="button" className="profile-sheet-manage" onClick={props.onManage}>
        <span>Gérer les profils…</span>
        <span aria-hidden>›</span>
      </button>
    </section>
  );
}
