/**
 * DSH Client: Reasoning Effort & Fast Mode Dropdown Popup Menu
 *
 * Provides a dropdown popup menu in the DSH conversation input area,
 * allowing users to switch reasoning effort (Low, Med, High, X-High, Max),
 * toggle Fast mode, and view current configuration.
 */
import type { CodexSettings } from '../settings.ts';
export interface ReasoningDropdownProps {
    useSettings: (selector: (state: unknown) => unknown) => {
        value?: CodexSettings;
        writable: boolean;
    };
    setSetting: (field: string, value: unknown) => Promise<void>;
    t: (key: any) => string;
    /** Supplied by the host; absence does not imply capability support. */
    capabilityNotice?: string;
}
export declare function ReasoningDropdown({ useSettings, setSetting, t, capabilityNotice }: ReasoningDropdownProps): import("react").JSX.Element | null;
//# sourceMappingURL=reasoning-dropdown.d.ts.map