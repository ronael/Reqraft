import { RESULT_ACCEPT_TEXT_MAX_LENGTH } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Le résultat final, repris à la main.
 *
 * Il s'affichait dans un `<pre>` : un modèle place presque juste, et la seule
 * façon de corriger un mot était de relancer une génération entière ou de
 * coller ailleurs pour éditer là-bas. Le champ remplace le bloc sans rien
 * déplacer — même police, même interligne, même absence de cadre — parce que
 * la version montrée est aussi celle qui sera copiée, remplacée et comparée :
 * deux boîtes différentes selon qu'on édite ou non feraient sauter le texte au
 * premier clic.
 *
 * La hauteur suit le contenu sans JavaScript : le conteneur duplique le texte
 * dans un pseudo-élément invisible, et le champ occupe la même cellule de
 * grille. Un `scrollHeight` recalculé à chaque frappe ferait osciller la
 * capsule d'une ligne pendant la frappe, ce que la géométrie stable interdit.
 *
 * La capsule et le popover montrent le même champ. Ce que les deux surfaces ne
 * partagent pas, c'est la typographie : 13 px dans une capsule de 560 px, 11 px
 * dans un panneau de 320. Elle est donc portée par la classe de la surface, sur
 * le conteneur, et le champ comme son double la reprennent par héritage — une
 * seule déclaration par surface, jamais deux qui pourraient diverger.
 */

export interface ResultEditorProps {
  value: string;
  /** Ce que la synthèse vocale annonce : le champ n'a pas d'étiquette visible. */
  label: string;
  /** Pendant l'application, le texte est celui qui part : il ne bouge plus. */
  readOnly: boolean;
  /** La classe de la surface d'accueil, qui porte la typographie du texte. */
  surfaceClassName: string;
  onChange(text: string): void;
  /** Seules les surfaces dont la géométrie dépend de la frappe s'en servent. */
  onEditingChange?(editing: boolean): void;
}

export function ResultEditor(props: Readonly<ResultEditorProps>): React.JSX.Element {
  return (
    <div className={`result-editor ${props.surfaceClassName}`} data-replicated-value={props.value}>
      <textarea
        className="result-editor-input"
        aria-label={props.label}
        title={props.label}
        value={props.value}
        readOnly={props.readOnly}
        rows={1}
        // La borne du contrat, tenue là où le texte se saisit : refuser une
        // acceptation de 200 000 caractères après coup laisserait quelqu'un
        // devant un résultat qu'il ne peut plus appliquer.
        maxLength={RESULT_ACCEPT_TEXT_MAX_LENGTH}
        spellCheck={false}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        onFocus={() => {
          props.onEditingChange?.(true);
        }}
        onBlur={() => {
          props.onEditingChange?.(false);
        }}
      />
    </div>
  );
}
