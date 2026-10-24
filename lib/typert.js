import { z } from "zod";
// lib/types/typert.host.js
const PACKAGE = "@shuind/dsh-codex-harness";
const SERVICE = "codexPresetEditor";
const promptSections = z.array(z.object({
	id: z.string(),
	label: z.string(),
	text: z.string().max(1e6),
	editable: z.boolean(),
	suppressed: z.boolean().optional()
})).max(200);
const fields = {
	name: z.string().max(200),
	description: z.string().max(4e3),
	systemPrompt: z.string().max(1e6),
	inheritPrompt: z.boolean()
};
const codexOptions = z.object({
	promptEnabled: z.boolean(),
	terminalToolsEnabled: z.boolean(),
	patchToolEnabled: z.boolean(),
	planToolEnabled: z.boolean(),
	hostedWebSearchEnabled: z.boolean(),
	remoteCompactionEnabled: z.boolean()
});
const document = z.object({
	...fields,
	id: z.string(),
	revision: z.string(),
	editable: z.boolean(),
	codex: z.boolean(),
	codexOptions,
	promptSections,
	composition: z.string()
});
const catalog = z.object({
	presets: z.array(z.object({
		id: z.string(),
		name: z.string(),
		description: z.string(),
		editable: z.boolean(),
		isDefault: z.boolean()
	})),
	authorable: z.boolean(),
	excludedCount: z.number()
});
const codexOptionsPatch = codexOptions.partial();
function descriptor(method, parameter, input, output) {
	const id = `${PACKAGE}#${SERVICE}/${method}`;
	return {
		id,
		service: SERVICE,
		namespace: SERVICE,
		method,
		invocation: { kind: "direct" },
		parameters: parameter === void 0 ? [] : [{
			name: parameter,
			wire: parameter,
			source: "json",
			codec: {
				mode: "strict",
				typeSymbol: `${id}:${parameter}`,
				create: () => input
			}
		}],
		result: {
			mode: "strict",
			typeSymbol: `${id}:result`,
			create: () => output
		}
	};
}
const updateInput = z.object({
	...fields,
	id: z.string(),
	revision: z.string().optional(),
	composition: z.string().max(1e6).optional(),
	enableCodex: z.boolean().optional(),
	promptSections: promptSections.optional(),
	codexOptions: codexOptionsPatch.optional()
});
const createInput = z.object({
	...fields,
	sourceId: z.string(),
	enableCodex: z.boolean().optional(),
	composition: z.string().max(1e6).optional(),
	promptSections: promptSections.optional(),
	codexOptions: codexOptionsPatch.optional()
});
/** Host-side Remote contract consumed by the browser's preset editor. */
const TYPERT = {
	package: PACKAGE,
	face: "host",
	schemas: [],
	invocations: [
		descriptor("catalog", void 0, z.unknown(), catalog),
		descriptor("read", "id", z.string(), document),
		descriptor("update", "rawInput", updateInput, document),
		descriptor("create", "rawInput", createInput, document)
	],
	model: {
		services: [{
			description: "Author and inspect DSH agent presets with Codex capabilities.",
			summary: "Codex preset editor.",
			tags: [],
			jsDoc: "",
			key: SERVICE,
			exportName: "CodexPresetEditor",
			members: [],
			types: []
		}],
		events: [],
		objects: []
	}
};
export { TYPERT, TYPERT as default };
