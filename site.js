const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const copyButtons = document.querySelectorAll("[data-copy]");

for (const button of copyButtons) {
  button.addEventListener("click", async () => {
    const command = button.getAttribute("data-copy");
    if (!command) return;

    try {
      await navigator.clipboard.writeText(command);
      button.classList.add("is-copied");
      window.setTimeout(() => button.classList.remove("is-copied"), 1800);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      const code = button.parentElement?.querySelector("code");
      if (!selection || !code) return;
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
}

const header = document.querySelector("[data-header]");
const darkSections = [
  ...document.querySelectorAll(".fidelity-section, .cli-section, .native-section"),
];

const updateHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 16);
  const headerLine = 36;
  const overDark = darkSections.some((section) => {
    const bounds = section.getBoundingClientRect();
    return bounds.top <= headerLine && bounds.bottom > headerLine;
  });
  header?.classList.toggle("on-dark", overDark);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const fidelityButtons = document.querySelectorAll("[data-fidelity]");
const fidelityPanels = document.querySelectorAll("[data-fidelity-panel]");

for (const button of fidelityButtons) {
  button.addEventListener("click", () => {
    const target = button.getAttribute("data-fidelity");
    for (const candidate of fidelityButtons) {
      const active = candidate === button;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    for (const panel of fidelityPanels) {
      panel.hidden = panel.getAttribute("data-fidelity-panel") !== target;
    }
  });
}

const levelContent = {
  minimal: {
    profile: "frontend",
    text: "Fix the login page on mobile while keeping the current authentication.",
    measure: "32%",
  },
  standard: {
    profile: "frontend",
    text: "Fix the login page on mobile while preserving the current authentication flow and existing desktop behavior. Reuse the project’s current components and styles, and do not change unrelated functionality.",
    measure: "62%",
  },
  complete: {
    profile: "frontend",
    text: "Objective: fix the login page on mobile. Preserve the existing authentication flow and desktop behavior. Reuse the current components, validation logic, and visual conventions. Limit changes to the responsive login experience. Validate the result at mobile and desktop widths, and report any missing context before making an architectural decision.",
    measure: "92%",
  },
};

const levelButtons = document.querySelectorAll("[data-level]");
const levelOutput = document.querySelector("[data-level-output]");
const levelLabel = document.querySelector("[data-level-label]");
const profileLabel = document.querySelector("[data-profile-label]");
const levelMeasure = document.querySelector("[data-level-measure]");
const levelPanel = document.querySelector("#level-output");

for (const button of levelButtons) {
  button.addEventListener("click", () => {
    const level = button.getAttribute("data-level");
    const content = levelContent[level];
    if (!content || !levelOutput || !levelLabel || !profileLabel || !levelMeasure) return;

    for (const candidate of levelButtons) {
      const active = candidate === button;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-selected", String(active));
      candidate.tabIndex = active ? 0 : -1;
    }

    levelOutput.textContent = content.text;
    levelLabel.textContent = level;
    profileLabel.textContent = content.profile;
    levelMeasure.style.width = content.measure;
    if (button.id) levelPanel?.setAttribute("aria-labelledby", button.id);
  });
}

const commandContent = {
  direct: {
    command: 'rp "fix form mobile"',
    result:
      "Fix the form on mobile while preserving the existing desktop behavior and leaving unrelated functionality unchanged.",
    meta: ["frontend", "standard", "faithful"],
    status: "ready",
  },
  file: {
    command: "rp --file request.md",
    result:
      "Reads the complete request from request.md, reformulates it with the configured profile and level, then writes only the improved prompt to stdout.",
    meta: ["file input", "configured defaults", "pipeable"],
    status: "request.md",
  },
  diff: {
    command: 'rp "add export button" --diff',
    result:
      "- add export button\n+ Add an export button using the existing button component and export flow, without changing the surrounding toolbar.",
    meta: ["inline diff", "scope visible", "inspectable"],
    status: "diff",
  },
  stats: {
    command: 'rp "review this request" --stats',
    result:
      "Review this request and identify concrete correctness issues, behavioral regressions, and missing tests. Report findings first, ordered by severity.",
    meta: ["1.2 s", "input / output tokens", "provider + model"],
    status: "measured",
  },
};

const commandButtons = document.querySelectorAll("[data-command]");
const consoleCommand = document.querySelector("[data-console-command]");
const consoleResult = document.querySelector("[data-console-result]");
const consoleMeta = document.querySelector("[data-console-meta]");
const consoleStatus = document.querySelector("[data-console-status]");
const commandPanel = document.querySelector("#command-output");

for (const button of commandButtons) {
  button.addEventListener("click", () => {
    const commandId = button.getAttribute("data-command");
    const content = commandContent[commandId];
    if (!content || !consoleCommand || !consoleResult || !consoleMeta || !consoleStatus) return;

    for (const candidate of commandButtons) {
      const active = candidate === button;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-selected", String(active));
      candidate.tabIndex = active ? 0 : -1;
    }

    consoleCommand.textContent = content.command;
    consoleResult.textContent = content.result;
    consoleResult.classList.toggle("is-diff", commandId === "diff");
    consoleStatus.textContent = content.status;
    if (button.id) commandPanel?.setAttribute("aria-labelledby", button.id);
    consoleMeta.replaceChildren(
      ...content.meta.map((item, index) => {
        const span = document.createElement("span");
        span.textContent = item;
        if (index === content.meta.length - 1 && commandId === "direct") {
          span.className = "meta-success";
        }
        return span;
      }),
    );
  });
}

const bindHorizontalTabs = (buttons) => {
  const tabs = [...buttons];
  for (const tab of tabs) {
    tab.addEventListener("keydown", (event) => {
      const currentIndex = tabs.indexOf(tab);
      let nextIndex = currentIndex;

      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex === currentIndex) return;

      event.preventDefault();
      tabs[nextIndex].click();
      tabs[nextIndex].focus();
    });
  }
};

bindHorizontalTabs(levelButtons);
bindHorizontalTabs(commandButtons);

const nativeStage = document.querySelector("[data-native-stage]");
const nativeReplay = document.querySelector("[data-native-replay]");
const nativeSteps = document.querySelectorAll("[data-native-step]");
const capsuleState = document.querySelector("[data-capsule-state]");
const capsuleResult = document.querySelector("[data-capsule-result]");
const selectedText = document.querySelector("[data-selected-text]");
const nativeTimers = [];
let nativeHasPlayed = false;

const nativeCopy = {
  idle: { status: "waiting", result: "" },
  invoke: { status: "captured", result: "fix the form on mobile don't change anything else" },
  analyze: {
    status: "analyzing locally…",
    result: "Detecting profile and preserving constraints…",
  },
  verify: {
    status: "ready",
    result:
      "Fix the form on mobile while preserving the current desktop behavior and leaving unrelated functionality unchanged.",
  },
  replace: { status: "applied", result: "" },
};

const setNativeStage = (stage) => {
  if (!nativeStage || !nativeCopy[stage]) return;
  nativeStage.setAttribute("data-stage", stage);
  if (capsuleState) capsuleState.textContent = nativeCopy[stage].status;
  if (capsuleResult) capsuleResult.textContent = nativeCopy[stage].result;
  if (selectedText) {
    selectedText.textContent =
      stage === "replace"
        ? "Fix the form on mobile while preserving the current desktop behavior and leaving unrelated functionality unchanged."
        : "fix the form on mobile don't change anything else";
  }
  for (const step of nativeSteps) {
    step.classList.toggle("is-active", step.getAttribute("data-native-step") === stage);
  }
};

const clearNativeTimers = () => {
  while (nativeTimers.length > 0) window.clearTimeout(nativeTimers.pop());
};

const runNativeSequence = () => {
  clearNativeTimers();
  if (reducedMotion.matches) {
    setNativeStage("verify");
    return;
  }

  setNativeStage("idle");
  const sequence = [
    [650, "invoke"],
    [1450, "analyze"],
    [2600, "verify"],
    [4700, "replace"],
  ];
  for (const [delay, stage] of sequence) {
    nativeTimers.push(window.setTimeout(() => setNativeStage(stage), delay));
  }
};

nativeReplay?.addEventListener("click", runNativeSequence);

if (nativeStage) {
  const nativeObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !nativeHasPlayed) {
        nativeHasPlayed = true;
        runNativeSequence();
      }
    },
    { threshold: 0.3 },
  );
  nativeObserver.observe(nativeStage);
}
