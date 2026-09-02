// The standard globals AtAt's plugin runtime installs on top of a bare JavaScriptCore
// context, beyond the ES2023 built-ins TypeScript already knows about.
//
// The full list is in `PluginJavaScriptPrelude.swift`: timers, `sleep`, `URL`,
// `URLSearchParams`, `TextEncoder`, `TextDecoder`, `atob`, `btoa`, `structuredClone` and
// `console`. Only the ones TypeScript's own libraries do not declare need to be here, and
// `lib: ["ES2022"]` in `tsconfig.json` is what keeps DOM declarations from promising a
// plugin things this runtime does not have.

/** Resolves after `milliseconds`. Backed by the same host timer as `setTimeout`. */
declare function sleep(milliseconds: number): Promise<void>;

/** UTF-8 only. The runtime's shim carries one encoding, which is the one the contract names. */
declare class TextEncoder {
  readonly encoding: "utf-8";
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  readonly encoding: "utf-8";
  decode(input?: Uint8Array | ArrayBuffer): string;
}

declare class URLSearchParams {
  keys(): IterableIterator<string>;
  delete(name: string): void;
  toString(): string;
}

declare class URL {
  constructor(input: string, base?: string);
  readonly searchParams: URLSearchParams;
  toString(): string;
}
