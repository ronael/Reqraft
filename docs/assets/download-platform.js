const RELEASE_BASE = "https://github.com/ronael/Reqraft/releases/download/v0.6.5";

export const DOWNLOAD_TARGETS = {
  macos: {
    label: "Download for macOS",
    detail: "Apple silicon \u00b7 Beta",
    href: `${RELEASE_BASE}/Reqraft-0.6.5-mac-arm64.dmg`,
    ariaLabel: "Download Reqraft desktop Beta for macOS on Apple silicon",
    releaseStatus: "Desktop Beta",
    installTitle: "Before installing on macOS",
    installDetail:
      "Without an Apple developer signature and notarization, macOS may block the first launch. Check the release notes before opening the app.",
  },
  windows: {
    label: "Download for Windows",
    detail: "Windows x64 \u00b7 Alpha",
    href: `${RELEASE_BASE}/Reqraft-0.6.5-win-x64-experimental.exe`,
    ariaLabel: "Download Reqraft desktop Alpha for Windows x64",
    releaseStatus: "Desktop Alpha",
    installTitle: "Before installing on Windows",
    installDetail:
      "Without a verified publisher signature, Windows SmartScreen may show a security warning. Check the release notes before running the installer.",
  },
  linux: {
    label: "Download for Linux",
    detail: "Linux x86_64 \u00b7 Alpha",
    href: `${RELEASE_BASE}/Reqraft-0.6.5-linux-x86_64-experimental.AppImage`,
    ariaLabel: "Download Reqraft desktop Alpha for Linux x86_64",
    releaseStatus: "Desktop Alpha",
    installTitle: "Before installing on Linux",
    installDetail:
      "The AppImage is unsigned. You may need to mark it as executable before opening it. Check the release notes for compatibility details.",
  },
  other: {
    label: "Choose a desktop build",
    detail: "macOS Beta \u00b7 Windows and Linux Alpha",
    href: "#download",
    ariaLabel: "View Reqraft desktop downloads",
    releaseStatus: "Desktop preview",
    installTitle: "Before you install",
    installDetail:
      "Desktop builds may be unsigned. Your operating system may show a security warning on first launch.",
  },
};

export function detectDesktopPlatform(navigatorLike = navigator) {
  const userAgent = String(navigatorLike.userAgent ?? "").toLowerCase();
  const uaDataPlatform = String(navigatorLike.userAgentData?.platform ?? "").toLowerCase();
  const legacyPlatform = String(navigatorLike.platform ?? "").toLowerCase();
  const platform = `${uaDataPlatform} ${legacyPlatform} ${userAgent}`;

  const isTouchMac = platform.includes("mac") && Number(navigatorLike.maxTouchPoints ?? 0) > 1;
  if (/android|iphone|ipad|ipod|cros/.test(userAgent) || isTouchMac) return "other";
  if (platform.includes("mac")) return "macos";
  if (platform.includes("win")) return "windows";
  if (platform.includes("linux")) return "linux";
  return "other";
}

export function applyPlatformDownloads(root = document, navigatorLike = navigator) {
  const platform = detectDesktopPlatform(navigatorLike);
  const target = DOWNLOAD_TARGETS[platform];
  root.documentElement.dataset.downloadPlatform = platform;

  root.querySelectorAll("[data-platform-download]").forEach((link) => {
    link.href = target.href;
    link.setAttribute("aria-label", target.ariaLabel);
    link.querySelector("strong").textContent = target.label;
    link.querySelector("small").textContent = target.detail;
    link.classList.add("platform-ready");
  });

  root.querySelectorAll("[data-release-status]").forEach((node) => {
    node.textContent = target.releaseStatus;
  });

  root.querySelectorAll("[data-install-title]").forEach((node) => {
    node.textContent = target.installTitle;
  });
  root.querySelectorAll("[data-install-detail]").forEach((node) => {
    node.textContent = target.installDetail;
  });

  root.querySelectorAll("[data-platform-row]").forEach((row) => {
    const matches = row.dataset.platformRow === platform;
    row.classList.toggle("is-platform-match", matches);
    if (matches) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");

    row.querySelectorAll("[data-platform-link]").forEach((link, index) => {
      link.classList.toggle("primary", matches && index === 0);
    });
  });

  return platform;
}

if (typeof document !== "undefined" && typeof navigator !== "undefined") {
  applyPlatformDownloads(document, navigator);
}
