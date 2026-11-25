import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Copy, PanelsTopLeft, RefreshCw, SquareTerminal } from "lucide-react";
import type {
  AgentCopyRequest,
  DesktopAgentStatus,
  DesktopAgentsState,
} from "@/apps/desktop/shared/ipc-contract.js";
import { Button } from "../shared/Button.js";
import { InlineMessage } from "../shared/InlineMessage.js";
import { ipcFailureMessage } from "../shared/ipc-failure.js";
import { Select } from "../shared/Select.js";
import { useT, type Translate } from "../shared/i18n.js";
import { ProviderLogo } from "./ProviderLogo.js";

/**
 * Réglages › Agents IA : Reqraft dans les agents du terminal.
 *
 * Codex et Claude Code ouvrent leur brouillon dans `$VISUAL` avec Ctrl+G ;
 * `rp edit` est cet éditeur. L'onglet trouve les agents, active la ligne du
 * fichier de démarrage, ou donne de quoi le faire soi-même : la ligne, ou une
 * consigne qu'un agent exécute. Chaque action garde son propre état, pour
 * qu'une copie ou une vérification ne grise pas l'activation d'un autre agent.
 */

const AGENT_LOGOS: Partial<Record<string, "openai" | "anthropic">> = {
  codex: "openai",
  "claude-code": "anthropic",
};

/** What the user asked to see once copied: a line, or the agent prompt. */
type Shown = { kind: "prompt" } | { kind: "line"; id: string } | null;

export function AgentsTab(): React.JSX.Element {
  const t = useT();
  const [state, setState] = useState<DesktopAgentsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [switching, setSwitching] = useState<Partial<Record<string, boolean>>>({});
  const [rowErrors, setRowErrors] = useState<Partial<Record<string, string>>>({});
  const [justEnabled, setJustEnabled] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setChecking(true);
    try {
      setState(await window.reqraft.agentsState());
      setLoadError(null);
    } catch (error) {
      setLoadError(ipcFailureMessage(error));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (agent: DesktopAgentStatus, enabled: boolean): Promise<void> => {
    setSwitching((current) => ({ ...current, [agent.id]: true }));
    setRowErrors((current) => ({ ...current, [agent.id]: undefined }));
    try {
      setState(await window.reqraft.setAgentEnabled(agent.id, enabled));
      setJustEnabled(enabled ? agent.id : null);
      setShown(null);
    } catch (error) {
      setRowErrors((current) => ({ ...current, [agent.id]: ipcFailureMessage(error) }));
    } finally {
      setSwitching((current) => ({ ...current, [agent.id]: false }));
    }
  };

  const chooseReview = async (inApp: boolean): Promise<void> => {
    setReviewSaving(true);
    setReviewError(null);
    try {
      setState(await window.reqraft.setReviewInApp(inApp));
    } catch (error) {
      setReviewError(ipcFailureMessage(error));
    } finally {
      setReviewSaving(false);
    }
  };

  const copy = (request: AgentCopyRequest, then: Shown): void => {
    void window.reqraft.copyAgentText(request).catch(() => undefined);
    setShown(then);
  };

  if (state === null) {
    return loadError === null ? (
      <p className="provider-empty">{t("settings.agents.loading")}</p>
    ) : (
      <InlineMessage tone="error" role="alert">
        {loadError}
      </InlineMessage>
    );
  }

  const canWrite = state.cli.installed && state.shell !== null;
  // Installed agents, supported or not, and the featured ones even when
  // missing; the other supported agents fit in one line under the list.
  const visible = state.agents.filter((agent) => agent.path !== null || agent.featured);

  return (
    <>
      <section className="provider-section">
        <div className="provider-section-head">
          <h3 className="settings-subhead">{t("settings.agents.cliSection")}</h3>
        </div>
        <div className="provider-list">
          <CliRow state={state} checking={checking} t={t} onCheck={load} onCopy={copy} />
        </div>
        {state.shell === null && (
          <InlineMessage tone="warning" className="agents-ready">
            {t("settings.agents.shellUnknown")}
          </InlineMessage>
        )}
      </section>

      <section className="provider-section">
        <div className="provider-section-head">
          <h3 className="settings-subhead">{t("settings.agents.agentsSection")}</h3>
          <Button
            variant="neutral"
            title={t("settings.agents.promptHint")}
            onClick={() => {
              copy({ what: "prompt" }, { kind: "prompt" });
            }}
          >
            <Bot size={13} aria-hidden /> {t("settings.agents.copyPrompt")}
          </Button>
        </div>
        {shown?.kind === "prompt" && (
          <div className="agents-prompt">
            <code className="agents-command">{state.agentPrompt}</code>
            <span className="settings-row-detail">{t("settings.agents.promptHint")}</span>
          </div>
        )}
        <div className="provider-list">
          {visible.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              canWrite={canWrite}
              busy={switching[agent.id] === true}
              error={rowErrors[agent.id]}
              justEnabled={justEnabled === agent.id}
              lineShown={shown?.kind === "line" && shown.id === agent.id}
              shellFile={state.shell?.file ?? ""}
              t={t}
              onToggle={(enabled) => void toggle(agent, enabled)}
              onCopyLine={() => {
                copy({ what: "line", id: agent.id }, { kind: "line", id: agent.id });
              }}
            />
          ))}
        </div>
        {state.alsoSupported.length > 0 && (
          <p className="settings-row-detail agents-footnote">
            {t("settings.agents.alsoSupported", { agents: state.alsoSupported.join(", ") })}
          </p>
        )}
        {state.shell !== null && (
          <p className="settings-row-detail agents-footnote">
            {t("settings.agents.footer", { file: state.shell.file })}
          </p>
        )}
      </section>

      <section className="provider-section">
        <div className="provider-section-head">
          <h3 className="settings-subhead">{t("settings.agents.reviewSection")}</h3>
        </div>
        <div className="provider-list">
          <div className="provider-row">
            <span className="provider-logo agents-cli-logo" aria-hidden>
              <PanelsTopLeft size={20} strokeWidth={1.7} />
            </span>
            <span className="provider-copy">
              <span className="settings-row-title provider-name">
                <span className="provider-name-text">{t("settings.agents.reviewTitle")}</span>
              </span>
              <span className="settings-row-detail">{t("settings.agents.reviewDetail")}</span>
              {reviewError !== null && (
                <InlineMessage tone="error" role="alert" className="agents-ready">
                  {reviewError}
                </InlineMessage>
              )}
            </span>
            <span className="provider-key-control">
              <Select
                value={state.reviewInApp ? "app" : "terminal"}
                ariaLabel={t("settings.agents.reviewTitle")}
                disabled={reviewSaving}
                onChange={(value) => void chooseReview(value === "app")}
                options={[
                  { value: "app", label: t("settings.agents.reviewInApp") },
                  { value: "terminal", label: t("settings.agents.reviewInTerminal") },
                ]}
              />
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

function CliRow(
  props: Readonly<{
    state: DesktopAgentsState;
    checking: boolean;
    t: Translate;
    onCheck(): Promise<void>;
    onCopy(request: AgentCopyRequest, then: Shown): void;
  }>,
): React.JSX.Element {
  const { state, t } = props;
  const cli = state.cli;
  return (
    <div className="provider-row">
      <span className="provider-logo agents-cli-logo" aria-hidden>
        <SquareTerminal size={20} strokeWidth={1.7} />
      </span>
      <span className="provider-copy">
        <span className="settings-row-title provider-name">
          <span className="provider-name-text">{t("settings.agents.cliName")}</span>
          {cli.installed && (
            <span className="provider-default-badge agents-badge-on">
              <Check size={11} aria-hidden /> {t("settings.agents.installedBadge")}
            </span>
          )}
        </span>
        {cli.installed ? (
          <>
            <span className="settings-row-detail mono">
              {cli.version === null
                ? t("settings.agents.cliPath", { path: cli.path })
                : t("settings.agents.cliInstalled", { version: cli.version, path: cli.path })}
            </span>
            {state.shell !== null && (
              <span className="settings-row-detail mono">
                {t("settings.agents.shell", { shell: state.shell.name, file: state.shell.file })}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="settings-row-detail">{t("settings.agents.cliMissing")}</span>
            <code className="agents-command">{cli.installCommand}</code>
          </>
        )}
      </span>
      {!cli.installed && (
        <span className="provider-key-control">
          <Button
            variant="neutral"
            onClick={() => {
              props.onCopy({ what: "install" }, null);
            }}
          >
            <Copy size={13} aria-hidden /> {t("settings.agents.copyCommand")}
          </Button>
          <Button variant="neutral" disabled={props.checking} onClick={() => void props.onCheck()}>
            <RefreshCw size={13} aria-hidden className={props.checking ? "spin" : undefined} />{" "}
            {t("settings.agents.check")}
          </Button>
        </span>
      )}
    </div>
  );
}

function AgentRow(
  props: Readonly<{
    agent: DesktopAgentStatus;
    canWrite: boolean;
    busy: boolean;
    error: string | undefined;
    justEnabled: boolean;
    lineShown: boolean;
    shellFile: string;
    t: Translate;
    onToggle(enabled: boolean): void;
    onCopyLine(): void;
  }>,
): React.JSX.Element {
  const { agent, t } = props;
  const logo = AGENT_LOGOS[agent.id];
  return (
    <div className="provider-row">
      {logo === undefined ? (
        <span className="provider-logo agents-cli-logo" aria-hidden>
          <SquareTerminal size={20} strokeWidth={1.7} />
        </span>
      ) : (
        <ProviderLogo providerId={logo} label={agent.label} />
      )}
      <span className="provider-copy">
        <span className="settings-row-title provider-name">
          <span className="provider-name-text">{agent.label}</span>
          {agent.enabled && (
            <span className="provider-default-badge agents-badge-on">
              <Check size={11} aria-hidden /> {t("settings.agents.enabledBadge")}
            </span>
          )}
          {!agent.supported && (
            <span className="provider-default-badge">{t("settings.agents.unsupportedBadge")}</span>
          )}
        </span>
        <span className="settings-row-detail">
          {agent.supported
            ? t("settings.agents.how", { shortcut: agent.shortcut ?? "" })
            : agent.reason}
        </span>
        <span className="settings-row-detail mono">
          {agent.path === null
            ? t("settings.agents.notFound")
            : t("settings.agents.found", { path: agent.path })}
        </span>
        {props.lineShown && agent.line !== null && !agent.enabled && (
          <>
            <code className="agents-command">{agent.line}</code>
            <span className="settings-row-detail">
              {t("settings.agents.manualHint", { file: props.shellFile })}
            </span>
          </>
        )}
        {props.justEnabled && agent.enabled && (
          <InlineMessage tone="success" className="agents-ready">
            {t("settings.agents.enabled", { agent: agent.label, command: agent.command })}
          </InlineMessage>
        )}
        {props.error !== undefined && (
          <InlineMessage tone="error" role="alert" className="agents-ready">
            {props.error}
          </InlineMessage>
        )}
      </span>
      {agent.supported && (
        <span className="provider-key-control">
          {agent.enabled ? (
            <Button
              variant="neutral"
              disabled={props.busy}
              onClick={() => {
                props.onToggle(false);
              }}
            >
              {t("settings.agents.disable")}
            </Button>
          ) : (
            <>
              <Button variant="neutral" disabled={agent.line === null} onClick={props.onCopyLine}>
                <Copy size={13} aria-hidden /> {t("settings.agents.copyLine")}
              </Button>
              <Button
                disabled={!props.canWrite || props.busy}
                title={props.canWrite ? undefined : t("settings.agents.needsCli")}
                onClick={() => {
                  props.onToggle(true);
                }}
              >
                {t("settings.agents.enable")}
              </Button>
            </>
          )}
        </span>
      )}
    </div>
  );
}
