// Pure ID-generation tests still have an Obsidian window context, without any Node API in src/.
globalThis.activeWindow = { crypto: globalThis.crypto };
