import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  mapRqUrlToFile,
  rqRendererUrl,
  RQ_RENDERER_HOST,
  RQ_SCHEME,
} from "@/desktop/main/protocol.js";

const RENDERER_DIR = path.resolve("/app/release/desktop/bundle/renderer");

describe("rq:// protocol (renderer over custom scheme)", () => {
  it("rqRendererUrl produit l'URL de la surface demandée", () => {
    expect(rqRendererUrl()).toBe(`${RQ_SCHEME}://${RQ_RENDERER_HOST}/index.html`);
    expect(rqRendererUrl("popover")).toBe(
      `${RQ_SCHEME}://${RQ_RENDERER_HOST}/index.html?surface=popover`,
    );
    expect(rqRendererUrl("settings")).toBe(
      `${RQ_SCHEME}://${RQ_RENDERER_HOST}/index.html?surface=settings`,
    );
  });

  it("mappe la racine sur index.html", () => {
    expect(mapRqUrlToFile(`${RQ_SCHEME}://${RQ_RENDERER_HOST}/`, RENDERER_DIR)).toBe(
      path.join(RENDERER_DIR, "index.html"),
    );
    expect(mapRqUrlToFile(`${RQ_SCHEME}://${RQ_RENDERER_HOST}/index.html`, RENDERER_DIR)).toBe(
      path.join(RENDERER_DIR, "index.html"),
    );
  });

  it("mappe les assets imbriqués", () => {
    expect(
      mapRqUrlToFile(`${RQ_SCHEME}://${RQ_RENDERER_HOST}/assets/index-abc.js`, RENDERER_DIR),
    ).toBe(path.join(RENDERER_DIR, "assets", "index-abc.js"));
  });

  it("les traversées, mêmes encodées, restent DANS le renderer (canonisation URL)", () => {
    // Le parser WHATWG canonise les segments `.`/`..`, même percent-encodés :
    // un chemin hostile est réécrit en chemin interne — sûr, jamais une fuite.
    expect(
      mapRqUrlToFile(`${RQ_SCHEME}://${RQ_RENDERER_HOST}/../preload/index.cjs`, RENDERER_DIR),
    ).toBe(path.join(RENDERER_DIR, "preload", "index.cjs"));
    expect(
      mapRqUrlToFile(`${RQ_SCHEME}://${RQ_RENDERER_HOST}/%2e%2e/%2e%2e/etc/passwd`, RENDERER_DIR),
    ).toBe(path.join(RENDERER_DIR, "etc", "passwd"));
    // La garde `startsWith` reste en défense en profondeur.
  });

  it("refuse les autres schemes et hôtes", () => {
    expect(mapRqUrlToFile("https://renderer/index.html", RENDERER_DIR)).toBeNull();
    expect(mapRqUrlToFile(`${RQ_SCHEME}://evil/index.html`, RENDERER_DIR)).toBeNull();
    expect(mapRqUrlToFile("pas une url", RENDERER_DIR)).toBeNull();
  });
});
