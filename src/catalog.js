// Plain-Node test entry point. Pi imports catalog.ts directly so /reload
// does not retain a native ESM JavaScript module in the runtime import chain.
export * from './catalog.ts';
