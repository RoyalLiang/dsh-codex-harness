import z from "@deepseek-ai/schemastery";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
//#region lib/types/context.js
const CODEX_CONTEXT_MAX = 1e6;
//#endregion
//#region lib/types/prompt.js
/** Default plugin-owned Codex operating prompt. */
const DEFAULT_CODEX_SYSTEM_PROMPT = String.raw`## General

- When searching for text or files, prefer using rg or rg --files respectively because rg is much faster than alternatives like grep. If rg is not available, use the next best alternative.

## Editing constraints

- Default to ASCII when editing or creating files. Only introduce non-ASCII or other Unicode characters when there is a clear justification and the file already uses them.
- Add succinct code comments that explain non-obvious code. Do not add comments that merely narrate assignments or control flow.
- You may be in a dirty git worktree. Never revert existing changes you did not make unless the user explicitly requests it. If unrelated files are changed, leave them alone.

## Planning

- Use update_plan for work with multiple meaningful steps. Keep the plan current as the task progresses.
- Do not use a plan for a trivial one-step request.

## dsh session

- The user and you share one workspace. Inspect the repository and every applicable AGENTS.md before editing.

## Task execution

- Keep the user informed with concise progress updates and lead with the result.

## Presenting your work

- Be concise, direct, friendly, and actionable.
- For substantial work, explain what changed and why, then briefly note how the work was verified and what comes next.
- Do not dump large files into the conversation; refer to their paths.
- Use plain text with short sections only when they improve scanability.

## Working principles

- Actively establish the user's current context rather than relying on stale assumptions or prior context. Before committing to an approach that could materially shape the outcome or direction of the work, state the intended path and align it with the user; clarify any material uncertainty first. Then pursue the user's goal through the clearest, most effective path.
- Keep only the essential logic and core actions. Don't explain or test what was removed or why something wasn't done, especially when writing documentation or communicating. Convey enough valuable information with as few words as possible.
- Solve problems by thinking from first principles and at a higher level.
`;
/** Default deployment Persona template used by the Codex preset. */
const DEFAULT_CODEX_PERSONA = String.raw`You are Codex, a coding agent based on the {{model}} model. Your working directory is {{cwd}}.`;
/** Default DSH Core source-checkout guidance template. */
const DEFAULT_DSH_CORE_SOURCE_PROMPT = String.raw`The DeepSeek Harness implementation checkout is at {{sourceRoot}}. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.`;
/** Default DSH Web runtime guidance template. */
const DEFAULT_DSH_CORE_WEB_PROMPT = [
	"You are interacting with the user through the DeepSeek Harness Web GUI at {{webUrl}}.",
	"When the user refers to \"this page\", \"this GUI\", or \"this app\" without naming another target, they mean this GUI.",
	"The browser provides no implicit DOM, route, or screenshot context.",
	"The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while `pnpm run dev:web` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates.",
	"Every other change - the apps/web shell and plain packages - requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh.",
	"Starting another server does not update this GUI.",
	"The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__.",
	"Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL."
].join(" ");
//#endregion
//#region lib/types/settings.js
/** Shared host-side Codex settings contract. */
/** Live Codex controls shared by the Web UI and agent layer. */
const CODEX_SETTINGS_NAMESPACE = "codex";
/** Default settings exposed even before a Codex session is opened. */
const CODEX_SETTINGS_ENTRY = {
	fast: false,
	fastModeControlEnabled: true,
	persona: DEFAULT_CODEX_PERSONA,
	harnessSourcePrompt: DEFAULT_DSH_CORE_SOURCE_PROMPT,
	webSurfacePrompt: DEFAULT_DSH_CORE_WEB_PROMPT,
	systemPrompt: DEFAULT_CODEX_SYSTEM_PROMPT,
	promptEnabled: true,
	terminalToolsEnabled: true,
	patchToolEnabled: true,
	planToolEnabled: true,
	hostedWebSearchEnabled: true,
	remoteCompactionEnabled: true,
	activityIndicatorEnabled: true
};
const CODEX_SETTINGS_SCHEMA = z.object({
	fast: z.boolean().default(false),
	fastModeControlEnabled: z.boolean().default(true),
	contextWindow: z.number().step(1).min(1).max(CODEX_CONTEXT_MAX),
	persona: z.string().default(DEFAULT_CODEX_PERSONA),
	harnessSourcePrompt: z.string().default(DEFAULT_DSH_CORE_SOURCE_PROMPT),
	webSurfacePrompt: z.string().default(DEFAULT_DSH_CORE_WEB_PROMPT),
	systemPrompt: z.string().default(DEFAULT_CODEX_SYSTEM_PROMPT),
	promptEnabled: z.boolean().default(true),
	terminalToolsEnabled: z.boolean().default(true),
	patchToolEnabled: z.boolean().default(true),
	planToolEnabled: z.boolean().default(true),
	hostedWebSearchEnabled: z.boolean().default(true),
	remoteCompactionEnabled: z.boolean().default(true),
	activityIndicatorEnabled: z.boolean().default(true)
});
//#endregion
//#region lib/types/installer.js
/** Install the user-visible Codex agent preset supplied by this bundle. */
const PRESET_FILES = ["agent.cordis.yml", "preset.yml"];
const MANAGED_SIGNATURE_FILE = ".dsh-codex-harness-managed";
const BUNDLED_PRESET_ID = "codex-collaboration";
const LEGACY_PRESET_ID = "codex";
const SOURCE_PRESET_DIR = fileURLToPath(new URL("../presets/codex-collaboration/", import.meta.url));
const LEGACY_PRESET_SIGNATURES = /* @__PURE__ */ new Set([
	"2f6222b6c9fed417d0f8fbfef9b221f0c9088c63347466219309c1c2ca2426bb",
	"40ae944220ca57daae93d1483d6cb6264e6847ed77ee84f38171c34c36f0598e",
	"c6a594797f7044c44c09254635b8381f20533cd26a4661239529dc44ec423d0c",
	"2c373798b9cadbda5fb377dab0d43ac5637263546a5a4fc1740752658fdec658",
	"a4062b59ad0e512e1b1b7e80ae56d8cde4efdaa5ba958364a17653ba1ff3c2ed",
	"16016e7f68ee61354de232151be5b6ad0cda1785183ca0c72f9d0946b6a1d6cd",
	"7f72b1bea9b30074788f05d20b841a797a5b29bb945dd1fb0597c8d03eb2b9b9",
	"6a6c8dc2e7a7dbc1ac30ce608a53c238f19066a786f951f9a295ada86e56ed9e"
]);
const BUNDLED_PRESET_SIGNATURES = /* @__PURE__ */ new Set([
	"2a7ef181266e69275d25091adc74dd619af7c7d3577573887aaaecd2663e13c8",
	"d1de30f5c13049621b1c1ae3fb22d35b031797a4762638265822b0ff62749854",
	"b50e1d616f9b4188a33c0da0fe355478b7b75b615f3792c094e2b67995622cf4",
	"6132523d92893f6ae9214b30105e9cc1ba64854df6ca8a84213069eb6c38d286",
	"7957bc5e9b0f2fa0b74d2d8bae0d4ee153a2ba7bb430f5a848e700386cc7ce3f"
]);
function dshHomePath(...segments) {
	const configured = process.env.DSH_HOME?.trim();
	const expanded = configured === void 0 || configured.length === 0 ? join(homedir(), ".dsh") : configured === "~" ? homedir() : configured.startsWith("~/") || configured.startsWith("~\\") ? join(homedir(), configured.slice(2)) : configured;
	return join(resolve(expanded), ...segments);
}
/** Bundle plugin name for the preset installer. */
const name = "codex-preset-installer";
const inject = ["settings"];
const Config = new z(CODEX_SETTINGS_SCHEMA.toJSON());
Object.assign(Config.meta, { volatile: true });
function presetSignature(directory) {
	if (PRESET_FILES.some((file) => !existsSync(join(directory, file)))) return void 0;
	const hash = createHash("sha256");
	hash.update(readFileSync(join(directory, PRESET_FILES[0])));
	hash.update(Buffer.from([0]));
	hash.update(readFileSync(join(directory, PRESET_FILES[1])));
	return hash.digest("hex");
}
function stagePreset(targetDir, sourceDir, presetId) {
	const parentDir = dirname(targetDir);
	mkdirSync(parentDir, { recursive: true });
	const stagingDir = mkdtempSync(join(parentDir, `.${presetId}-`));
	try {
		for (const file of PRESET_FILES) copyFileSync(join(sourceDir, file), join(stagingDir, file));
		const signature = presetSignature(stagingDir);
		if (signature === void 0) throw new Error(`incomplete bundled preset: ${sourceDir}`);
		writeFileSync(join(stagingDir, MANAGED_SIGNATURE_FILE), `${signature}\n`);
		return stagingDir;
	} catch (error) {
		rmSync(stagingDir, {
			recursive: true,
			force: true
		});
		throw error;
	}
}
function installPreset(targetDir, sourceDir, presetId) {
	const stagingDir = stagePreset(targetDir, sourceDir, presetId);
	try {
		renameSync(stagingDir, targetDir);
	} catch (error) {
		if (!existsSync(targetDir)) throw error;
		rmSync(stagingDir, {
			recursive: true,
			force: true
		});
	}
}
function replacePreset(targetDir, sourceDir, presetId) {
	const stagingDir = stagePreset(targetDir, sourceDir, presetId);
	const backupDir = join(dirname(targetDir), `.${presetId}-backup-${randomUUID()}`);
	renameSync(targetDir, backupDir);
	try {
		renameSync(stagingDir, targetDir);
		rmSync(backupDir, {
			recursive: true,
			force: true
		});
	} catch (error) {
		if (existsSync(stagingDir)) rmSync(stagingDir, {
			recursive: true,
			force: true
		});
		if (!existsSync(targetDir)) renameSync(backupDir, targetDir);
		throw error;
	}
}
function hasMatchingManagedMarker(targetDir, signature) {
	const marker = join(targetDir, MANAGED_SIGNATURE_FILE);
	return existsSync(marker) && readFileSync(marker, "utf8").trim() === signature;
}
/**
* Install or upgrade the single shipped Codex preset.
*
* The directory is committed with a staging rename so a failed copy cannot
* leave a half-written preset that hides the mode from the roster. A known
* shipped copy upgrades in place; any changed or unknown copy is preserved.
*
* @param targetDir - destination preset directory.
* @param sourceDir - directory containing the packaged preset files.
*/
function installCodexPreset(targetDir = dshHomePath(".agent-presets", BUNDLED_PRESET_ID), sourceDir = SOURCE_PRESET_DIR) {
	if (!existsSync(targetDir)) {
		installPreset(targetDir, sourceDir, BUNDLED_PRESET_ID);
		return;
	}
	const signature = presetSignature(targetDir);
	if (signature !== void 0 && (BUNDLED_PRESET_SIGNATURES.has(signature) || hasMatchingManagedMarker(targetDir, signature))) replacePreset(targetDir, sourceDir, BUNDLED_PRESET_ID);
}
/** Remove an unmodified copy of the retired second Codex mode. */
function retireLegacyCodexPreset(targetDir = dshHomePath(".agent-presets", LEGACY_PRESET_ID), managedSignatures = LEGACY_PRESET_SIGNATURES) {
	if (!existsSync(targetDir)) return;
	const signature = presetSignature(targetDir);
	if (signature !== void 0 && managedSignatures.has(signature)) rmSync(targetDir, {
		recursive: true,
		force: true
	});
}
/** Read child expressions as inert Loader nodes; evaluation belongs to the mounted preset. */
function bundledPresetDefinition(sourceDir = SOURCE_PRESET_DIR) {
	const document = parseDocument(readFileSync(join(sourceDir, "agent.cordis.yml"), "utf8"), { customTags: [{
		tag: "tag:yaml.org,2002:js",
		resolve: (source) => ({ __jsExpr: source })
	}] });
	if (document.errors.length) throw new Error("invalid bundled Codex composition");
	const plugins = document.toJS();
	if (!Array.isArray(plugins)) throw new Error("invalid bundled Codex composition");
	function currentWorkflowEngine(rows) {
		for (const row of rows) {
			if (typeof row !== "object" || row === null) continue;
			const entry = row;
			if (entry.name === "@deepseek-ai/dsh-workflow-worker-thread") entry.name = "@deepseek-ai/dsh-workflow-ptc";
			if (entry.group === true && Array.isArray(entry.config)) currentWorkflowEngine(entry.config);
		}
	}
	currentWorkflowEngine(plugins);
	const metadata = parseDocument(readFileSync(join(sourceDir, "preset.yml"), "utf8"));
	if (metadata.errors.length) throw new Error("invalid bundled Codex metadata");
	const name = metadata.get("name");
	const description = metadata.get("description");
	const order = metadata.get("order");
	return {
		id: BUNDLED_PRESET_ID,
		...typeof name === "string" ? { name } : {},
		...typeof description === "string" ? { description } : {},
		...typeof order === "number" ? { order } : {},
		plugins
	};
}
/** Install the preset during profile boot without changing the host tool catalog. */
function apply(ctx) {
	const settings = ctx.settings;
	if (typeof settings.register === "function") settings.register(CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA, { base: CODEX_SETTINGS_ENTRY });
	ctx.inject(["agentPresets"], (presetCtx) => {
		const presets = presetCtx.get("agentPresets");
		if (typeof presets.register === "function") {
			presetCtx.effect(async function* () {
				try {
					yield await presets.register(bundledPresetDefinition());
				} catch (error) {
					ctx.logger.warn(`dsh-codex: could not register the Codex preset: ${String(error)}`);
				}
			}, "codex preset registration");
			return;
		}
		try {
			installCodexPreset();
			retireLegacyCodexPreset();
		} catch (error) {
			ctx.logger.warn(`dsh-codex: could not reconcile the Codex preset: ${String(error)}`);
		}
	});
}
var installer_default = {
	name,
	inject,
	Config,
	apply
};
//#endregion
export { Config, apply, bundledPresetDefinition, installer_default as default, inject, installCodexPreset, name, retireLegacyCodexPreset };
