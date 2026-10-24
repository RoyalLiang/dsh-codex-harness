export class ModelGateway {
    static resolve(metadata, api) {
        return {
            known: metadata !== undefined,
            supportedEfforts: metadata?.reasoning?.efforts.map(effort => effort.id) ?? [],
            supportsResponses: api === 'openai-responses' || api === 'openai-codex-responses',
        };
    }
}
//# sourceMappingURL=gateway.js.map