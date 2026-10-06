export declare enum EStatus {
    executing = "Executing",
    executed = "Executed",
    execution_error = "Execution error"
}
export declare abstract class ProgressBarUIBase {
    rootId: string;
    rootElement: HTMLElement | null | undefined;
    protected htmlClassMonitor: string;
    protected constructor(rootId: string, rootElement: HTMLElement | null | undefined);
    abstract createDOM(): void;
}
