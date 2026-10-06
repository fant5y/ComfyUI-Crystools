import { app } from './comfy/index.js';
export const monitorRoot = document.createElement('div');
export const progressRoot = document.createElement('div');
const panel = document.createElement('div');
panel.classList.add('crystools-panel');
panel.append(progressRoot, monitorRoot);
app.registerExtension({
    name: 'Crystools.panel',
    setup() {
        app.extensionManager.registerSidebarTab({
            id: 'crystools',
            title: 'Crystools',
            icon: 'pi pi-chart-bar',
            type: 'custom',
            render(container) {
                container.append(panel);
            },
        });
    },
});
