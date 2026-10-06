import { app } from './comfy/index.js';

export const monitorRoot = document.createElement('div');
export const progressRoot = document.createElement('div');

const panel = document.createElement('div');
panel.classList.add('crystools-panel');
panel.append(monitorRoot, progressRoot);

// The action-bar API exposes buttons, but no render hook for live widgets.
// Use our registered button as an anchor without depending on ComfyUI's DOM.
const mountPanel = (): void => {
  const anchor = document.querySelector<HTMLElement>('.crystools-toolbar-anchor');
  if (anchor?.parentElement && panel.nextElementSibling !== anchor) {
    anchor.before(panel);
  }
};

app.registerExtension({
  name: 'Crystools.panel',
  actionBarButtons: [{
    icon: 'pi pi-chart-bar',
    tooltip: 'Crystools hardware monitors',
    class: 'crystools-toolbar-anchor',
    onClick(): void {},
  }],
  setup(): void {
    mountPanel();
    const observer = new MutationObserver(mountPanel);
    observer.observe(document.body, {childList: true, subtree: true});
  },
});
