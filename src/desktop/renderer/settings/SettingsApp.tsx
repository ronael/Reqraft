/**
 * Settings surface (DESKTOP.md lot 5). Lot 4 ships the window shell and the
 * entry points; the five tabs (Raccourcis, Providers, Modèles, Profils,
 * Diagnostic) land in lot 5.
 */
export function SettingsApp(): React.JSX.Element {
  return (
    <main className="settings">
      <header className="settings-band">
        <span className="capsule-brand">rq</span>
        <h1>Réglages</h1>
      </header>
      <p className="muted settings-placeholder">
        Les onglets de réglages arrivent avec le lot 5 : Raccourcis, Providers, Modèles, Profils,
        Diagnostic.
      </p>
    </main>
  );
}
