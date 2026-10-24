//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@shuind/dsh-codex-harness`.
* @module @shuind/dsh-codex-harness/invariant
*/
const PACKAGE_NAME = "@shuind/dsh-codex-harness";
/** Codex companion plugin name. */
const name = "codex-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* Codex has no independent lifecycle stream: its model-visible state is owned
* by the tool registry and session projection services it consumes.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
