export function parsePromptCard(text) {
    if (text.length > 1_100_000)
        throw new Error('invalid-prompt-card');
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object')
        throw new Error('invalid-prompt-card');
    const card = value;
    if (card.format !== 'codex-harness/prompt-card' || card.version !== 1
        || typeof card.name !== 'string' || !card.name.trim() || card.name.length > 200
        || typeof card.description !== 'string' || card.description.length > 4000
        || typeof card.systemPrompt !== 'string' || card.systemPrompt.length > 1_000_000
        || typeof card.inheritPrompt !== 'boolean')
        throw new Error('invalid-prompt-card');
    return { format: card.format, version: 1, name: card.name, description: card.description,
        systemPrompt: card.systemPrompt, inheritPrompt: card.inheritPrompt };
}
export function exportPromptCard(fields) {
    return JSON.stringify({ format: 'codex-harness/prompt-card', version: 1,
        name: fields.name, description: fields.description, systemPrompt: fields.systemPrompt,
        inheritPrompt: fields.inheritPrompt }, null, 2);
}
//# sourceMappingURL=preset-contract.js.map