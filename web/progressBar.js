import { app, api } from './comfy/index.js';
import { commonPrefix } from './common.js';
import { ProgressBarUI } from './progressBarUI.js';
import { EStatus } from './progressBarUIBase.js';
import { progressRoot } from './panel.js';
class CrystoolsProgressBar {
    constructor() {
        Object.defineProperty(this, "idExtensionName", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Crystools.progressBar'
        });
        Object.defineProperty(this, "idShowProgressBar", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Crystools.ProgressBar'
        });
        Object.defineProperty(this, "defaultShowStatus", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "menuPrefix", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: commonPrefix
        });
        Object.defineProperty(this, "currentStatus", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: EStatus.executed
        });
        Object.defineProperty(this, "currentProgress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "currentNode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined
        });
        Object.defineProperty(this, "timeStart", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "progressBarUI", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "createSettings", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                app.registerExtension({
                    name: 'Crystools.ProgressBarSettings',
                    settings: [{
                            id: this.idShowProgressBar,
                            name: 'Show progress bar',
                            category: ['Crystools', this.menuPrefix + ' Progress Bar', 'Show'],
                            tooltip: 'Show execution progress in the Crystools sidebar',
                            type: 'boolean',
                            defaultValue: this.defaultShowStatus,
                            onChange: this.progressBarUI.showProgressBar,
                        }],
                });
            }
        });
        Object.defineProperty(this, "updateDisplay", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                this.progressBarUI.updateDisplay(this.currentStatus, this.timeStart, this.currentProgress);
            }
        });
        Object.defineProperty(this, "setup", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (this.progressBarUI) {
                    this.progressBarUI
                        .showProgressBar(app.extensionManager.setting.get(this.idShowProgressBar));
                    return;
                }
                this.progressBarUI = new ProgressBarUI(progressRoot, true, this.centerNode);
                this.createSettings();
                this.updateDisplay();
                this.registerListeners();
            }
        });
        Object.defineProperty(this, "registerListeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                api.addEventListener('status', ({ detail }) => {
                    this.currentStatus = this.currentStatus === EStatus.execution_error ? EStatus.execution_error : EStatus.executed;
                    const queueRemaining = detail?.exec_info?.queue_remaining;
                    if (queueRemaining) {
                        this.currentStatus = EStatus.executing;
                    }
                    this.updateDisplay();
                }, false);
                api.addEventListener('progress', ({ detail }) => {
                    const { value, max, node } = detail;
                    const progress = Math.floor((value / max) * 100);
                    if (!isNaN(progress) && progress >= 0 && progress <= 100) {
                        this.currentProgress = progress;
                        this.currentNode = node;
                    }
                    this.updateDisplay();
                }, false);
                api.addEventListener('executing', ({ detail }) => {
                    if (detail === null) {
                        if (this.currentStatus !== EStatus.execution_error) {
                            this.currentStatus = EStatus.executed;
                        }
                    }
                    else {
                        this.currentNode = detail;
                    }
                    this.updateDisplay();
                }, false);
                api.addEventListener('executed', ({ detail }) => {
                    if (detail?.node) {
                        this.currentNode = detail.node;
                    }
                    this.updateDisplay();
                }, false);
                api.addEventListener('execution_start', ({ _detail }) => {
                    this.currentStatus = EStatus.executing;
                    this.timeStart = Date.now();
                    this.updateDisplay();
                }, false);
                api.addEventListener('execution_error', ({ _detail }) => {
                    this.currentStatus = EStatus.execution_error;
                    this.updateDisplay();
                }, false);
            }
        });
        Object.defineProperty(this, "centerNode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                const id = this.currentNode;
                if (!id) {
                    return;
                }
                const node = app.rootGraph.getNodeById(id);
                if (!node) {
                    return;
                }
                app.canvas.centerOnNode(node);
            }
        });
    }
}
const crystoolsProgressBar = new CrystoolsProgressBar();
app.registerExtension({
    name: crystoolsProgressBar.idExtensionName,
    setup: crystoolsProgressBar.setup,
});
