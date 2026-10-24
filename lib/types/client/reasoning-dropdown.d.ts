/** Independent Fast switch and reasoning effort menu for the composer. */
import type { CodexSettings } from '../settings.ts';
export interface ReasoningDropdownProps {
    useSettings: (selector: (state: unknown) => unknown) => {
        value?: CodexSettings;
        writable: boolean;
    };
    setSetting: (field: string, value: unknown) => Promise<void>;
    t: (key: any) => string;
}
export declare function ReasoningDropdown({ useSettings, setSetting, t }: ReasoningDropdownProps): import("react").JSX.Element | null;
//# sourceMappingURL=reasoning-dropdown.d.ts.map