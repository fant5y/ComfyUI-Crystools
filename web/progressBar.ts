import { app, api } from './comfy/index.js';
import { commonPrefix } from './common.js';
import { ProgressBarUI } from './progressBarUI.js';
import { EStatus } from './progressBarUIBase.js';
import { progressRoot } from './panel.js';

class CrystoolsProgressBar {
  idExtensionName = 'Crystools.progressBar';
  idShowProgressBar = 'Crystools.ProgressBar';
  defaultShowStatus = true;
  menuPrefix = commonPrefix;

  currentStatus = EStatus.executed;
  currentProgress = 0;
  currentNode?: string | number = undefined;
  timeStart = 0;

  progressBarUI: ProgressBarUI;

  // not on setup because this affect the order on settings, I prefer to options at first
  createSettings = (): void => {
    app.registerExtension({
      name: 'Crystools.ProgressBarSettings',
      settings: [{
      id: this.idShowProgressBar,
      name: 'Show progress bar',
      category: ['Crystools', this.menuPrefix + ' Progress Bar', 'Show'],
      tooltip: 'Show execution progress below the hardware monitors',
      type: 'boolean',
      defaultValue: this.defaultShowStatus,
      onChange: this.progressBarUI.showProgressBar,
      }],
    });
  };

  updateDisplay = (): void => {
    this.progressBarUI.updateDisplay(this.currentStatus, this.timeStart, this.currentProgress);
  };

  // automatically called by ComfyUI
  setup = (): void => {
    if (this.progressBarUI) {
      this.progressBarUI
      .showProgressBar(app.extensionManager.setting.get(this.idShowProgressBar));
      return;
    }

    this.progressBarUI = new ProgressBarUI(
      progressRoot,
      true,
      this.centerNode,
    );

    this.createSettings();
    this.updateDisplay();
    this.registerListeners();
  };

  registerListeners = (): void => {
    api.addEventListener('status', ({detail}: any) => {
      this.currentStatus = this.currentStatus === EStatus.execution_error ? EStatus.execution_error : EStatus.executed;
      const queueRemaining = detail?.exec_info?.queue_remaining;

      if (queueRemaining) {
        this.currentStatus = EStatus.executing;
      }
      this.updateDisplay();
    }, false);

    api.addEventListener('progress', ({detail}: any) => {
      const {value, max, node} = detail;
      const progress = Math.floor((value / max) * 100);

      if (!isNaN(progress) && progress >= 0 && progress <= 100) {
        this.currentProgress = progress;
        this.currentNode = node;
      }

      this.updateDisplay();
    }, false);

    api.addEventListener('executing', ({detail}: any) => {
      if (detail === null) {
        if (this.currentStatus !== EStatus.execution_error) {
          this.currentStatus = EStatus.executed;
        }
      } else {
        this.currentNode = detail;
      }
      this.updateDisplay();
    }, false);

    api.addEventListener('executed', ({detail}: any) => {
      if (detail?.node) {
        this.currentNode = detail.node;
      }

      this.updateDisplay();
    }, false);

    api.addEventListener('execution_start', ({_detail}: any) => {
      this.currentStatus = EStatus.executing;
      this.timeStart = Date.now();

      this.updateDisplay();
    }, false);

    api.addEventListener('execution_error', ({_detail}: any) => {
      this.currentStatus = EStatus.execution_error;

      this.updateDisplay();
    }, false);
  };

  centerNode = (): void => {
    const id = this.currentNode;
    if (!id) {
      return;
    }
    const node = app.rootGraph.getNodeById(id);
    if (!node) {
      return;
    }
    app.canvas.centerOnNode(node);
  };
}

const crystoolsProgressBar = new CrystoolsProgressBar();
app.registerExtension({
  name: crystoolsProgressBar.idExtensionName,
  setup: crystoolsProgressBar.setup,
});
