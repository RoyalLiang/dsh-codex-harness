import { z } from 'zod';
declare const _default: {
    package: string;
    descriptors: {
        id: string;
        service: string;
        namespace: string;
        method: string;
        invocation: {
            kind: "direct";
        };
        parameters: {
            name: string;
            wire: string;
            source: "json";
            codec: {
                mode: "strict";
                typeSymbol: string;
                schema: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            };
        }[];
        result: {
            mode: "strict";
            typeSymbol: string;
            schema: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
        };
    }[];
};
export default _default;
//# sourceMappingURL=preset-editor-remote.d.ts.map