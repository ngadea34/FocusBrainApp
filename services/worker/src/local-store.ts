import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { AudioStore } from "./synthesis.js";

/** Stockage sur disque pour le développement et les tests (jamais en production). */
export class LocalDirStore implements AudioStore {
  readonly bucket = "episode-audio";
  constructor(private readonly root: string) {}

  private safe(path: string): string {
    const base = resolve(this.root);
    const target = resolve(base, path);
    if (target !== base && !target.startsWith(base + sep)) throw new Error("path_traversal");
    return target;
  }

  async put(path: string, bytes: Uint8Array): Promise<void> {
    const target = this.safe(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(join(target), bytes);
  }

  async remove(paths: readonly string[]): Promise<void> {
    for (const p of paths) await rm(this.safe(p), { force: true });
  }

  async list(prefix: string): Promise<string[]> {
    const dir = this.safe(prefix);
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
    return entries
      .filter((e) => e.isFile())
      .map((e) => relative(resolve(this.root), join(e.parentPath, e.name)).split(sep).join("/"));
  }
}
