import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { z as z$1 } from "zod";
import BasicCompactionEngine from "@deepseek-ai/dsh-compaction-basic";
import { readFile, realpath, stat, unlink } from "node:fs/promises";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { Scalar, YAMLMap, isMap, isScalar, isSeq, parseDocument } from "yaml";
//#region lib/types/patch.js
/** Parser and line-oriented applicator for Codex's `apply_patch` language. */
const APPLY_PATCH_DESCRIPTION = "Edits files using Codex patch syntax with Begin/End Patch markers and file update directives. In hunk lines, the first character is the operation marker; repeat a source-leading marker when the source line itself starts with one.";
/** The grammar sent to providers that support OpenAI custom grammar tools. */
const APPLY_PATCH_GRAMMAR = String.raw`start: begin_patch hunk+ end_patch
begin_patch: "*** Begin Patch" LF
end_patch: "*** End Patch" LF?
hunk: add_hunk | delete_hunk | update_hunk
add_hunk: "*** Add File: " filename LF add_line+
delete_hunk: "*** Delete File: " filename LF
update_hunk: "*** Update File: " filename LF change_move? change?
filename: /(.+)/
add_line: "+" /(.*)/ LF -> line
change_move: "*** Move to: " filename LF
change: (change_context | change_line)+ eof_line?
change_context: ("@@" | "@@ " /(.+)/) LF
change_line: ("+" | "-" | " ") /(.*)/ LF
eof_line: "*** End of File" LF
%import common.LF
`;
function invalid(message) {
	throw new Error(`apply_patch: ${message}`);
}
function isFileHeader(line) {
	const trimmed = line.trim();
	return trimmed.startsWith("*** Add File: ") || trimmed.startsWith("*** Delete File: ") || trimmed.startsWith("*** Update File: ");
}
function unwrapHeredoc(input) {
	const normalized = input.replaceAll("\r\n", "\n").trim();
	const lines = normalized.split("\n");
	const first = lines[0]?.trim();
	const last = lines.at(-1)?.trim();
	if (lines.length >= 4 && (first === "<<EOF" || first === "<<'EOF'" || first === "<<\"EOF\"") && last === "EOF") return lines.slice(1, -1).join("\n").trim();
	return normalized;
}
function pathFrom(line, prefix) {
	const path = line.slice(prefix.length).trim();
	if (path.length === 0) invalid(`${prefix.trim()} requires a file path`);
	return path;
}
function isChangeMarker(line) {
	const marker = line.trimEnd();
	return marker === "@@" || marker.startsWith("@@ ");
}
function isPotentialChangeMarker(line) {
	return line.trimEnd().startsWith("@@");
}
/** Parse one complete Codex patch after normalizing CRLF input to LF. */
function parsePatch(input) {
	const lines = unwrapHeredoc(input).split("\n");
	if (lines[0]?.trim() !== "*** Begin Patch") invalid("input must start with \"*** Begin Patch\"");
	if (lines.at(-1)?.trim() !== "*** End Patch") invalid("input must end with \"*** End Patch\"");
	const files = [];
	let index = 1;
	const end = lines.length - 1;
	if (lines[index]?.trim().startsWith("*** Environment ID:") === true) invalid("environment selection is unavailable in this single-environment DSH plugin");
	while (index < end) {
		const header = lines[index++]?.trim();
		if (header === void 0) invalid("unexpected end of input");
		if (header.startsWith("*** Add File: ")) {
			const path = pathFrom(header, "*** Add File: ");
			const content = [];
			while (index < end && lines[index]?.startsWith("+") === true) {
				content.push(lines[index].slice(1));
				index++;
			}
			if (content.length === 0) invalid(`add file ${JSON.stringify(path)} needs at least one content line`);
			files.push({
				kind: "add",
				path,
				content: `${content.join("\n")}\n`
			});
			continue;
		}
		if (header.startsWith("*** Delete File: ")) {
			files.push({
				kind: "delete",
				path: pathFrom(header, "*** Delete File: ")
			});
			continue;
		}
		if (!header.startsWith("*** Update File: ")) invalid(`unexpected directive ${JSON.stringify(header)}`);
		const path = pathFrom(header, "*** Update File: ");
		let moveTo;
		if (lines[index]?.trim().startsWith("*** Move to: ") === true) {
			moveTo = pathFrom(lines[index].trim(), "*** Move to: ");
			index++;
		}
		const hunks = [];
		while (index < end && !isFileHeader(lines[index])) {
			const patchLines = [];
			let context;
			if (isPotentialChangeMarker(lines[index])) {
				const marker = lines[index].trimEnd();
				if (!isChangeMarker(marker)) invalid(`invalid update hunk marker ${JSON.stringify(lines[index])}`);
				index++;
				context = marker.length === 2 ? void 0 : marker.slice(3);
			}
			while (index < end && !isFileHeader(lines[index]) && !isPotentialChangeMarker(lines[index]) && lines[index].trimEnd() !== "*** End of File") {
				const line = lines[index++];
				const kind = line[0];
				if (kind !== " " && kind !== "+" && kind !== "-") invalid(`unexpected update line ${JSON.stringify(line)}`);
				patchLines.push({
					kind: kind === " " ? "context" : kind === "+" ? "add" : "delete",
					text: line.slice(1)
				});
			}
			const endOfFile = lines[index]?.trimEnd() === "*** End of File";
			if (endOfFile) index++;
			if (patchLines.length === 0) {
				if (context !== void 0 || endOfFile) invalid("an update hunk needs context or changed lines");
				break;
			}
			hunks.push({
				...context === void 0 ? {} : { context },
				lines: patchLines,
				endOfFile
			});
		}
		if (hunks.length === 0 && moveTo === void 0) invalid(`update file ${JSON.stringify(path)} has no changes`);
		files.push({
			kind: "update",
			path,
			...moveTo === void 0 ? {} : { moveTo },
			hunks
		});
	}
	if (files.length === 0) invalid("no files were modified");
	return files;
}
function splitText(text) {
	if (text.length === 0) return {
		lines: [],
		trailingNewline: false
	};
	const trailingNewline = text.endsWith("\n");
	const lines = text.split("\n");
	if (trailingNewline) lines.pop();
	return {
		lines,
		trailingNewline
	};
}
function joinText(value) {
	const body = value.lines.join("\n");
	return value.trailingNewline ? `${body}\n` : body;
}
function findSequence(lines, expected, from, endOfFile) {
	if (expected.length === 0) return Math.min(from, lines.length);
	if (expected.length > lines.length) return -1;
	const first = endOfFile ? Math.max(from, lines.length - expected.length) : from;
	const last = lines.length - expected.length;
	const matchers = [
		(actual, wanted) => actual === wanted,
		(actual, wanted) => actual.trimEnd() === wanted.trimEnd(),
		(actual, wanted) => actual.trim() === wanted.trim()
	];
	for (const matchesLine of matchers) for (let index = first; index <= last; index++) {
		let matches = true;
		for (let offset = 0; offset < expected.length; offset++) if (!matchesLine(lines[index + offset], expected[offset])) {
			matches = false;
			break;
		}
		if (matches) return index;
	}
	return -1;
}
function displayPatchLine(line) {
	if (line.length === 0) return "<empty>";
	return line.replaceAll(" ", "[space]").replaceAll("	", "[tab]");
}
function formatPatchExcerpt(lines, start, count) {
	if (lines.length === 0) return "  <empty file>";
	const first = Math.max(0, Math.min(start, lines.length - 1));
	return lines.slice(first, first + count).map((line, offset) => `  ${first + offset + 1}: ${displayPatchLine(line)}`).join("\n");
}
function mismatchMessage(label, hunkIndex, expected, actual, from, endOfFile) {
	const expectedPreview = expected.slice(0, 12).map((line, index) => `  ${index + 1}: ${displayPatchLine(line)}`).join("\n");
	const expectedSuffix = expected.length > 12 ? "\n  ..." : "";
	const excerptStart = endOfFile ? Math.max(0, actual.length - 6) : Math.max(0, from - 2);
	const markerHint = expected.some((wanted) => wanted.length > 0 && actual.includes(`-${wanted}`)) ? "\nHint: if a source line starts with a patch marker, repeat that marker after the operation marker; for example, `-- item` deletes the source line `- item`." : "";
	return `could not find expected lines in ${label} hunk ${hunkIndex + 1} (search starts at line ${from + 1})\nExpected:\n${expectedPreview}${expectedSuffix}\nFile excerpt:\n${formatPatchExcerpt(actual, excerptStart, 10)}${markerHint}`;
}
/** Apply parsed update hunks and return LF-normalized text. */
function applyPatchHunks(original, hunks, label = "file") {
	const value = splitText(original.replaceAll("\r\n", "\n"));
	let cursor = 0;
	for (const [hunkIndex, hunk] of hunks.entries()) {
		const expected = hunk.lines.filter((line) => line.kind !== "add").map((line) => line.text);
		const start = findSequence(value.lines, expected, cursor, hunk.endOfFile);
		if (start < 0) invalid(mismatchMessage(label, hunkIndex, expected, value.lines, cursor, hunk.endOfFile));
		const replacement = hunk.lines.filter((line) => line.kind !== "delete").map((line) => line.text);
		value.lines.splice(start, expected.length, ...replacement);
		cursor = start + replacement.length;
		value.trailingNewline = !hunk.endOfFile;
	}
	return joinText(value);
}
//#endregion
//#region lib/types/exec.js
/** Codex `exec_command` and `write_stdin` execution over dsh capability seams. */
const STATES = /* @__PURE__ */ new WeakMap();
const MIN_YIELD_TIME_MS = 250;
const WINDOWS_INITIAL_EXEC_YIELD_TIME_MS = 1e4;
const MIN_EMPTY_YIELD_TIME_MS = 5e3;
const MAX_YIELD_TIME_MS = 3e4;
const MAX_EMPTY_YIELD_TIME_MS = 3e5;
const DEFAULT_OUTPUT_TOKENS = 1e4;
const APPROX_BYTES_PER_TOKEN = 4;
function stateFor(agent) {
	const current = STATES.get(agent);
	if (current !== void 0) return current;
	const created = {
		nextId: 0,
		sessions: /* @__PURE__ */ new Map()
	};
	STATES.set(agent, created);
	return created;
}
function positiveFinite(name, value) {
	if (value !== void 0 && (!Number.isFinite(value) || value < 0)) throw new Error(`${name} must be a non-negative finite number`);
}
function normalizeWaitMs(value, fallback, empty = false, initialExec = false) {
	const lower = empty ? MIN_EMPTY_YIELD_TIME_MS : initialExec && process.platform === "win32" ? WINDOWS_INITIAL_EXEC_YIELD_TIME_MS : MIN_YIELD_TIME_MS;
	return Math.max(lower, Math.min(empty ? MAX_EMPTY_YIELD_TIME_MS : MAX_YIELD_TIME_MS, Math.trunc(value ?? fallback)));
}
function outputLimit(maxOutputBytes, maxOutputTokens) {
	const tokens = maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS;
	if (maxOutputTokens !== void 0) positiveFinite("max_output_tokens", maxOutputTokens);
	return Math.max(1, Math.min(maxOutputBytes, Math.trunc(tokens * APPROX_BYTES_PER_TOKEN)));
}
function limitOutput(text, maxBytes) {
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	let end = Math.min(text.length, maxBytes);
	while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > maxBytes) end--;
	return `${text.slice(0, end)}\n[output truncated]`;
}
function newChunkId() {
	return randomBytes(3).toString("hex");
}
function withChunkId(result) {
	return {
		chunk_id: newChunkId(),
		...result
	};
}
/** Render the ordinary Responses tool result text used by Codex's unified exec tools. */
function renderExecResult(result) {
	const sections = [];
	if (result.chunk_id !== void 0) sections.push(`Chunk ID: ${result.chunk_id}`);
	sections.push(`Wall time: ${result.wall_time_seconds.toFixed(4)} seconds`);
	if (result.exit_code !== void 0) sections.push(`Process exited with code ${result.exit_code}`);
	if (result.session_id !== void 0) sections.push(`Process running with session ID ${result.session_id}`);
	if (result.job_id !== void 0) sections.push(`Background job ID: ${result.job_id}`);
	if (result.original_token_count !== void 0) sections.push(`Original token count: ${result.original_token_count}`);
	sections.push("Output:", result.output);
	return sections.join("\n");
}
function sessionCwd$1(exec, workdir) {
	const base = exec.agent?.session.header.cwd ?? process.cwd();
	if (workdir === void 0) return exec.agent?.session.header.cwd;
	return resolve(base, workdir);
}
function readShellOutput(read, maxBytes) {
	return limitOutput(read.delta, maxBytes);
}
function terminalResult(result, maxBytes, startedAt) {
	const output = limitOutput(result.viewport, maxBytes);
	return withChunkId({
		wall_time_seconds: (performance.now() - startedAt) / 1e3,
		output,
		...result.sessionStatus.kind === "exited" ? { ...result.sessionStatus.exitCode === null ? {} : { exit_code: result.sessionStatus.exitCode } } : {}
	});
}
/** Map a detached shell process onto the generic DSH job outcome contract. */
function backgroundOutcome(process) {
	if (process.status === "killed") return {
		status: "killed",
		detail: process.signal !== null ? `signal: ${process.signal}` : "killed before exit"
	};
	return {
		status: "completed",
		detail: `exit code: ${process.exitCode ?? 0}`
	};
}
function sleep(ms, signal) {
	return new Promise((resolve) => {
		let timer;
		const finish = (result) => {
			if (timer !== void 0) clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			resolve(result);
		};
		const onAbort = () => finish("aborted");
		if (signal.aborted) {
			finish("aborted");
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
		timer = setTimeout(() => finish("elapsed"), ms);
	});
}
async function waitForShell(process, ms, signal) {
	const timer = sleep(ms, signal);
	const completed = await Promise.race([process.done.then(() => true), timer.then((result) => result === "aborted" ? false : void 0)]);
	if (signal.aborted) signal.throwIfAborted();
	return completed === true || process.status !== "running";
}
/** Stop a pipe-backed session when the current Codex tool is cancelled. */
async function stopShellOnAbort(process, signal) {
	if (!signal.aborted || process.status !== "running") return;
	process.kill();
	await process.done;
}
function allocateSession(agent, session) {
	const state = stateFor(agent);
	const id = ++state.nextId;
	state.sessions.set(id, session);
	return id;
}
function storedSession(agent, id) {
	const session = stateFor(agent).sessions.get(id);
	if (session === void 0) throw new Error(`unknown unified exec session ${id}`);
	return session;
}
function forgetSession(agent, id) {
	stateFor(agent).sessions.delete(id);
}
function commandFor(args) {
	return args.cmd;
}
/** Execute one Codex command through the configured pipe or PTY capability. */
async function runExecCommand(ctx, args, exec, config) {
	if (args.cmd.trim().length === 0) throw new Error("cmd must be a non-empty string");
	positiveFinite("yield_time_ms", args.yield_time_ms);
	const maxBytes = outputLimit(config.maxOutputBytes, args.max_output_tokens);
	const workdir = sessionCwd$1(exec, args.workdir);
	const startedAt = performance.now();
	if (args.run_in_background === true && args.tty === true) throw new Error("run_in_background is only supported for pipe-backed commands; omit tty");
	if (args.tty === true) {
		const agent = exec.agent;
		const terminals = ctx.get("terminals");
		if (agent === void 0 || terminals === void 0) throw new Error("exec_command with tty=true requires the dsh terminal capability and an owning agent session");
		const spawnRequest = {
			type: "shell",
			...args.shell === void 0 ? {} : { shell: args.shell },
			login: args.login ?? true,
			...workdir === void 0 ? {} : { cwd: workdir }
		};
		const spawned = await terminals.spawn(agent, spawnRequest, exec.signal);
		let retained = false;
		let closeReason = "Codex command failed";
		try {
			const sendRequest = {
				text: commandFor(args),
				submit: true,
				waitMs: normalizeWaitMs(args.yield_time_ms, config.defaultYieldTimeMs, false, true),
				signal: exec.signal
			};
			const result = await terminals.startSend(agent, spawned.sessionId, sendRequest).done;
			const output = terminalResult(result, maxBytes, startedAt);
			if (result.sessionStatus.kind === "running") {
				output.session_id = allocateSession(agent, {
					kind: "terminal",
					owner: agent,
					id: spawned.sessionId
				});
				retained = true;
			} else closeReason = "Codex command exited";
			return output;
		} finally {
			if (!retained) await terminals.kill(agent, spawned.sessionId, closeReason);
		}
	}
	const policy = ctx.get("sandboxPolicy")?.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });
	const dshEnv = ctx.get("shellEnv")?.collect(exec);
	const shellRequest = {
		command: commandFor(args),
		...args.shell === void 0 ? {} : { shell: args.shell },
		login: args.login ?? true,
		...workdir === void 0 ? {} : { workdir },
		stdoutMaxBytes: maxBytes,
		...dshEnv === void 0 ? {} : { dshEnv },
		...policy === void 0 ? {} : { sandboxPolicy: policy }
	};
	if (args.run_in_background === true) {
		const owner = exec.agent;
		if (owner === void 0) throw new Error("run_in_background requires an owning agent session");
		const jobs = ctx.get("jobs");
		if (jobs === void 0) throw new Error("background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs");
		if (exec.signal.aborted) {
			exec.signal.throwIfAborted();
			throw new Error("tool call aborted");
		}
		const id = jobs.start({
			kind: "bash",
			label: args.cmd,
			owner,
			outputLimitBytes: maxBytes,
			run: () => {
				const process = ctx.shell.start(ctx.shell.resolve(shellRequest));
				return {
					cancel: () => void process.kill(),
					done: process.done.then(() => backgroundOutcome(process)),
					readOutput: () => readShellOutput(process.readOutput(), maxBytes)
				};
			}
		});
		return withChunkId({
			wall_time_seconds: (performance.now() - startedAt) / 1e3,
			job_id: id,
			output: `Started background job ${id}. Use job_output with job_id "${id}" to read output.`
		});
	}
	const process = ctx.shell.start(ctx.shell.resolve({
		...shellRequest,
		signal: exec.signal
	}));
	try {
		await waitForShell(process, normalizeWaitMs(args.yield_time_ms, config.defaultYieldTimeMs, false, true), exec.signal);
		const output = readShellOutput(process.readOutput(), maxBytes);
		if (process.status === "running") {
			if (exec.agent === void 0) {
				process.kill();
				await process.done;
				return withChunkId({
					wall_time_seconds: (performance.now() - startedAt) / 1e3,
					output: readShellOutput(process.readOutput(), maxBytes)
				});
			}
			return withChunkId({
				wall_time_seconds: (performance.now() - startedAt) / 1e3,
				output,
				session_id: allocateSession(exec.agent, {
					kind: "shell",
					process
				})
			});
		}
		return withChunkId({
			wall_time_seconds: (performance.now() - startedAt) / 1e3,
			output,
			...process.exitCode === null ? {} : { exit_code: process.exitCode }
		});
	} finally {
		await stopShellOnAbort(process, exec.signal);
	}
}
/** Poll or write to one session returned by {@link runExecCommand}. */
async function runWriteStdin(ctx, args, exec, config) {
	positiveFinite("yield_time_ms", args.yield_time_ms);
	if (!Number.isSafeInteger(args.session_id) || args.session_id <= 0) throw new Error("session_id must be a positive integer");
	const agent = exec.agent;
	if (agent === void 0) throw new Error("write_stdin requires an owning agent session");
	const session = storedSession(agent, args.session_id);
	const maxBytes = outputLimit(config.maxOutputBytes, args.max_output_tokens);
	const startedAt = performance.now();
	const chars = args.chars ?? "";
	if (session.kind === "shell") {
		if (chars.length > 0) throw new Error("this unified exec session uses pipes and does not accept stdin; rerun exec_command with tty=true");
		try {
			await waitForShell(session.process, normalizeWaitMs(args.yield_time_ms, config.pollYieldTimeMs, true), exec.signal);
			const output = readShellOutput(session.process.readOutput(), maxBytes);
			if (session.process.status !== "running") {
				forgetSession(agent, args.session_id);
				return withChunkId({
					wall_time_seconds: (performance.now() - startedAt) / 1e3,
					output,
					...session.process.exitCode === null ? {} : { exit_code: session.process.exitCode }
				});
			}
			return withChunkId({
				wall_time_seconds: (performance.now() - startedAt) / 1e3,
				output,
				session_id: args.session_id
			});
		} finally {
			if (exec.signal.aborted) try {
				await stopShellOnAbort(session.process, exec.signal);
			} finally {
				forgetSession(agent, args.session_id);
			}
		}
	}
	const terminals = ctx.get("terminals");
	if (terminals === void 0) throw new Error("the dsh terminal capability is no longer available");
	const sendRequest = {
		text: chars,
		submit: false,
		waitMs: normalizeWaitMs(args.yield_time_ms, chars.length > 0 ? config.writeYieldTimeMs : config.pollYieldTimeMs, chars.length === 0),
		signal: exec.signal
	};
	let retained = false;
	let closeReason = "Codex command failed";
	try {
		const result = await terminals.startSend(agent, session.id, sendRequest).done;
		const output = terminalResult(result, maxBytes, startedAt);
		if (result.sessionStatus.kind === "running") {
			output.session_id = args.session_id;
			retained = true;
		} else {
			closeReason = "Codex command exited";
			forgetSession(agent, args.session_id);
		}
		return output;
	} finally {
		if (!retained) {
			forgetSession(agent, args.session_id);
			await terminals.kill(agent, session.id, closeReason);
		}
	}
}
/** Current form namespaces are profile entry ids, not old document section names. */
function settingsNamespaceMatches(namespace, logical) {
	return namespace === logical || logical === "codex" && namespace === "codex-preset-installer";
}
/** Preserve the revision and actual namespace for optimistic Config writes. */
function settingsDescriptor(service, namespace) {
	const settings = service;
	if (typeof settings?.get === "function") return {
		ns: namespace,
		value: settings.get(namespace)
	};
	if (typeof settings?.describe !== "function") return void 0;
	return settings.describe().find((row) => settingsNamespaceMatches(row.ns, namespace));
}
/** Form values are plain snapshots; the host has already unwrapped volatile refs. */
function readSettings(service, namespace) {
	return settingsDescriptor(service, namespace)?.value;
}
//#endregion
//#region lib/types/remote.js
const SETTINGS_NAMESPACE = "llm-pi-ai";
const REMOTE_COMPACTION_OPEN = "<codex-remote-compaction>";
const REMOTE_COMPACTION_CLOSE = "</codex-remote-compaction>";
const CONTEXT_WINDOW_EXCEEDED_CODE = "CONTEXT_WINDOW_EXCEEDED";
const CODEX_ERROR_DIRECTORY = ["diagnostics", "openai-codex-errors"];
const MAX_DIAGNOSTIC_FILES = 32;
const MAX_DIAGNOSTIC_FRAME_CHARS = 1048576;
const MAX_DIAGNOSTIC_STREAM_BYTES = 8388608;
const HOSTED_REQUESTS = new AsyncLocalStorage();
let hostedPatchUsers = 0;
let hostedPatchRestore;
function serviceTierOf(options) {
	const value = options.serviceTier;
	return typeof value === "string" ? value : void 0;
}
function isGptModel$2(model) {
	return typeof model === "string" && /(?:^|\/)(?:gpt|chatgpt)(?:[-_.]|\d|$)/i.test(model);
}
function settingsOf(ctx) {
	return readSettings(ctx.get("settings"), SETTINGS_NAMESPACE);
}
function profileOf(ctx, provider) {
	return settingsOf(ctx)?.providers?.[provider];
}
function supportsResponses(profile, provider) {
	return profile?.api === "openai-responses" || profile?.api === "openai-codex-responses" || profile?.api === void 0 && provider === "openai";
}
function responsesEndpoint(baseURL, suffix) {
	return `${baseURL.replace(/\/+$/, "")}/${suffix}`;
}
function hasHeader(headers, name) {
	return Object.keys(headers ?? {}).some((key) => key.toLowerCase() === name.toLowerCase());
}
async function apiHeaders(ctx, profile) {
	const headers = {
		...profile.headers,
		"content-type": "application/json"
	};
	if (profile.apiKeyEnv !== void 0 && !hasHeader(headers, "authorization")) {
		const resolved = await ctx.get("credentials")?.resolve(credentialRef(profile.apiKeyEnv));
		if (resolved?.value === void 0) return void 0;
		headers.authorization = `Bearer ${resolved.value}`;
	}
	return headers;
}
function isResponsesRequest(url) {
	try {
		return new URL(url).pathname.replace(/\/+$/, "").endsWith("/responses");
	} catch {
		return url.replace(/\/+$/, "").endsWith("/responses");
	}
}
function diagnosticsDirectory() {
	const configured = process.env["DSH_HOME"]?.trim();
	const expanded = configured === void 0 || configured.length === 0 ? join(homedir(), ".dsh") : configured === "~" ? homedir() : configured.startsWith("~/") || configured.startsWith("~\\") ? join(homedir(), configured.slice(2)) : configured;
	return join(resolve(expanded), ...CODEX_ERROR_DIRECTORY);
}
function saveCodexErrorPayload(payload) {
	const directory = diagnosticsDirectory();
	mkdirSync(directory, {
		recursive: true,
		mode: 448
	});
	const filename = `${Date.now()}-${randomUUID()}.json`;
	writeFileSync(join(directory, filename), `${payload}\n`, {
		flag: "wx",
		mode: 384
	});
	const owned = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && /^\d+-[0-9a-f-]{36}\.json$/u.test(entry.name)).map((entry) => entry.name).sort((left, right) => Number(left.split("-")[0]) - Number(right.split("-")[0]) || left.localeCompare(right));
	for (const stale of owned.slice(0, Math.max(0, owned.length - MAX_DIAGNOSTIC_FILES))) unlinkSync(join(directory, stale));
}
function errorPayloadFromSseFrame(frame) {
	const data = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
	if (data.length === 0 || data === "[DONE]") return void 0;
	try {
		const payload = JSON.parse(data);
		return payload.type === "error" || payload.type === "response.failed" ? data : void 0;
	} catch {
		return;
	}
}
async function captureCodexErrorPayloads(response) {
	if (response.body === null) return;
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let bytesRead = 0;
	let completed = false;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) completed = true;
			bytesRead += value?.byteLength ?? 0;
			if (bytesRead > MAX_DIAGNOSTIC_STREAM_BYTES) return;
			buffer += decoder.decode(value, { stream: !done });
			while (true) {
				const delimiter = /\r?\n\r?\n/u.exec(buffer);
				if (delimiter?.index === void 0) break;
				const frame = buffer.slice(0, delimiter.index);
				buffer = buffer.slice(delimiter.index + delimiter[0].length);
				if (frame.length > MAX_DIAGNOSTIC_FRAME_CHARS) continue;
				const payload = errorPayloadFromSseFrame(frame);
				if (payload === void 0) continue;
				try {
					saveCodexErrorPayload(payload);
				} catch {}
			}
			if (buffer.length > MAX_DIAGNOSTIC_FRAME_CHARS || done) return;
		}
	} finally {
		if (!completed) reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
function captureCodexErrors(response) {
	if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) return response;
	try {
		captureCodexErrorPayloads(response.clone()).catch(() => {});
	} catch {}
	return response;
}
function isWebSearchTool(tool) {
	if (typeof tool !== "object" || tool === null) return false;
	const value = tool;
	if (value.name === "web_search") return true;
	const fn = value.function;
	return typeof fn === "object" && fn !== null && fn.name === "web_search";
}
function hasWebSearchTool(body) {
	return Array.isArray(body.tools) && body.tools.some(isWebSearchTool);
}
function toolName(tool) {
	if (typeof tool !== "object" || tool === null) return void 0;
	const value = tool;
	if (typeof value.name === "string") return value.name;
	const fn = value.function;
	return typeof fn === "object" && fn !== null && typeof fn.name === "string" ? fn.name : void 0;
}
function isApplyPatchTool(tool) {
	return toolName(tool) === "apply_patch";
}
function isFunctionApplyPatchTool(tool) {
	if (!isApplyPatchTool(tool) || typeof tool !== "object" || tool === null) return false;
	return tool.type !== "custom";
}
function hasFunctionApplyPatchTool(body) {
	return Array.isArray(body.tools) && body.tools.some(isFunctionApplyPatchTool);
}
function applyPatchTool(tool) {
	const value = tool;
	const fn = value.function;
	const custom = {
		type: "custom",
		name: "apply_patch",
		description: typeof value.description === "string" ? value.description : typeof fn === "object" && fn !== null && typeof fn.description === "string" ? fn.description : APPLY_PATCH_DESCRIPTION,
		format: {
			type: "grammar",
			syntax: "lark",
			definition: APPLY_PATCH_GRAMMAR
		}
	};
	if (value.defer_loading !== void 0) custom.defer_loading = value.defer_loading;
	return custom;
}
/** Replace DSH's JSON function declaration with the Responses custom grammar tool. */
function addCodexApplyPatch(body) {
	if (!Array.isArray(body.tools)) return body;
	let changed = false;
	const tools = body.tools.map((tool) => {
		if (!isApplyPatchTool(tool) || typeof tool !== "object" || tool === null) return tool;
		if (tool.type === "custom") return tool;
		changed = true;
		return applyPatchTool(tool);
	});
	return changed ? {
		...body,
		tools
	} : body;
}
function applyPatchInputOfCall(item) {
	if (item.type !== "function_call" || item.name !== "apply_patch") return void 0;
	if (typeof item.call_id !== "string" || item.call_id.length === 0) return void 0;
	const raw = item.arguments;
	const argumentsObject = typeof raw === "string" ? (() => {
		try {
			return JSON.parse(raw);
		} catch {
			return;
		}
	})() : raw;
	if (typeof argumentsObject !== "object" || argumentsObject === null) return void 0;
	const input = argumentsObject.input;
	return typeof input === "string" ? {
		callId: item.call_id,
		input
	} : void 0;
}
function canRewriteApplyPatchHistory(body) {
	if (!Array.isArray(body.input)) return true;
	return body.input.every((item) => {
		if (typeof item !== "object" || item === null) return true;
		const value = item;
		return value.type !== "function_call" || value.name !== "apply_patch" || applyPatchInputOfCall(value) !== void 0;
	});
}
/** Replay apply_patch calls as custom tool items after pi-ai's generic conversion. */
function rewriteCodexApplyPatchHistory(body) {
	if (!Array.isArray(body.input) || !canRewriteApplyPatchHistory(body)) return body;
	const applyCallIds = /* @__PURE__ */ new Set();
	for (const item of body.input) {
		if (typeof item !== "object" || item === null) continue;
		const value = item;
		if (value.type === "custom_tool_call" && value.name === "apply_patch" && typeof value.call_id === "string") applyCallIds.add(value.call_id);
		const call = applyPatchInputOfCall(value);
		if (call !== void 0) applyCallIds.add(call.callId);
	}
	if (applyCallIds.size === 0) return body;
	let changed = false;
	const input = body.input.map((item) => {
		if (typeof item !== "object" || item === null) return item;
		const value = item;
		const call = applyPatchInputOfCall(value);
		if (call !== void 0) {
			const next = {
				type: "custom_tool_call",
				call_id: call.callId,
				name: "apply_patch",
				input: call.input
			};
			if (typeof value.id === "string") next.id = value.id;
			changed = true;
			return next;
		}
		if (value.type === "function_call_output" && typeof value.call_id === "string" && applyCallIds.has(value.call_id)) {
			changed = true;
			return {
				type: "custom_tool_call_output",
				call_id: value.call_id,
				output: value.output
			};
		}
		return item;
	});
	return changed ? {
		...body,
		input
	} : body;
}
/** Compose the plugin-only Responses rewrites without changing DSH's tool API. */
function rewriteCodexResponsesBody(body, options = {}) {
	let next = body;
	if (options.hostedWebSearch !== false && hasWebSearchTool(next)) next = addHostedWebSearch(next);
	else if (hasRemoteCompaction(next)) next = replaceRemoteCompactions(next);
	if (options.customApplyPatch !== false && hasFunctionApplyPatchTool(next) && canRewriteApplyPatchHistory(next)) {
		next = addCodexApplyPatch(next);
		next = rewriteCodexApplyPatchHistory(next);
	}
	return next;
}
/** Convert a generic DSH Responses tool list to the hosted Codex variant. */
function addHostedWebSearch(body) {
	const tools = Array.isArray(body.tools) ? body.tools.filter((tool) => !isWebSearchTool(tool)) : [];
	tools.push({
		type: "web_search",
		external_web_access: true
	});
	return {
		...replaceRemoteCompactions(body),
		tools
	};
}
/** Replace the text placeholder written by dsh-compaction-basic with the native item. */
function replaceRemoteCompactions(body) {
	if (!Array.isArray(body.input)) return body;
	const input = body.input.map((item) => {
		if (typeof item !== "object" || item === null) return item;
		const value = item;
		const marker = (Array.isArray(value.content) ? value.content : []).find((part) => typeof part === "object" && part !== null && typeof part.text === "string" && String(part.text).includes(REMOTE_COMPACTION_OPEN));
		if (marker === void 0) return item;
		const text = String(marker.text);
		const start = text.indexOf(REMOTE_COMPACTION_OPEN) + 25;
		const end = text.indexOf(REMOTE_COMPACTION_CLOSE, start);
		if (end < start) return item;
		return {
			type: "compaction",
			encrypted_content: text.slice(start, end)
		};
	});
	return {
		...body,
		input
	};
}
function hasRemoteCompaction(body) {
	if (!Array.isArray(body.input)) return false;
	return body.input.some((item) => {
		if (typeof item !== "object" || item === null) return false;
		const content = item.content;
		return Array.isArray(content) && content.some((part) => typeof part === "object" && part !== null && typeof part.text === "string" && String(part.text).includes(REMOTE_COMPACTION_OPEN));
	});
}
function canPatchBody(body, options) {
	return isGptModel$2(body.model) && (options.hostedWebSearch !== false && hasWebSearchTool(body) || hasRemoteCompaction(body) || options.customApplyPatch !== false && hasFunctionApplyPatchTool(body) && canRewriteApplyPatchHistory(body));
}
/** Add provider options that older pi-ai adapters do not copy themselves. */
function applyRequestWireOptions(body, options) {
	if (options.serviceTier === void 0 || !isGptModel$2(body.model)) return body;
	return {
		...body,
		service_tier: options.serviceTier
	};
}
/**
* Install a scoped fetch shim for pi-ai's already-built Responses request.
* The generic DSH adapter remains the owner of auth, streaming, replay, and
* attachments; this shim changes only Codex's Responses tool and compaction
* representation at the wire boundary.
*/
function installGlobalHostedWebSearchPatch() {
	const original = globalThis.fetch;
	const patched = async (input, init) => {
		const options = HOSTED_REQUESTS.getStore();
		if (options === void 0) return original(input, init);
		const request = new Request(input, init);
		if (!isResponsesRequest(request.url)) return original(input, init);
		const requestAndCapture = async (target, requestInit) => captureCodexErrors(await original(target, requestInit));
		let body;
		try {
			body = JSON.parse(await request.clone().text());
		} catch {
			return requestAndCapture(input, init);
		}
		const requestBody = applyRequestWireOptions(body, options);
		if (!canPatchBody(requestBody, options)) {
			if (requestBody === body) return requestAndCapture(input, init);
			const headers = new Headers(request.headers);
			headers.delete("content-length");
			return requestAndCapture(new Request(request, {
				body: JSON.stringify(requestBody),
				headers
			}));
		}
		const fallbackHeaders = new Headers(request.headers);
		fallbackHeaders.delete("content-length");
		const fallbackRequest = requestBody === body ? request.clone() : new Request(request, {
			body: JSON.stringify(requestBody),
			headers: fallbackHeaders
		});
		const headers = new Headers(request.headers);
		headers.delete("content-length");
		const hostedRequest = new Request(request, {
			body: JSON.stringify(rewriteCodexResponsesBody(requestBody, options)),
			headers
		});
		try {
			const hostedResponse = await requestAndCapture(hostedRequest);
			if (!hostedResponse.ok) return requestAndCapture(fallbackRequest);
			return hostedResponse;
		} catch {
			return requestAndCapture(fallbackRequest);
		}
	};
	globalThis.fetch = patched;
	return () => {
		if (globalThis.fetch === patched) globalThis.fetch = original;
	};
}
/** Enable the transport patch for this Codex plugin scope only. */
function installHostedWebSearch() {
	hostedPatchUsers += 1;
	hostedPatchRestore ??= installGlobalHostedWebSearchPatch();
	return () => {
		hostedPatchUsers = Math.max(0, hostedPatchUsers - 1);
		if (hostedPatchUsers === 0) {
			hostedPatchRestore?.();
			hostedPatchRestore = void 0;
		}
	};
}
/** Iterate an existing DSH stream with the hosted-request context installed. */
function hostedWebSearchStream(next, options = {}) {
	return (async function* () {
		const iterator = next()[Symbol.asyncIterator]();
		let completed = false;
		try {
			while (true) {
				const item = await HOSTED_REQUESTS.run(options, () => iterator.next());
				if (item.done) {
					completed = true;
					return;
				}
				yield item.value;
			}
		} finally {
			if (!completed) await iterator.return?.();
		}
	})();
}
function contextTokens(usage) {
	const fields = [
		usage.inputTokens,
		usage.outputTokens,
		usage.cacheReadTokens ?? 0,
		usage.cacheWriteTokens ?? 0
	];
	if (fields.some((value) => !Number.isSafeInteger(value) || value < 0)) return void 0;
	const total = fields.reduce((sum, value) => sum + value, 0);
	return Number.isSafeInteger(total) ? total : void 0;
}
/**
* Correct the usage-only overflow verdict emitted by pi-ai adapters that do
* not yet consume the request-scoped Codex capacity.
*/
function repairLegacyPiAiContextOverflow(stream, model, contextWindow) {
	return (async function* () {
		let usage;
		for await (const chunk of stream) {
			if (chunk.type === "usage") usage = chunk.usage;
			const usedTokens = usage === void 0 ? void 0 : contextTokens(usage);
			if (chunk.type === "finish" && chunk.reason.kind === "error" && chunk.reason.failure.code === CONTEXT_WINDOW_EXCEEDED_CODE && chunk.reason.failure.message === `pi-ai detected context overflow for model "${model}"` && typeof contextWindow === "number" && Number.isSafeInteger(contextWindow) && contextWindow > 0 && usage !== void 0 && usage.outputTokens > 0 && usedTokens !== void 0 && usedTokens <= contextWindow) {
				yield {
					...chunk,
					reason: { kind: "stop" }
				};
				continue;
			}
			yield chunk;
		}
	})();
}
function textOf(message) {
	return message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function responsesInput(messages) {
	const result = [];
	for (const message of messages) {
		const text = textOf(message);
		if (message.role === "assistant") {
			if (text.length > 0) result.push({
				type: "message",
				role: "assistant",
				content: [{
					type: "output_text",
					text
				}]
			});
			for (const block of message.content) if (block.type === "tool-call") result.push({
				type: "function_call",
				call_id: block.id,
				name: block.name,
				arguments: block.arguments
			});
			continue;
		}
		const role = message.role === "system" ? "developer" : "user";
		if (text.length > 0) result.push({
			type: "message",
			role,
			content: [{
				type: "input_text",
				text
			}]
		});
		for (const block of message.content) {
			if (block.type !== "tool-result") continue;
			result.push({
				type: "function_call_output",
				call_id: block.toolCallId,
				output: block.content.filter((item) => item.type === "text").map((item) => item.text).join("")
			});
		}
	}
	return result;
}
function responsesTools(tools) {
	if (tools === void 0) return void 0;
	return tools.filter((tool) => tool.name !== "web_search").map((tool) => ({
		type: "function",
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}));
}
function compactBody(options, wireOptions = {}) {
	const tools = responsesTools(options.tools);
	const compacted = replaceRemoteCompactions({
		model: options.model,
		input: responsesInput(options.messages.slice(0, -1)),
		...options.system === void 0 ? {} : { instructions: options.system },
		...tools === void 0 ? {} : { tools },
		...options.maxTokens === void 0 ? {} : { max_output_tokens: options.maxTokens },
		...options.reasoningEffort === void 0 ? {} : { reasoning: { effort: options.reasoningEffort } }
	});
	return wireOptions.hostedWebSearch !== false && options.tools?.some((tool) => tool.name === "web_search") ? addHostedWebSearch(compacted) : compacted;
}
function compactText(body) {
	const output = Array.isArray(body.output) ? body.output : [];
	const text = [];
	for (const item of output) {
		if (typeof item !== "object" || item === null) continue;
		const value = item;
		if (typeof value.encrypted_content === "string") text.push(value.encrypted_content);
	}
	const encrypted = text.join("\n\n").trim();
	return encrypted.length === 0 ? "" : `${REMOTE_COMPACTION_OPEN}${encrypted}${REMOTE_COMPACTION_CLOSE}`;
}
function nonNegativeInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
/** Map the Responses compact usage object without inventing missing counts. */
function compactUsage(body) {
	if (typeof body.usage !== "object" || body.usage === null) return void 0;
	const raw = body.usage;
	const inputTokens = nonNegativeInteger(raw.input_tokens);
	const outputTokens = nonNegativeInteger(raw.output_tokens);
	if (inputTokens === void 0 || outputTokens === void 0) return void 0;
	const details = typeof raw.input_tokens_details === "object" && raw.input_tokens_details !== null ? raw.input_tokens_details : void 0;
	const cacheReadTokens = nonNegativeInteger(details?.cached_tokens);
	const cacheWriteTokens = nonNegativeInteger(details?.cache_write_tokens);
	const cached = cacheReadTokens ?? 0;
	const writes = cacheWriteTokens ?? 0;
	if (cached + writes > inputTokens) return void 0;
	return {
		inputTokens: inputTokens - cached - writes,
		outputTokens,
		...cacheReadTokens !== void 0 && cacheReadTokens > 0 ? { cacheReadTokens } : {},
		...cacheWriteTokens !== void 0 && cacheWriteTokens > 0 ? { cacheWriteTokens } : {}
	};
}
async function remoteCompact(ctx, options, wireOptions = {}) {
	const profile = profileOf(ctx, options.provider);
	if (!supportsResponses(profile, options.provider) || profile?.baseURL === void 0) throw new Error("Codex remote compaction requires an OpenAI Responses provider with baseURL");
	const headers = await apiHeaders(ctx, profile);
	if (headers === void 0) throw new Error("Codex remote compaction has no configured API key");
	const response = await fetch(responsesEndpoint(profile.baseURL, "responses/compact"), {
		method: "POST",
		headers,
		body: JSON.stringify(compactBody(options, wireOptions)),
		...options.signal === void 0 ? {} : { signal: options.signal }
	});
	if (!response.ok) throw new Error(`remote compaction returned HTTP ${response.status}`);
	const body = await response.json();
	const text = compactText(body);
	if (text.length === 0) throw new Error("remote compaction returned no compaction text");
	const usage = compactUsage(body);
	return {
		text,
		...usage === void 0 ? {} : { usage }
	};
}
/** Remote-first compaction waterfall with the existing DSH path as fallback. */
function remoteCompactStream(ctx, options, next, wireOptions = {}) {
	return (async function* () {
		try {
			const result = await remoteCompact(ctx, options, wireOptions);
			options.signal?.throwIfAborted();
			yield {
				type: "block-start",
				index: 0,
				blockType: "text"
			};
			yield {
				type: "text-delta",
				index: 0,
				text: result.text
			};
			yield {
				type: "block-end",
				index: 0,
				block: {
					type: "text",
					text: result.text
				}
			};
			if (result.usage !== void 0) yield {
				type: "usage",
				usage: result.usage
			};
			options.signal?.throwIfAborted();
			yield {
				type: "finish",
				reason: { kind: "stop" }
			};
		} catch (error) {
			if (options.signal?.aborted) throw error;
			ctx.logger.warn("codex: remote compaction failed; using dsh-compaction-basic fallback");
			ctx.logger.warn(error);
			const serviceTier = serviceTierOf(options);
			yield* hostedWebSearchStream(next, {
				...wireOptions,
				...serviceTier === void 0 ? {} : { serviceTier }
			});
		}
	})();
}
//#endregion
//#region lib/types/activity.js
/** Host-side activity projection for the Codex status line. */
/**
* Whether a stream chunk carries visible model output.
*
* DSH 0.1.2 removed the runtime `isTokenDelta` helper from `dsh-llm/message`
* while keeping the StreamChunk vocabulary unchanged. Keep this small
* predicate local so the harness works with both the old and new DSH bundles.
*/
function isTokenDelta(chunk) {
	switch (chunk.type) {
		case "text-delta":
		case "reasoning-delta": return chunk.text !== "";
		case "tool-call-delta": return chunk.argumentsDelta !== "" || chunk.name !== void 0;
		default: return false;
	}
}
/** Only a non-empty model delta starts the reply phase; usage and finish frames do not. */
function startsModelReply(event) {
	if (event.type === "assistant/message") return true;
	if (event.type !== "assistant/chunk" || typeof event.data !== "object" || event.data === null) return false;
	const chunk = event.data.chunk;
	return chunk !== void 0 && isTokenDelta(chunk);
}
/** Persisted and wire shape of the Codex activity value. */
const codexActivitySchema = z$1.union([
	z$1.object({
		activity: z$1.literal("compaction"),
		startedAt: z$1.number().int().nonnegative()
	}),
	z$1.object({
		activity: z$1.literal("requesting-model"),
		startedAt: z$1.number().int().nonnegative()
	}),
	z$1.object({
		activity: z$1.literal("model-reply"),
		startedAt: z$1.number().int().nonnegative()
	}),
	z$1.object({
		activity: z$1.literal("awaiting-model"),
		startedAt: z$1.number().int().nonnegative()
	}),
	z$1.null()
]);
/** Pure event fold, exported so its reset and reference-stability rules can be tested directly. */
function applyCodexActivity(state, event) {
	if (event.type === "compaction/start") return {
		activity: "compaction",
		startedAt: event.time
	};
	if (event.type === "step/start" || event.type === "llm/retry-started") return {
		activity: "requesting-model",
		startedAt: event.time
	};
	if (startsModelReply(event) && (state?.activity === "requesting-model" || state?.activity === "awaiting-model")) return {
		activity: "model-reply",
		startedAt: event.time
	};
	if (event.type === "turn/start" || event.type === "turn/end" || event.type === "compaction/end") return null;
	if ((state?.activity === "requesting-model" || state?.activity === "model-reply" || state?.activity === "awaiting-model") && (event.type === "llm/retry" || event.type === "tool/call" || event.type === "step/end")) return null;
	return state;
}
const codexActivityProjection = {
	key: "codexActivity",
	stateSchema: codexActivitySchema,
	init: () => null,
	apply: applyCodexActivity,
	wire: {
		viewSchema: codexActivitySchema,
		view: (state) => state
	},
	schema: codexActivitySchema,
	view: (state) => state,
	stateVersion: 2
};
/** Register the optional activity unit without requiring the projection seam in every assembly. */
function registerCodexActivityProjection(ctx) {
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		projectionCtx.sessionProjections.register(codexActivityProjection);
	});
}
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
/** Resolve the full plugin-owned prompt, preserving intentional empty overrides. */
function resolveCodexSystemPrompt(systemPrompt) {
	return systemPrompt ?? DEFAULT_CODEX_SYSTEM_PROMPT;
}
//#endregion
//#region lib/types/context.js
const CODEX_CONTEXT_MAX = 1e6;
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
//#region lib/types/compaction.js
/** Codex compaction backend that honors the latest durable request capacity. */
/**
* The main plugin entry and the compact-command subpath can be evaluated as
* separate bundles. Keep their async context carrier on the process global so
* an explicit command mode reaches the global llm/stream listener.
*/
const COMPACTION_MODE_KEY = Symbol.for("shuind.dsh-codex-harness.compaction-mode");
const COMPACTION_MODE = (() => {
	const registry = globalThis;
	const existing = registry[COMPACTION_MODE_KEY];
	if (existing !== void 0) return existing;
	const storage = new AsyncLocalStorage();
	registry[COMPACTION_MODE_KEY] = storage;
	return storage;
})();
/** Read the explicit preference for the current compaction stream, if any. */
function codexCompactionMode() {
	return COMPACTION_MODE.getStore();
}
const CODEX_SETTINGS_NAMESPACE$1 = "codex";
/** Codex context overrides apply only to GPT-compatible model routes. */
function isGptModel$1(model) {
	return /(?:^|\/)(?:gpt|chatgpt)(?:[-_.]|\d|$)/i.test(model);
}
/** Read the live Codex capacity without requiring a custom LLM service API. */
function configuredContextWindow(ctx) {
	const descriptor = settingsDescriptor(ctx.get("settings"), CODEX_SETTINGS_NAMESPACE$1);
	if (descriptor === void 0) return { available: false };
	const value = descriptor.value;
	return {
		available: true,
		...value?.contextWindow !== void 0 && Number.isSafeInteger(value.contextWindow) && value.contextWindow > 0 ? { value: value.contextWindow } : {}
	};
}
/** Read an explicit capacity persisted in the request header when settings are unavailable. */
function requestContextWindow(session, provider, model) {
	const config = session.requestHeader()?.config;
	if (config?.provider !== provider || config.model !== model) return void 0;
	const value = config.contextWindow;
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
/** Resolve the capacity currently in force for an active Codex compaction. */
function activeContextWindow(ctx, activeSession, provider, model) {
	const session = activeSession.getStore();
	const requestContext = session?.requestContext();
	const configured = isGptModel$1(model) ? configuredContextWindow(ctx) : { available: false };
	return configured.available ? configured.value : (session === void 0 ? void 0 : requestContextWindow(session, provider, model)) ?? (requestContext?.provider === provider && requestContext.model === model ? requestContext.contextWindow : void 0);
}
/** Overlay capacity lookup and auxiliary summary requests for compaction. */
function withDurableContextCapacity(llm, ctx, activeSession) {
	return new Proxy(llm, { get(target, property) {
		if (property === "resolveModelInfo") return async (provider, model, signal) => {
			const info = await target.resolveModelInfo(provider, model, signal);
			const contextWindow = activeContextWindow(ctx, activeSession, provider, model);
			if (contextWindow === void 0) return info;
			return {
				...info,
				context: {
					...info.context,
					contextWindow
				}
			};
		};
		if (property === "stream") return (options) => {
			const contextWindow = activeContextWindow(ctx, activeSession, options.provider, options.model);
			if (contextWindow === void 0 || options.contextWindow === contextWindow) return target.stream(options);
			return target.stream({
				...options,
				contextWindow
			});
		};
		const value = Reflect.get(target, property, target);
		return typeof value === "function" ? value.bind(target) : value;
	} });
}
(class extends BasicCompactionEngine {
	static inject = BasicCompactionEngine.inject;
	static Config = BasicCompactionEngine.Config;
	activeSession;
	constructor(ctx, config = {}) {
		const activeSession = new AsyncLocalStorage();
		const llm = ctx.get("llm");
		if (llm === void 0) throw new Error("codex compaction requires ctx.llm");
		super(ctx.extend({ llm: withDurableContextCapacity(llm, ctx, activeSession) }), config);
		this.activeSession = activeSession;
	}
	compactIfNeeded(agent, trigger, signal) {
		return this.activeSession.run(agent.session, () => super.compactIfNeeded(agent, trigger, signal));
	}
	compactNow(agent, signal, sourceCommandId) {
		return this.activeSession.run(agent.session, () => super.compactNow(agent, signal, sourceCommandId));
	}
});
//#endregion
//#region lib/types/preset-editor.js
let atomicWriteModule;
function loadAtomicWrite() {
	return atomicWriteModule ??= import("@deepseek-ai/dsh-atomic-write");
}
const PRESET_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DEFAULT_CODEX_PRESET_OPTIONS = {
	promptEnabled: true,
	terminalToolsEnabled: true,
	patchToolEnabled: true,
	planToolEnabled: true,
	hostedWebSearchEnabled: true,
	remoteCompactionEnabled: true
};
const CODEX_OPTION_KEYS = Object.keys(DEFAULT_CODEX_PRESET_OPTIONS);
/** Parse tags as syntax only; never execute !!js or resolve aliases into objects. */
function yaml(content) {
	const doc = parseDocument(content, {
		strict: true,
		uniqueKeys: true
	});
	if (doc.errors.length) throw new Error("invalid-preset-yaml");
	return doc;
}
function harnessConfig(content) {
	const doc = yaml(content);
	if (!isSeq(doc.contents)) throw new Error("unsupported-preset");
	const rows = doc.contents.items.filter((row) => isMap(row) && row.get("name") === "@shuind/dsh-codex-harness" && row.get("disabled") !== true);
	if (rows.length !== 1) throw new Error("unsupported-preset");
	const row = rows[0];
	let config = row.get("config", true);
	if (config === void 0) {
		config = new YAMLMap();
		row.set("config", config);
	}
	if (!isMap(config) || config.get("codexCore") === false) throw new Error("unsupported-preset");
	return {
		doc,
		config
	};
}
function explicitPrompt(content) {
	const { config } = harnessConfig(content);
	const node = config.get("presetPrompt", true) ?? config.get("systemPrompt", true);
	if (node === void 0) return void 0;
	if (!isScalar(node) || typeof node.value !== "string" || node.tag) throw new Error("unsupported-prompt-expression");
	return node.value;
}
const SECTION_PLUGIN = "@shuind/dsh-codex-harness/prompt-sections";
function promptFile(node) {
	if (!node.tag || typeof node.value !== "string") return void 0;
	return node.value.match(/^process\.getBuiltinModule\(['"]node:fs['"]\)\.readFileSync\(new URL\(['"]([^'"]+)['"],\s*baseUrl\),\s*['"]utf8['"]\)$/)?.[1];
}
/** Read the actual literal prompt fields, including nested groups, without evaluating YAML tags. */
function promptFields(doc) {
	const fields = [];
	function visit(sequence, parents = []) {
		if (!isSeq(sequence)) return;
		for (const [index, row] of sequence.items.entries()) {
			if (!isMap(row) || row.get("disabled") === true) continue;
			const path = [...parents, String(row.get("id") ?? `#${index}`)];
			const config = row.get("config", true);
			if (isSeq(config)) {
				visit(config, path);
				continue;
			}
			if (!isMap(config)) continue;
			const plugin = String(row.get("name"));
			if (plugin === "@deepseek-ai/dsh-plan-mode") continue;
			const keys = plugin === "@deepseek-ai/dsh-persona" ? [
				"prefix",
				"text",
				"suffix"
			] : plugin === "@shuind/dsh-codex-harness" || plugin === SECTION_PLUGIN ? [] : [
				"prefix",
				"suffix",
				"text",
				"section",
				"prompt",
				"systemPrompt",
				"instructions"
			];
			for (const key of keys) {
				const node = config.get(key, true);
				if (!isScalar(node)) continue;
				fields.push({
					id: JSON.stringify([...path, key]),
					label: plugin === "@deepseek-ai/dsh-persona" ? key === "suffix" ? "Persona · suffix" : "Persona" : `${path.join(" / ")} · ${key}`,
					node,
					row: config,
					key
				});
			}
		}
	}
	visit(doc.contents);
	return fields;
}
function sectionConfig(content) {
	if (supportsCodex(content)) {
		const value = harnessConfig(content).config.get("presetSections", true);
		return isMap(value) ? value : void 0;
	}
	const doc = yaml(content);
	if (!isSeq(doc.contents)) return void 0;
	const row = doc.contents.items.find((row) => isMap(row) && row.get("name") === SECTION_PLUGIN);
	const config = isMap(row) ? row.get("config", true) : void 0;
	return isMap(config) ? config : void 0;
}
/** Some presets intentionally shadow host prompt sections with empty entries. */
function suppressesHostSections(content) {
	const doc = yaml(content);
	let suppressed = false;
	function visit(sequence) {
		if (!isSeq(sequence)) return;
		for (const row of sequence.items) {
			if (!isMap(row)) continue;
			const id = String(row.get("id") ?? "");
			const plugin = String(row.get("name") ?? "");
			if (id === "story-prompt-clean-slate" || plugin === "./tools/prompt/clean-slate.mjs" || /(?:^|[\\/])clean-slate\.mjs$/u.test(plugin)) {
				suppressed = true;
				return;
			}
			const config = row.get("config", true);
			if (isSeq(config)) visit(config);
			if (suppressed) return;
		}
	}
	visit(doc.contents);
	return suppressed;
}
function readPromptSections(content, shared = {}) {
	const codex = supportsCodex(content);
	const overrides = sectionConfig(content);
	const fields = promptFields(yaml(content));
	const sections = fields.map(({ id, label, node }) => ({
		id,
		label,
		text: String(node.value ?? ""),
		editable: !node.tag && typeof node.value === "string"
	}));
	const persona = sections.find((section) => section.label === "Persona");
	const personaOverride = !overrides?.has("persona") && codex ? shared.persona : void 0;
	if (persona && typeof personaOverride === "string" && personaOverride !== DEFAULT_CODEX_PERSONA) persona.text = personaOverride;
	const hostSections = !fields.some((field) => field.label.startsWith("Persona") && field.row.get("complete") === true) && !suppressesHostSections(content) ? [...overrides?.get("harnessSourcePrompt") === "" ? [] : [{
		id: "harness:source",
		label: "DSH Core 源码说明",
		text: String(overrides?.get("harnessSourcePrompt") ?? (codex ? shared.harnessSourcePrompt : void 0) ?? DEFAULT_DSH_CORE_SOURCE_PROMPT),
		editable: true
	}], ...overrides?.get("webSurfacePrompt") === "" ? [] : [{
		id: "app:web-surface",
		label: "DSH Core Web 说明",
		text: String(overrides?.get("webSurfacePrompt") ?? (codex ? shared.webSurfacePrompt : void 0) ?? DEFAULT_DSH_CORE_WEB_PROMPT),
		editable: true
	}]] : [];
	if (hostSections.length) sections.splice(persona ? 1 : 0, 0, ...hostSections);
	if (codex) {
		const index = persona ? hostSections.length + 1 : hostSections.length;
		sections.splice(index, 0, {
			id: "codex:base",
			label: "Codex 操作提示词",
			text: explicitPrompt(content) ?? shared.systemPrompt ?? DEFAULT_CODEX_SYSTEM_PROMPT,
			editable: true
		});
	}
	return sections;
}
/** Patch the contributing fields, not a disconnected secondary prompt. */
function patchPromptSections(content, sections) {
	const doc = yaml(content);
	const fields = promptFields(doc);
	const known = new Map(readPromptSections(content).map((section) => [section.id, section]));
	const overrides = {};
	const seen = /* @__PURE__ */ new Set();
	for (const section of sections) {
		const field = fields.find((field) => field.id === section.id);
		if (seen.has(section.id) || !known.get(section.id)?.editable && !(field && promptFile(field.node)) || typeof section.text !== "string" || section.text.length > 1e6) throw new Error("invalid-prompt-section");
		seen.add(section.id);
		if (field) {
			const node = new Scalar(section.text);
			node.type = Scalar.BLOCK_LITERAL;
			field.row.set(field.key, node);
			continue;
		}
		if (!supportsCodex(content) && known.get(section.id)?.text === section.text) continue;
		if (section.id === "harness:source") overrides.harnessSourcePrompt = section.text;
		if (section.id === "app:web-surface") overrides.webSurfacePrompt = section.text;
	}
	const personaFields = fields.filter((field) => known.get(field.id)?.label.startsWith("Persona"));
	if (supportsCodex(content) && personaFields.length) overrides.persona = personaFields.map((field) => sections.find((section) => section.id === field.id)?.text ?? String(field.node.value)).join("\n\n");
	let result = doc.toString({ lineWidth: 0 });
	if (supportsCodex(result)) {
		const { doc: next, config } = harnessConfig(result);
		const previous = config.get("presetSections", true);
		const merged = isMap(previous) ? previous : new YAMLMap();
		for (const [key, value] of Object.entries(overrides)) merged.set(key, value);
		config.set("presetSections", merged);
		result = next.toString({ lineWidth: 0 });
		const operating = sections.find((section) => section.id === "codex:base");
		if (operating) result = patchPresetComposition(result, operating.text);
	} else if (Object.keys(overrides).length) {
		const next = yaml(result);
		if (!isSeq(next.contents)) throw new Error("invalid-preset-yaml");
		let row = next.contents.items.find((row) => isMap(row) && row.get("name") === SECTION_PLUGIN);
		if (!isMap(row)) {
			const created = new YAMLMap();
			created.set("id", `prompt-sections-${randomUUID().slice(0, 8)}`);
			created.set("name", SECTION_PLUGIN);
			next.add(created);
			row = created;
		}
		const map = row;
		let config = map.get("config", true);
		if (!isMap(config)) {
			config = new YAMLMap();
			map.set("config", config);
		}
		for (const [key, value] of Object.entries(overrides)) config.set(key, value);
		result = next.toString({ lineWidth: 0 });
	}
	return result;
}
function readCodexPresetOptions(content) {
	try {
		const { config } = harnessConfig(content);
		const options = { ...DEFAULT_CODEX_PRESET_OPTIONS };
		for (const key of CODEX_OPTION_KEYS) {
			const value = config.get(key);
			if (typeof value === "boolean") options[key] = value;
		}
		return options;
	} catch {
		return { ...DEFAULT_CODEX_PRESET_OPTIONS };
	}
}
function supportsCodex(content) {
	try {
		harnessConfig(content);
		return true;
	} catch {
		return false;
	}
}
/** Structural validation only: executable tags stay inert until DSH mounts a selected preset. */
function validateComposition(content) {
	if (content.length > 1e6) throw new Error("invalid-preset-yaml");
	const doc = yaml(content);
	if (!isSeq(doc.contents) || !doc.contents.items.length) throw new Error("invalid-preset-yaml");
	const ids = /* @__PURE__ */ new Set();
	for (const entry of doc.contents.items) {
		if (!isMap(entry)) throw new Error("invalid-preset-yaml");
		const row = entry;
		if (typeof row.get("name") !== "string") throw new Error("invalid-preset-yaml");
		const id = row.get("id");
		if (id !== void 0) {
			if (typeof id !== "string" || ids.has(id)) throw new Error("invalid-preset-yaml");
			ids.add(id);
		}
	}
}
function enhanceComposition(content) {
	validateComposition(content);
	if (supportsCodex(content)) return content;
	const doc = yaml(content);
	if (!isSeq(doc.contents)) throw new Error("invalid-preset-yaml");
	if (doc.contents.items.some((row) => isMap(row) && row.get("name") === "@shuind/dsh-codex-harness")) throw new Error("ambiguous-harness-row");
	let wasCompletePersona = false;
	for (const row of doc.contents.items) {
		if (!isMap(row) || row.get("name") !== "@deepseek-ai/dsh-persona") continue;
		const persona = row.get("config", true);
		if (isMap(persona) && persona.get("complete") === true) {
			wasCompletePersona = true;
			persona.set("complete", false);
		}
	}
	const config = {
		globalEnhancements: false,
		codexCore: true
	};
	if (wasCompletePersona) config.presetSections = {
		harnessSourcePrompt: "",
		webSurfacePrompt: ""
	};
	doc.add(doc.createNode({
		id: `codex-harness-${randomUUID().slice(0, 8)}`,
		name: "@shuind/dsh-codex-harness",
		config
	}));
	return doc.toString({ lineWidth: 0 });
}
function patchPresetComposition(content, prompt, inherit = false) {
	const { doc, config } = harnessConfig(content);
	config.delete("systemPrompt");
	if (inherit) config.delete("presetPrompt");
	else {
		const node = new Scalar(prompt);
		node.type = prompt.includes("\n") ? Scalar.BLOCK_LITERAL : Scalar.QUOTE_DOUBLE;
		config.set("presetPrompt", node);
	}
	return doc.toString({ lineWidth: 0 });
}
/** Store user-facing Codex capability switches in the Harness row. */
function patchCodexPresetOptions(content, options) {
	const { doc, config } = harnessConfig(content);
	for (const key of CODEX_OPTION_KEYS) {
		const value = options[key];
		if (value !== void 0) config.set(key, value);
	}
	return doc.toString({ lineWidth: 0 });
}
function patchPresetMetadata(content, name, description) {
	const doc = yaml(content);
	if (doc.contents !== null && !isMap(doc.contents)) throw new Error("invalid-preset-metadata");
	for (const [key, value] of Object.entries({
		name,
		description
	})) {
		const node = new Scalar(value);
		node.type = Scalar.QUOTE_DOUBLE;
		doc.set(key, node);
	}
	return doc.toString({ lineWidth: 0 });
}
function validate(input) {
	if (typeof input.name !== "string" || !input.name.trim() || /[\r\n]/.test(input.name) || input.name.length > 200) throw new Error("invalid-preset-name");
	if (typeof input.description !== "string" || input.description.length > 4e3) throw new Error("invalid-preset-description");
	if (typeof input.systemPrompt !== "string" || input.systemPrompt.length > 1e6) throw new Error("invalid-preset-prompt");
	return {
		...input,
		name: input.name.trim()
	};
}
function revision(composition, metadata) {
	return createHash("sha256").update(composition).update("\0").update(metadata ?? "").digest("hex");
}
async function optionalFile(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
		throw error;
	}
}
async function mode(path) {
	try {
		return (await stat(path)).mode & 511;
	} catch {
		return 384;
	}
}
async function assertWithinRoot(path, roots) {
	if (!roots?.length) throw new Error("preset-root-unavailable");
	const target = await realpath(path);
	for (const root of roots) {
		if (root.trust !== "user") continue;
		const home = process.env.DSH_HOME ?? process.env.USERPROFILE ?? process.env.HOME ?? "";
		const expanded = root.path.replace(/^~(?=[\\/]|$)/, home);
		try {
			const rel = relative(await realpath(resolve(expanded)), target);
			if (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\")) return;
		} catch {}
	}
	throw new Error("preset-outside-user-root");
}
var CodexPresetEditor = class extends TypertRemoteService {
	static inject = ["agentPresets", "settings"];
	agentPresets;
	sharedSettings;
	indexed;
	constructor(ctx, _config) {
		super(ctx, "codexPresetEditor");
		this.agentPresets = ctx.get("agentPresets");
		const settings = ctx.get("settings");
		this.sharedSettings = () => readSettings(settings, "codex") ?? {};
	}
	async catalog() {
		if (this.agentPresets.list) {
			const rows = await this.agentPresets.list();
			this.indexed = new Map(rows.map((row) => [row.id, row]));
			return {
				presets: rows.filter((row) => row.broken === void 0).map((row) => ({
					id: row.id,
					name: row.name || row.id,
					description: row.description ?? "",
					editable: row.trust === "user",
					isDefault: row.id === this.agentPresets.defaultId
				})),
				authorable: this.agentPresets.authorable ?? false,
				excludedCount: rows.filter((row) => row.broken !== void 0).length
			};
		}
		const roster = await this.agentPresets.remoteExportList();
		const presets = roster.presets.filter((row) => row.broken === void 0).map((row) => ({
			id: row.id,
			name: row.name || row.id,
			description: row.description ?? "",
			editable: row.trust === "user",
			isDefault: row.isDefault
		}));
		return {
			presets,
			authorable: roster.authorable,
			excludedCount: roster.presets.length - presets.length
		};
	}
	async read(id) {
		const preset = this.indexed?.get(id) ?? await this.preset(id);
		if (preset.broken !== void 0) throw new Error("invalid-preset");
		if (preset.path === void 0) {
			const document = await this.agentPresets.readDocument(id);
			const composition = document.content;
			validateComposition(composition);
			const codex = supportsCodex(composition);
			const prompt = codex ? explicitPrompt(composition) : void 0;
			const shared = this.sharedSettings?.() ?? {};
			return {
				id,
				name: document.name ?? preset.name ?? id,
				description: document.description ?? preset.description ?? "",
				systemPrompt: prompt ?? shared.systemPrompt ?? DEFAULT_CODEX_SYSTEM_PROMPT,
				inheritPrompt: prompt === void 0,
				revision: revision(composition, void 0),
				editable: false,
				codex,
				codexOptions: readCodexPresetOptions(composition),
				composition,
				promptSections: readPromptSections(composition, shared).map((section) => ({
					...section,
					editable: false
				}))
			};
		}
		const [composition, metadata] = await Promise.all([readFile(preset.path, "utf8"), optionalFile(resolve(dirname(preset.path), "preset.yml"))]);
		const meta = metadata ? yaml(metadata) : void 0;
		validateComposition(composition);
		const codex = supportsCodex(composition);
		const prompt = codex ? explicitPrompt(composition) : void 0;
		const shared = this.sharedSettings?.() ?? {};
		const promptSections = readPromptSections(composition, shared);
		for (const field of promptFields(yaml(composition))) {
			const reference = promptFile(field.node);
			if (!reference) continue;
			const section = promptSections.find((section) => section.id === field.id);
			try {
				const root = await realpath(dirname(preset.path));
				const target = await realpath(resolve(root, reference));
				const rel = relative(root, target);
				if (isAbsolute(rel) || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) continue;
				if ((await stat(target)).size > 1e6) continue;
				section.text = await readFile(target, "utf8");
				section.editable = true;
			} catch {}
		}
		return {
			id,
			name: String(meta?.get("name") ?? id),
			description: String(meta?.get("description") ?? ""),
			systemPrompt: prompt ?? shared.systemPrompt ?? DEFAULT_CODEX_SYSTEM_PROMPT,
			inheritPrompt: prompt === void 0,
			revision: revision(composition, metadata),
			editable: preset.trust === "user",
			codex,
			codexOptions: readCodexPresetOptions(composition),
			composition,
			promptSections
		};
	}
	async create(rawInput) {
		const input = validate(rawInput);
		if (!this.agentPresets.copy || !this.agentPresets.remove) throw new Error("preset-read-only");
		const remove = this.agentPresets.remove.bind(this.agentPresets);
		await this.preset(input.sourceId);
		const id = `codex-${randomUUID().slice(0, 12)}`;
		await this.agentPresets.copy(input.sourceId, id, input.name);
		try {
			const copy = await this.read(id);
			const base = input.composition ?? copy.composition;
			let next = input.enableCodex ? enhanceComposition(base) : base;
			if (supportsCodex(next)) {
				next = patchPresetComposition(next, input.systemPrompt, input.inheritPrompt);
				next = patchCodexPresetOptions(next, input.codexOptions ?? {});
			}
			return await this.update({
				...input,
				id,
				revision: copy.revision,
				composition: next
			});
		} catch (error) {
			await remove(id);
			throw error;
		}
	}
	async update(rawInput) {
		const input = validate(rawInput);
		const preset = await this.preset(input.id);
		if (preset.path === void 0) throw new Error("preset-read-only");
		if (preset.trust !== "user") throw new Error("built-in presets cannot be edited here");
		const composition = resolve(preset.path);
		if (composition.split(/[\\/]/).at(-1) !== "agent.cordis.yml") throw new Error("invalid-preset-path");
		await assertWithinRoot(composition, this.agentPresets.roots);
		const metadata = resolve(dirname(composition), "preset.yml");
		if (await optionalFile(metadata) !== void 0) await assertWithinRoot(metadata, this.agentPresets.roots);
		const { withFileLock, writeFileAtomic } = await loadAtomicWrite();
		return withFileLock(composition, async () => {
			const oldComposition = await readFile(composition, "utf8");
			const oldMetadata = await optionalFile(metadata);
			if (input.revision !== void 0 && input.revision !== revision(oldComposition, oldMetadata)) throw new Error("preset-conflict");
			const editedComposition = input.composition !== void 0 ? input.composition : oldComposition;
			let nextComposition = input.enableCodex && !supportsCodex(editedComposition) ? enhanceComposition(editedComposition) : editedComposition;
			if (supportsCodex(nextComposition)) {
				nextComposition = patchPresetComposition(nextComposition, input.systemPrompt, input.inheritPrompt);
				if (input.codexOptions !== void 0) nextComposition = patchCodexPresetOptions(nextComposition, input.codexOptions);
			}
			if (input.promptSections) nextComposition = patchPromptSections(nextComposition, input.promptSections);
			validateComposition(nextComposition);
			const nextMetadata = patchPresetMetadata(oldMetadata ?? "", input.name, input.description);
			const compositionMode = await mode(composition);
			const metadataMode = await mode(metadata);
			await writeFileAtomic(resolve(dirname(composition), ".codex-editor-backup.json"), JSON.stringify({
				composition: oldComposition,
				metadata: oldMetadata ?? null
			}), {
				mode: 384,
				dirMode: 448
			});
			try {
				await writeFileAtomic(composition, nextComposition, {
					mode: compositionMode,
					dirMode: 448
				});
				await writeFileAtomic(metadata, nextMetadata, {
					mode: metadataMode,
					dirMode: 448
				});
				const result = await this.agentPresets.resolve(input.id);
				if (result.broken !== void 0) throw new Error("invalid-preset-after-save");
				this.indexed?.set(input.id, result);
				return await this.read(input.id);
			} catch (error) {
				await writeFileAtomic(composition, oldComposition, {
					mode: compositionMode,
					dirMode: 448
				});
				if (oldMetadata !== void 0) await writeFileAtomic(metadata, oldMetadata, {
					mode: metadataMode,
					dirMode: 448
				});
				else await unlink(metadata).catch((cause) => {
					if (cause.code !== "ENOENT") throw cause;
				});
				throw error;
			}
		}, { waitMs: 1e4 });
	}
	async preset(id) {
		if (!PRESET_ID.test(id)) throw new Error("invalid-preset-id");
		const preset = await this.agentPresets.resolve(id);
		if (preset.broken !== void 0) throw new Error("invalid-preset");
		this.indexed ??= /* @__PURE__ */ new Map();
		this.indexed.set(id, preset);
		return preset;
	}
};
function markRemoteMethod(methodName) {
	const descriptor = Object.getOwnPropertyDescriptor(CodexPresetEditor.prototype, methodName);
	const initializers = [];
	Remote(methodName)(descriptor.value, {
		kind: "method",
		name: methodName,
		static: false,
		private: false,
		addInitializer: (initializer) => {
			initializers.push(initializer);
		}
	});
	const receiver = Object.create(CodexPresetEditor.prototype);
	for (const initializer of initializers) initializer.call(receiver);
}
for (const method of [
	"read",
	"update",
	"catalog",
	"create"
]) markRemoteMethod(method);
//#endregion
//#region lib/types/prompt-sections.js
const Config$1 = z.object({
	persona: z.string(),
	harnessSourcePrompt: z.string(),
	webSurfacePrompt: z.string()
});
/** Override only existing sections; dynamic runtime context and tool guidance remain host-owned. */
function applyPromptSections(assembly, config) {
	const variables = { ...assembly.variables };
	variables.sourceRoot ??= assembly.sections.find((s) => s.name === "harness:source")?.text.match(/^The DeepSeek Harness implementation checkout is at (.+?)\. The checkout location/u)?.[1];
	variables.webUrl ??= assembly.sections.find((s) => s.name === "app:web-surface")?.text.match(/^You are interacting with the user through the DeepSeek Harness Web GUI at (.+?)\. When/u)?.[1];
	const values = {
		"deployment:persona": config.persona,
		"harness:source": config.harnessSourcePrompt,
		"app:web-surface": config.webSurfacePrompt
	};
	return {
		...assembly,
		sections: assembly.sections.map((section) => {
			const text = values[section.name];
			return text === void 0 ? section : {
				...section,
				text: text.replace(/\{\{([\w.-]+)\}\}/g, (whole, key) => variables[key] ?? whole)
			};
		})
	};
}
//#endregion
//#region lib/types/index.js
/** Codex-compatible prompt overlay and core tools for a dsh agent preset. */
const name = "codex";
const inject = [
	"tools",
	"systemPrompt",
	"shell",
	"fs",
	"llm",
	"credentials",
	"settings"
];
const DEFAULT_MAX_OUTPUT_BYTES = 1048576;
/** Add the preset editor when DSH's optional user-preset service is available. */
function installPresetEditor(ctx) {
	ctx.inject(["agentPresets"], (presetCtx) => {
		(async () => {
			try {
				await presetCtx.plugin(CodexPresetEditor);
			} catch (error) {
				ctx.logger.warn("codex: preset editor is unavailable on this host");
				ctx.logger.warn(error);
			}
		})();
	});
}
/** Runtime configuration schema for the Codex tool bridge. */
const Config = z.object({
	globalEnhancements: z.boolean().default(true),
	codexCore: z.boolean().default(true),
	defaultYieldTimeMs: z.number().step(1).min(0).default(1e4),
	pollYieldTimeMs: z.number().step(1).min(0).default(5e3),
	writeYieldTimeMs: z.number().step(1).min(0).default(250),
	maxOutputBytes: z.number().step(1).min(1).default(DEFAULT_MAX_OUTPUT_BYTES),
	hostedWebSearch: z.boolean().default(true),
	remoteCompact: z.boolean().default(true),
	systemPrompt: z.string().default(DEFAULT_CODEX_SYSTEM_PROMPT),
	presetPrompt: z.string(),
	presetSections: Config$1,
	promptEnabled: z.boolean(),
	terminalToolsEnabled: z.boolean(),
	patchToolEnabled: z.boolean(),
	planToolEnabled: z.boolean(),
	hostedWebSearchEnabled: z.boolean(),
	remoteCompactionEnabled: z.boolean(),
	persona: z.string().default(DEFAULT_CODEX_PERSONA),
	harnessSourcePrompt: z.string().default(DEFAULT_DSH_CORE_SOURCE_PROMPT),
	webSurfacePrompt: z.string().default(DEFAULT_DSH_CORE_WEB_PROMPT)
});
const LLM_PI_AI_SETTINGS = "llm-pi-ai";
const GPT_REASONING_EFFORTS = {
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "xhigh",
	max: "max"
};
function codexReasoningEfforts(configured) {
	if (configured === false) return false;
	const filtered = configured === void 0 ? {} : Object.fromEntries(Object.entries(configured).filter(([level]) => level !== "off" && level !== "minimal"));
	return Object.keys(filtered).length === 0 ? GPT_REASONING_EFFORTS : filtered;
}
/** GPT model ids are the only models whose relay capabilities Codex fills in. */
function isGptModel(id) {
	return /(?:^|\/)(?:gpt|chatgpt)(?:[-_.]|\d|$)/i.test(id);
}
/** Add Codex defaults without overwriting explicit user capabilities. */
function enrichCodexModel(model) {
	if (!isGptModel(model.id)) return model;
	const input = model.input === void 0 || model.input.length === 0 ? ["text", "image"] : model.input;
	const efforts = codexReasoningEfforts(model.reasoningEfforts);
	if (input === model.input && efforts === model.reasoningEfforts) return model;
	return {
		...model,
		input,
		reasoningEfforts: efforts
	};
}
/** The settings schema keys modelOverrides by id, so its values must not carry an id field. */
function enrichCodexOverride(id, model) {
	if (!isGptModel(id)) return model;
	const { id: _id, ...withoutId } = enrichCodexModel({
		...model,
		id
	});
	const inputMissing = model.input === void 0 || model.input.length === 0;
	const nextEfforts = codexReasoningEfforts(model.reasoningEfforts);
	const reasoningChanged = JSON.stringify(nextEfforts) !== JSON.stringify(model.reasoningEfforts);
	if (!inputMissing && !reasoningChanged) return model;
	return {
		...withoutId,
		reasoningEfforts: nextEfforts
	};
}
/** Persist only missing GPT capabilities into the user's existing pi-ai model config. */
async function enrichConfiguredGptModels(ctx) {
	const settings = ctx.get("settings");
	if (typeof settings?.update !== "function") return;
	const descriptor = settingsDescriptor(settings, LLM_PI_AI_SETTINGS);
	const current = descriptor?.value;
	if (current?.providers === void 0) return;
	const providers = {};
	let changed = false;
	for (const [provider, profile] of Object.entries(current.providers)) {
		const models = profile.models;
		const overrides = profile.modelOverrides;
		const nextModels = Array.isArray(models) ? models.map(enrichCodexModel) : void 0;
		const nextOverrides = overrides === void 0 ? void 0 : Object.fromEntries(Object.entries(overrides).map(([id, model]) => [id, enrichCodexOverride(id, model)]));
		const modelsChanged = nextModels !== void 0 && nextModels.some((model, index) => model !== models?.[index]);
		const overridesChanged = nextOverrides !== void 0 && overrides !== void 0 && Object.entries(nextOverrides).some(([id, model]) => model !== overrides[id]);
		if (modelsChanged || overridesChanged) {
			changed = true;
			providers[provider] = {
				...modelsChanged ? { models: nextModels } : {},
				...overridesChanged ? { modelOverrides: nextOverrides } : {}
			};
		}
	}
	if (changed && descriptor !== void 0) {
		if (descriptor.revision === void 0) await settings.update(descriptor.ns, { providers });
		else await settings.update(descriptor.ns, { providers }, descriptor.revision);
	}
}
/** Keep newly edited GPT model entries enriched while Codex mode is mounted. */
function watchConfiguredGptModels(ctx) {
	let tail = Promise.resolve();
	const schedule = () => {
		tail = tail.then(() => enrichConfiguredGptModels(ctx)).catch((error) => {
			ctx.logger.warn("codex: could not enrich configured GPT model capabilities");
			ctx.logger.warn(error);
		});
	};
	ctx.on("settings/document-updated", (ns) => {
		if (ns === LLM_PI_AI_SETTINGS) schedule();
	});
	schedule();
}
/** Install the optional settings source used by requests and prompt assembly. */
function installCodexSettings(ctx, systemPrompt, persona, harnessSourcePrompt, webSurfacePrompt) {
	const entry = {
		...CODEX_SETTINGS_ENTRY,
		systemPrompt,
		persona,
		harnessSourcePrompt,
		webSurfacePrompt
	};
	const withDefaults = (value) => ({
		...entry,
		...value
	});
	let source = () => entry;
	let attached = false;
	const attachSettings = (candidate) => {
		if (attached || candidate === void 0 || candidate === null) return attached;
		const settings = candidate;
		if (typeof settings.get === "function") {
			const get = settings.get.bind(settings);
			if (get("codex") !== void 0) {
				source = () => get(CODEX_SETTINGS_NAMESPACE);
				attached = true;
				return true;
			}
		}
		if (typeof candidate.describe === "function") {
			source = () => readSettings(candidate, "codex") ?? entry;
			attached = true;
			return true;
		}
		if (typeof settings.installSection === "function") {
			settings.installSection.call(settings, ctx, CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA, entry, {
				setSource: (current) => {
					source = current;
				},
				onChange: () => {}
			});
			attached = true;
			return true;
		}
		if (typeof settings.register === "function") {
			const scope = settings.register.call(settings, CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA, { base: entry });
			source = () => scope.get();
			attached = true;
			return true;
		}
		return false;
	};
	if (!attachSettings(ctx.get("settings"))) ctx.inject(["settings"], (settingsCtx) => {
		attachSettings(settingsCtx.settings);
	});
	return { current: () => withDefaults(source()) };
}
/** Read the event snapshot across the pre- and post-0.1.2 DSH session APIs. */
function sessionEvents(session) {
	const compatible = session;
	if (typeof compatible.snapshotEvents === "function") return compatible.snapshotEvents();
	return compatible.events ?? [];
}
function hasOpenTurn(session) {
	const events = sessionEvents(session);
	const start = events.findLast((event) => event.type === "turn/start");
	const end = events.findLast((event) => event.type === "turn/end");
	return start !== void 0 && (end === void 0 || start.seq > end.seq);
}
/**
* Pair the live Codex capacity with the token-meter context projection.
*
* The core loop records adapter metadata in `request/context`, while Codex's
* setting is a request-scoped LLM capacity. Appending the override after the
* loop's metadata event keeps the official ContextMeter and compaction engine
* on the same effective capacity.
*/
function syncCodexContextWindow(session, contextWindow) {
	if (contextWindow === void 0 || !Number.isSafeInteger(contextWindow) || contextWindow <= 0 || !hasOpenTurn(session)) return;
	const config = session.requestHeader()?.config;
	if (typeof config?.provider !== "string" || typeof config.model !== "string" || !isGptModel(config.model)) return;
	const current = session.requestContext();
	if (current?.provider === config.provider && current.model === config.model && current.contextWindow === contextWindow) return;
	session.append("request/context", {
		provider: config.provider,
		model: config.model,
		contextWindow
	});
}
/** Keep the official context meter synchronized with a live Codex override. */
function installCodexContextProjection(ctx, current) {
	const sync = (session, contextWindow = current().contextWindow) => {
		syncCodexContextWindow(session, contextWindow);
	};
	const pending = /* @__PURE__ */ new WeakSet();
	const syncAfterPublication = (session) => {
		if (pending.has(session)) return;
		pending.add(session);
		queueMicrotask(() => {
			try {
				sync(session);
			} finally {
				pending.delete(session);
			}
		});
	};
	const syncAll = (contextWindow = current().contextWindow) => {
		const sessions = ctx.get("sessions");
		for (const session of sessions?.list?.() ?? []) sync(session, contextWindow);
	};
	ctx.on("session/event", (session, event) => {
		if (event.type === "request/header" || event.type === "request/context") syncAfterPublication(session);
	});
	ctx.on("session/created", (session) => {
		sync(session);
	});
	ctx.on("settings/updated", (ns, next) => {
		if (settingsNamespaceMatches(ns, "codex")) syncAll(next.contextWindow);
	});
	ctx.on("settings/document-updated", (ns) => {
		if (settingsNamespaceMatches(ns, "codex")) syncAll();
	});
	syncAll();
}
/** Apply the live Codex controls to one agent request without leaking them to other routes. */
function applyCodexRequestSettings(request, settings) {
	const { contextWindow: _inheritedContextWindow, serviceTier: _inheritedServiceTier, ...withoutCodexControls } = request;
	if (!isGptModel(request.model)) return withoutCodexControls;
	return {
		...withoutCodexControls,
		...settings.contextWindow === void 0 ? {} : { contextWindow: settings.contextWindow },
		...settings.fast ? { serviceTier: "priority" } : {}
	};
}
/** Put the agent persona first and omit the generic Harness identity opener. */
function normalizeCodexPromptAssembly(assembly) {
	const sections = assembly.sections.filter((section) => section.name !== "harness:identity");
	const persona = sections.find((section) => section.name === "deployment:persona");
	if (persona === void 0) return {
		...assembly,
		sections
	};
	return {
		...assembly,
		sections: [persona, ...sections.filter((section) => section.name !== "deployment:persona")]
	};
}
function sectionText(assembly, name) {
	return assembly.sections.find((candidate) => candidate.name === name)?.text;
}
function promptVariables(assembly) {
	const variables = { ...assembly.variables };
	if (variables.sourceRoot === void 0) {
		const match = sectionText(assembly, "harness:source")?.match(/^The DeepSeek Harness implementation checkout is at (.+?)\. The checkout location/u);
		if (match?.[1] !== void 0) variables.sourceRoot = match[1];
	}
	if (variables.webUrl === void 0) {
		const match = sectionText(assembly, "app:web-surface")?.match(/^You are interacting with the user through the DeepSeek Harness Web GUI at (.+?)\. When/u);
		if (match?.[1] !== void 0) variables.webUrl = match[1];
	}
	return variables;
}
function interpolateCodexPrompt(text, variables) {
	return text.replace(/\{\{([\w.-]+)\}\}/g, (whole, key) => variables[key] ?? whole);
}
/** Apply user-editable Persona and DSH Core runtime prompt templates. */
function applyCodexPromptOverrides(assembly, settings) {
	const overrides = {
		"deployment:persona": settings.persona,
		"harness:source": settings.harnessSourcePrompt,
		"app:web-surface": settings.webSurfacePrompt
	};
	const defaults = {
		"deployment:persona": DEFAULT_CODEX_PERSONA,
		"harness:source": DEFAULT_DSH_CORE_SOURCE_PROMPT,
		"app:web-surface": DEFAULT_DSH_CORE_WEB_PROMPT
	};
	if (!Object.entries(overrides).some(([name, text]) => text !== void 0 && text !== defaults[name])) return assembly;
	const variables = promptVariables(assembly);
	const sections = assembly.sections.map((section) => {
		const template = overrides[section.name];
		return template === void 0 || template === defaults[section.name] ? section : {
			...section,
			text: interpolateCodexPrompt(template, variables)
		};
	});
	return {
		...assembly,
		sections,
		variables
	};
}
const CODEX_TOOL_NAMES = {
	terminalToolsEnabled: /* @__PURE__ */ new Set(["exec_command", "write_stdin"]),
	patchToolEnabled: /* @__PURE__ */ new Set(["apply_patch"]),
	planToolEnabled: /* @__PURE__ */ new Set(["update_plan"])
};
/** Remove disabled Codex capabilities from the next model-visible assembly. */
function applyCodexCapabilitySettings(assembly, settings) {
	const disabled = /* @__PURE__ */ new Set();
	for (const [setting, names] of Object.entries(CODEX_TOOL_NAMES)) {
		if (settings[setting]) continue;
		for (const name of names) disabled.add(name);
	}
	const withOverrides = applyCodexPromptOverrides(disabled.size === 0 ? assembly : {
		...assembly,
		tools: assembly.tools.filter((tool) => !disabled.has(tool.name))
	}, settings);
	return settings.promptEnabled ? normalizeCodexPromptAssembly(withOverrides) : withOverrides;
}
/** Build the complete plugin-owned prompt, preserving an intentional empty value. */
function buildCodexSystemPrompt(config = {}) {
	return resolveCodexSystemPrompt(config.systemPrompt);
}
const EXEC_COMMAND_DESCRIPTION = "Runs a shell command. By default it uses pipes: a running session can be polled for output but does not accept stdin. Set tty=true before starting a command that needs interactive input; background jobs use pipes.";
const WRITE_STDIN_DESCRIPTION = "Polls output from an existing unified exec session. Non-empty chars can be sent only to a session created with tty=true; pipe-backed sessions accept empty chars for polling only.";
const UPDATE_PLAN_DESCRIPTION = "Updates the task plan.\nProvide an optional explanation and a list of plan items, each with a step and status.\nAt most one step can be in_progress at a time.";
const PLAN_STATUSES = [
	"pending",
	"in_progress",
	"completed"
];
function assertCapabilityEnabled(current, setting, toolName) {
	if (!current()[setting]) throw new Error(`${toolName}: disabled in Codex Harness plugin settings`);
}
function sessionCwd(exec) {
	return exec.agent?.session.header.cwd;
}
function resolvePolicy(ctx, exec) {
	return ctx.get("sandboxPolicy")?.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });
}
async function resolveTarget(ctx, path, exec) {
	const cwd = sessionCwd(exec);
	return ctx.fs.resolve(path, cwd === void 0 ? { signal: exec.signal } : {
		cwd,
		signal: exec.signal
	});
}
async function observedTarget(ctx, target, exec) {
	const info = await ctx.fs.stat(target, exec.signal);
	if (info === void 0) throw new Error(`apply_patch: file not found: ${target.displayPath}`);
	if (info.type !== "file") throw new Error(`apply_patch: not a regular file: ${target.displayPath}`);
	ctx.emit("fs/observed", target, {
		kind: "present",
		version: info.version
	}, exec);
	return info;
}
async function writePatchedFile(ctx, target, content, fallback, exec, policy) {
	const intent = await ctx.waterfall("fs/write-intent", target, exec, () => fallback);
	const outcome = await ctx.fs.writeText(target, content, intent, exec.signal, policy);
	ctx.emit("fs/observed", target, {
		kind: "present",
		version: outcome.version
	}, exec);
	return outcome.operation === "create" ? "created" : "updated";
}
async function deletePatchedFile(ctx, target, version, exec, policy) {
	const remove = ctx.fs.remove;
	if (typeof remove !== "function") throw new Error("apply_patch: the configured dsh filesystem does not support file deletion");
	await remove.call(ctx.fs, target, { version }, exec.signal, policy);
	ctx.emit("fs/observed", target, { kind: "absent" }, exec);
}
async function applyOnePatch(ctx, file, exec, policy) {
	const target = await resolveTarget(ctx, file.path, exec);
	if (file.kind === "add") {
		if (await ctx.fs.stat(target, exec.signal) !== void 0) throw new Error(`apply_patch: file already exists: ${target.displayPath}`);
		ctx.emit("fs/observed", target, { kind: "absent" }, exec);
		await writePatchedFile(ctx, target, file.content, { kind: "createIfAbsent" }, exec, policy);
		return {
			path: file.path,
			operation: "created"
		};
	}
	const sourceInfo = await observedTarget(ctx, target, exec);
	const original = await ctx.fs.readText(target, exec.signal);
	const updated = file.kind === "delete" ? void 0 : applyPatchHunks(original, file.hunks, file.path);
	if (file.kind === "delete") {
		await deletePatchedFile(ctx, target, sourceInfo.version, exec, policy);
		return {
			path: file.path,
			operation: "deleted"
		};
	}
	if (file.moveTo === void 0) {
		await writePatchedFile(ctx, target, updated, {
			kind: "replaceIfVersion",
			version: sourceInfo.version
		}, exec, policy);
		return {
			path: file.path,
			operation: "updated"
		};
	}
	const destination = await resolveTarget(ctx, file.moveTo, exec);
	if (destination.targetKey === target.targetKey) {
		await writePatchedFile(ctx, target, updated, {
			kind: "replaceIfVersion",
			version: sourceInfo.version
		}, exec, policy);
		return {
			path: file.path,
			operation: "updated",
			moveTo: file.moveTo
		};
	}
	if (await ctx.fs.stat(destination, exec.signal) !== void 0) throw new Error(`apply_patch: move destination already exists: ${destination.displayPath}`);
	ctx.emit("fs/observed", destination, { kind: "absent" }, exec);
	await writePatchedFile(ctx, destination, updated, { kind: "createIfAbsent" }, exec, policy);
	await deletePatchedFile(ctx, target, sourceInfo.version, exec, policy);
	return {
		path: file.path,
		operation: "moved",
		moveTo: file.moveTo
	};
}
function patchSummary(value) {
	const letter = (operation) => {
		switch (operation) {
			case "created": return "A";
			case "updated": return "M";
			case "deleted": return "D";
			case "moved": return "M";
			default: return operation;
		}
	};
	return `Success. Updated the following files:\n${value.files.map((file) => `${letter(file.operation)} ${file.operation === "moved" ? file.moveTo : file.path}`).join("\n")}\n`;
}
function planTodos(args) {
	const seen = /* @__PURE__ */ new Set();
	let active = 0;
	const todos = [];
	for (const item of args.plan) {
		const content = item.step.trim();
		if (content.length === 0) throw new Error("update_plan: every step must be non-empty");
		if (seen.has(content)) throw new Error(`update_plan: duplicate step ${JSON.stringify(content)}`);
		seen.add(content);
		if (item.status === "in_progress") active++;
		todos.push({
			content,
			status: item.status
		});
	}
	if (active > 1) throw new Error("update_plan: at most one step may be in_progress");
	return todos;
}
function registerExecTools(ctx, config) {
	ctx.tools.register(defineTool({
		name: "exec_command",
		description: EXEC_COMMAND_DESCRIPTION,
		parameters: {
			cmd: {
				type: "string",
				required: true,
				description: "Shell command to execute."
			},
			workdir: {
				type: "string",
				description: "Working directory for the command. Defaults to the turn cwd."
			},
			tty: {
				type: "boolean",
				description: "True allocates a PTY for the command; false or omitted uses plain pipes."
			},
			run_in_background: {
				type: "boolean",
				description: "Run as a DSH background job and return its job id immediately; collect output with job_output and stop it with job_kill. Only supported for pipe-backed commands."
			},
			yield_time_ms: {
				type: "number",
				description: "Wait before yielding output. Defaults to 10000 ms; effective range is 250-30000 ms."
			},
			max_output_tokens: {
				type: "number",
				description: "Output token budget. Defaults to 10000 tokens; larger requests may be capped by policy."
			},
			shell: {
				type: "string",
				description: "Shell binary to launch. Defaults to the user's default shell."
			},
			login: {
				type: "boolean",
				description: "True runs the shell with -l/-i semantics; false disables them. Defaults to true."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					chunk_id: { type: "string" },
					wall_time_seconds: {
						type: "number",
						required: true
					},
					exit_code: { type: "number" },
					session_id: { type: "number" },
					job_id: { type: "string" },
					original_token_count: { type: "number" },
					output: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: renderExecResult(value)
			}]
		},
		async execute(args, exec) {
			assertCapabilityEnabled(config.currentSettings, "terminalToolsEnabled", "exec_command");
			return runExecCommand(ctx, args, exec, config);
		},
		presentCall: (args) => ({
			card: "terminal",
			title: args.cmd,
			...args.workdir === void 0 ? {} : { cwd: args.workdir }
		})
	}));
	ctx.tools.register(defineTool({
		name: "write_stdin",
		description: WRITE_STDIN_DESCRIPTION,
		parameters: {
			session_id: {
				type: "number",
				required: true,
				description: "Identifier of the running unified exec session."
			},
			chars: {
				type: "string",
				description: "Characters to send to a PTY session created with tty=true. Leave empty to poll output without writing; pipe-backed sessions do not accept input."
			},
			yield_time_ms: {
				type: "number",
				description: "Wait before yielding output. Non-empty writes default to 250 ms and cap at 30000 ms; empty polls wait 5000-300000 ms by default."
			},
			max_output_tokens: {
				type: "number",
				description: "Output token budget. Defaults to 10000 tokens; larger requests may be capped by policy."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					chunk_id: { type: "string" },
					wall_time_seconds: {
						type: "number",
						required: true
					},
					exit_code: { type: "number" },
					session_id: { type: "number" },
					original_token_count: { type: "number" },
					output: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: renderExecResult(value)
			}]
		},
		async execute(args, exec) {
			assertCapabilityEnabled(config.currentSettings, "terminalToolsEnabled", "write_stdin");
			return runWriteStdin(ctx, args, exec, config);
		}
	}));
}
function registerPatchTool(ctx, currentSettings) {
	ctx.tools.register(defineTool({
		name: "apply_patch",
		description: APPLY_PATCH_DESCRIPTION,
		parameters: { input: {
			type: "string",
			required: true,
			description: "The complete patch text."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { files: {
					type: "array",
					required: true,
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							path: {
								type: "string",
								required: true
							},
							operation: {
								type: "string",
								required: true,
								enum: [
									"created",
									"updated",
									"deleted",
									"moved"
								]
							},
							moveTo: { type: "string" }
						}
					}
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: patchSummary(value)
			}]
		},
		async execute(args, exec) {
			assertCapabilityEnabled(currentSettings, "patchToolEnabled", "apply_patch");
			const files = parsePatch(args.input);
			const policy = resolvePolicy(ctx, exec);
			const applied = [];
			for (const file of files) applied.push(await applyOnePatch(ctx, file, exec, policy));
			return { files: applied };
		},
		presentCall(args) {
			return {
				card: "generic",
				title: "Apply patch",
				kind: "edit",
				rawInput: args.input
			};
		}
	}));
}
function registerPlanTool(ctx, currentSettings) {
	ctx.tools.register(defineTool({
		name: "update_plan",
		description: UPDATE_PLAN_DESCRIPTION,
		parameters: {
			explanation: {
				type: "string",
				description: "Optional explanation for this plan update."
			},
			plan: {
				type: "array",
				required: true,
				description: "The list of steps",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						step: {
							type: "string",
							required: true,
							description: "Task step text."
						},
						status: {
							type: "string",
							required: true,
							enum: [...PLAN_STATUSES],
							description: "Step status."
						}
					}
				}
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {}
			},
			render: () => [{
				type: "text",
				text: "Plan updated"
			}]
		},
		execute(args, exec) {
			assertCapabilityEnabled(currentSettings, "planToolEnabled", "update_plan");
			const agent = exec.agent;
			if (agent === void 0) throw new Error("update_plan requires an owning agent session");
			agent.session.append("todo/write", { todos: planTodos(args) });
			return Promise.resolve({});
		}
	}));
}
/** Explicit preset instructions win without changing shared tools or permissions. */
function withPresetPrompt(settings, presetPrompt) {
	return presetPrompt === void 0 ? settings : {
		...settings,
		systemPrompt: presetPrompt
	};
}
/** Mount the Codex prompt/tool layer inside one fixed agent preset. */
function apply(ctx, config = {}) {
	installPresetEditor(ctx);
	const resolved = {
		globalEnhancements: config.globalEnhancements ?? true,
		codexCore: config.codexCore ?? true,
		defaultYieldTimeMs: config.defaultYieldTimeMs ?? 1e4,
		pollYieldTimeMs: config.pollYieldTimeMs ?? 5e3,
		writeYieldTimeMs: config.writeYieldTimeMs ?? 250,
		maxOutputBytes: config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
		hostedWebSearch: config.hostedWebSearch ?? true,
		remoteCompact: config.remoteCompact ?? true,
		systemPrompt: config.systemPrompt ?? DEFAULT_CODEX_SYSTEM_PROMPT,
		persona: config.persona ?? DEFAULT_CODEX_PERSONA,
		harnessSourcePrompt: config.harnessSourcePrompt ?? DEFAULT_DSH_CORE_SOURCE_PROMPT,
		webSurfacePrompt: config.webSurfacePrompt ?? DEFAULT_DSH_CORE_WEB_PROMPT
	};
	if (resolved.codexCore && ctx.fs.sandboxMode !== void 0 && ctx.get("sandboxPolicy") === void 0) throw new Error("codex: a sandboxing filesystem requires ctx.sandboxPolicy");
	const sharedSettings = installCodexSettings(ctx, resolved.systemPrompt, resolved.persona, resolved.harnessSourcePrompt, resolved.webSurfacePrompt);
	const codexSettings = { current: () => {
		return {
			...withPresetPrompt(sharedSettings.current(), config.presetPrompt),
			...config.promptEnabled === void 0 ? {} : { promptEnabled: config.promptEnabled },
			...config.terminalToolsEnabled === void 0 ? {} : { terminalToolsEnabled: config.terminalToolsEnabled },
			...config.patchToolEnabled === void 0 ? {} : { patchToolEnabled: config.patchToolEnabled },
			...config.planToolEnabled === void 0 ? {} : { planToolEnabled: config.planToolEnabled },
			...config.hostedWebSearchEnabled === void 0 ? {} : { hostedWebSearchEnabled: config.hostedWebSearchEnabled },
			...config.remoteCompactionEnabled === void 0 ? {} : { remoteCompactionEnabled: config.remoteCompactionEnabled }
		};
	} };
	const execConfig = {
		...resolved,
		currentSettings: codexSettings.current
	};
	if (resolved.globalEnhancements) {
		watchConfiguredGptModels(ctx);
		registerCodexActivityProjection(ctx);
		installCodexContextProjection(ctx, codexSettings.current);
		ctx.on("agent/request", async (_payload, next) => {
			return applyCodexRequestSettings(await next(), codexSettings.current());
		});
		if (typeof ctx.effect === "function") {
			const disposeHostedWebSearch = installHostedWebSearch();
			ctx.effect(() => disposeHostedWebSearch, "codex: Responses transport wrapper");
		}
		ctx.on("llm/stream", ((options, next) => {
			const settings = codexSettings.current();
			const contextWindow = options.contextWindow ?? settings.contextWindow;
			const compactionMode = codexCompactionMode();
			const legacySafeNext = () => repairLegacyPiAiContextOverflow(next(), options.model, contextWindow);
			if (options.purpose === "compaction" && isGptModel(options.model)) {
				if (compactionMode === "remote" || compactionMode !== "local" && resolved.remoteCompact && settings.remoteCompactionEnabled) return remoteCompactStream(ctx, options, legacySafeNext, {
					hostedWebSearch: resolved.hostedWebSearch && settings.hostedWebSearchEnabled,
					customApplyPatch: settings.patchToolEnabled
				});
				return legacySafeNext();
			}
			if (options.purpose === void 0 && isGptModel(options.model)) return repairLegacyPiAiContextOverflow(hostedWebSearchStream(next, {
				serviceTier: options.serviceTier,
				hostedWebSearch: resolved.hostedWebSearch && settings.hostedWebSearchEnabled,
				customApplyPatch: settings.patchToolEnabled
			}), options.model, contextWindow);
			return next();
		}));
	}
	if (resolved.codexCore) {
		ctx.on("system-prompt/assemble", async (_assembly, _context, next) => applyPromptSections(applyCodexCapabilitySettings(await next(), codexSettings.current()), config.presetSections ?? {}));
		ctx.systemPrompt.section({
			name: "codex:base",
			order: 10,
			text: () => codexSettings.current().promptEnabled ? resolveCodexSystemPrompt(codexSettings.current().systemPrompt) : ""
		});
		registerExecTools(ctx, execConfig);
		registerPatchTool(ctx, codexSettings.current);
		registerPlanTool(ctx, codexSettings.current);
	}
}
var types_default = {
	name,
	inject,
	Config,
	apply
};
//#endregion
export { CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA, Config, DEFAULT_CODEX_PERSONA, DEFAULT_CODEX_SYSTEM_PROMPT, DEFAULT_DSH_CORE_SOURCE_PROMPT, DEFAULT_DSH_CORE_WEB_PROMPT, apply, applyCodexCapabilitySettings, applyCodexRequestSettings, buildCodexSystemPrompt, types_default as default, enrichCodexModel, inject, name, normalizeCodexPromptAssembly, syncCodexContextWindow, withPresetPrompt };
