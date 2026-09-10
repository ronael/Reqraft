import { nativeImage, type NativeImage } from "electron";
import { trayIconPng, type TrayState } from "./tray-icon.js";

/** Let macOS tint the idle silhouette; active/error colors must remain literal. */
export function createTrayImage(
  state: TrayState,
  platform: NodeJS.Platform = process.platform,
): NativeImage {
  const image = nativeImage.createFromBuffer(trayIconPng(state));
  image.setTemplateImage(platform === "darwin" && state === "repos");
  return image;
}
