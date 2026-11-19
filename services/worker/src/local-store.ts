import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { AudioStore } from "./synthesis.js";

/** Stockage sur disque pour le développement et les tests (jamais en production). */
export class LocalDirStore implements AudioStore {
  readonly bucket = "episode-audio";
  constructor(private readonly root: string) {}

  async put(path: string, bytes: Uint8Array): Promise<void> {
    const target = resolve(this.root, path);
    if (!target.startsWith(resolve(this.root))) throw new Error("path_traversal");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(join(target), bytes);
  }
}
