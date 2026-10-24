import { z } from 'zod';
/** Host-side Remote contract consumed by the browser's preset editor. */
export declare const TYPERT: {
    package: string;
    face: "host";
    schemas: never[];
    invocations: {
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
    model: {
        services: {
            description: string;
            summary: string;
            tags: never[];
            jsDoc: string;
            key: string;
            exportName: string;
            members: never[];
            types: never[];
        }[];
        events: never[];
        objects: never[];
    };
};
export default TYPERT;
//# sourceMappingURL=typert.host.d.ts.map