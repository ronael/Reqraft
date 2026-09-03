import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

/**
 * Une confirmation qui s'efface, posée au-dessus de la surface.
 *
 * `InlineMessage` reste le message qui dure : il occupe une place dans la mise
 * en page, et un état vrai tant qu'il est vrai doit se lire aussi longtemps.
 * « Copié » n'est pas un état — c'est un accusé de réception. Laissé en ligne
 * il poussait le contenu, restait affiché sur le résultat suivant, et il
 * fallait le chasser à la main. Ici il flotte : il ne déplace rien, il ne
 * défile pas avec le corps, et il part seul.
 *
 * Une seule pièce partagée par la capsule, le popover et les réglages : trois
 * confirmations identiques n'ont aucune raison d'être écrites trois fois.
 */

export type ToastTone = "info" | "success" | "warning" | "error";

const TONE_ICONS: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

/**
 * Le temps de lecture, plancher et plafond compris.
 *
 * Une durée fixe traite « Copié » et une phrase de deux lignes de la même
 * façon : trop longue pour l'un, trop courte pour l'autre. La vitesse retenue
 * est basse à dessein — le message arrive sans être attendu, et le regard doit
 * d'abord le trouver.
 */
export const TOAST_MIN_MS = 1800;
export const TOAST_MAX_MS = 6000;
const TOAST_CHARS_PER_SECOND = 13;

export function toastDurationMs(text: string): number {
  const lecture = Math.round((text.length / TOAST_CHARS_PER_SECOND) * 1000);
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, lecture));
}

/** Une alerte interrompt la lecture ; une confirmation attend une pause. */
function urgent(tone: ToastTone): boolean {
  return tone === "warning" || tone === "error";
}

export interface ToastState {
  /**
   * Une identité par annonce.
   *
   * Deux copies de suite portent le même texte : sans elle, le second « Copié »
   * ne relancerait ni le minuteur ni l'animation, et rien à l'écran ne dirait
   * que la deuxième copie a bien eu lieu.
   */
  readonly id: number;
  readonly text: string;
  readonly tone: ToastTone;
}

/**
 * Des propriétés, pas des méthodes : elles sont faites pour être déstructurées
 * par les surfaces qui les appellent, et une méthode détachée de son objet
 * emporte un `this` que rien ne lie ici.
 */
export interface ToastControls {
  readonly toast: ToastState | null;
  readonly show: (text: string, tone?: ToastTone) => void;
  readonly dismiss: () => void;
}

/** L'annonce courante, et de quoi en poser une nouvelle. */
export function useToast(): ToastControls {
  const [toast, setToast] = useState<ToastState | null>(null);
  const derniereAnnonce = useRef(0);

  const show = useCallback((text: string, tone: ToastTone = "success"): void => {
    derniereAnnonce.current += 1;
    setToast({ id: derniereAnnonce.current, text, tone });
  }, []);

  const dismiss = useCallback((): void => {
    setToast(null);
  }, []);

  return useMemo(() => ({ toast, show, dismiss }), [toast, show, dismiss]);
}

export interface ToastProps {
  toast: ToastState | null;
  onDismiss(): void;
}

export function Toast({ toast, onDismiss }: Readonly<ToastProps>): React.JSX.Element | null {
  const id = toast?.id ?? null;
  const text = toast?.text ?? "";

  useEffect(() => {
    if (id === null) {
      return undefined;
    }
    const timer = window.setTimeout(onDismiss, toastDurationMs(text));
    return () => {
      window.clearTimeout(timer);
    };
  }, [id, text, onDismiss]);

  if (toast === null) {
    return null;
  }
  const Icon = TONE_ICONS[toast.tone];
  const alerte = urgent(toast.tone);

  return (
    <div className="toast-layer">
      {/* Remonté à chaque annonce : l'animation d'entrée rejoue, et les
          lecteurs d'écran relisent un message identique au précédent. */}
      <div
        key={toast.id}
        className={`toast toast-${toast.tone}`}
        role={alerte ? "alert" : "status"}
        aria-live={alerte ? "assertive" : "polite"}
      >
        <Icon size={13} className="toast-icon" aria-hidden />
        <span className="toast-text">{toast.text}</span>
      </div>
    </div>
  );
}
