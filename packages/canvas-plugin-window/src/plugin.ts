import type { PluginContext, WindowContribution, WindowRegistrar } from '@openvtt/canvas';
import { WindowManager } from './manager';
import { WINDOW_EVENT_SCHEMAS } from './state';

/**
 * Window manager para `@openvtt/canvas`: janelas flutuantes/modais com
 * fechar, mover, minimizar (taskbar), maximizar, redimensionar, docking por
 * borda, snapping e persistência. Plugins declaram janelas com
 * `ctx.registerWindow({ id, title, factory, ... })` e o host integra via
 * `windows.manager` (create/open/serialize/restore/...).
 */
export class WindowsPlugin implements WindowRegistrar {
  readonly id = 'windows';
  readonly name = 'Windows';

  manager!: WindowManager;

  install(ctx: PluginContext): void {
    this.manager = new WindowManager({ bus: ctx.bus, host: ctx.canvas.host });
    for (const [name, schema] of Object.entries(WINDOW_EVENT_SCHEMAS)) {
      ctx.bus.registerEvent(name, schema);
    }
    ctx.onDispose(() => this.manager.destroy());
  }

  uninstall(): void {
    this.manager.destroy();
  }

  registerWindow(contribution: WindowContribution, owner: PluginContext): void {
    this.manager.register({ ...contribution }, owner);
  }

  unregisterWindow(definitionId: string): void {
    this.manager.unregister(definitionId);
  }
}

export const windowsPlugin = new WindowsPlugin();
