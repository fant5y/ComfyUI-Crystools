export enum EStatus {
  executing = 'Executing',
  executed = 'Executed',
  execution_error = 'Execution error',
}

export abstract class ProgressBarUIBase {
  protected htmlClassMonitor = 'crystools-monitors-container';

  protected constructor(
    public rootId: string,
    public rootElement: HTMLElement | null | undefined,
  ) {
    // IMPORTANT duplicate on crystools-save
    if (this.rootElement && this.rootElement.children.length === 0) {
      this.rootElement.setAttribute('id', this.rootId);
      this.rootElement.classList.add(this.htmlClassMonitor);
      this.rootElement.classList.add(this.constructor.name);
    } else {
      // it was created before
    }
  }

  abstract createDOM(): void;
}
