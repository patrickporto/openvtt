import * as v from 'valibot';
import { dynamicBus, MENU_ORDER, menu, type PluginContext } from '@openvtt/canvas';
import type { WindowsPlugin } from '@openvtt/canvas-plugin-window';
import { ImageEditor } from './editor';
import { defineImageEditorElements, OpenVTTImageEditor } from './ui/image-editor';
import type { ImageEditorSettings } from './composer';

const ICONS = {
  edit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c.5-2.5 1-4 2-5L16.5 4.5a2.1 2.1 0 0 1 3 3L9 18c-1 1-2.5 1.5-5 2Z"/><path d="m14.5 6.5 3 3"/></svg>`,
};

export interface ImageEditorPluginOptions {
  /**
   * Abre o editor com duplo clique em qualquer documento cujo tipo declare
   * `imageField` (default true). Sem acoplamento: a descoberta é pelo
   * metadado do tipo, não por plugins específicos.
   */
  openOnDoubleClick?: boolean;
  /** Defaults de composição aplicados a novos editores. */
  defaultSettings?: Partial<ImageEditorSettings>;
  /** Janela do editor maximizável (default true). */
  maximizable?: boolean;
}

/**
 * Image editor: edição de arte de placeables (crop, máscaras, anel) com API
 * headless (`createEditor`) para interfaces customizadas. A UI built-in
 * (`<openvtt-image-editor>`) abre numa janela gerenciada pelo plugin
 * `windows` (dependência dura): fechar, mover, minimizar, maximizar e
 * redimensionar vêm do frame da janela.
 *
 * Totalmente desacoplado dos plugins de documento: descobre alvos pelo
 * metadado `imageField` do `DocumentTypeDefinition` — qualquer plugin que
 * declare um campo de arte torna-se editável sem que este conheça o tipo.
 */
export class ImageEditorPlugin {
  readonly id = 'imageEditor';
  readonly name = 'Image Editor';
  readonly dependencies = ['windows'] as const;

  private ctx!: PluginContext;
  private readonly openOnDoubleClick: boolean;
  private readonly defaultSettings?: Partial<ImageEditorSettings>;
  private readonly maximizable: boolean;

  constructor(options: ImageEditorPluginOptions = {}) {
    this.openOnDoubleClick = options.openOnDoubleClick ?? true;
    this.defaultSettings = options.defaultSettings;
    this.maximizable = options.maximizable ?? true;
  }

  install(ctx: PluginContext): void {
    this.ctx = ctx;

    ctx.bus.registerEvent('imageEditor:opened', v.object({ type: v.string(), id: v.string() }));
    ctx.bus.registerEvent('imageEditor:applied', v.object({ type: v.string(), id: v.string() }));

    ctx.registerWindow({
      id: 'imageEditor',
      title: 'Token editor',
      width: 340,
      height: 560,
      minimizable: true,
      maximizable: this.maximizable,
      factory: () => {
        defineImageEditorElements();
        const panel = document.createElement('openvtt-image-editor') as OpenVTTImageEditor;
        panel.canvas = ctx.canvas;
        panel.addEventListener('image-edited', (event) => {
          const detail = (event as CustomEvent<{ type: string; id: string }>).detail;
          if (detail) this.notifyApplied(detail.type, detail.id);
        });
        return panel;
      },
    });

    if (this.openOnDoubleClick) {
      ctx.bus.tap('select:doubleclick', 'imageEditor', (payload) => {
        const hit = ctx.canvas.pick({ x: payload.x, y: payload.y });
        if (!hit || !ctx.canvas.documents.imageFieldOf(hit.objectType)) return;
        this.open(hit.objectType, hit.id);
        return { ...payload, handled: true };
      });
    }

    ctx.registerContextMenu({
      id: 'imageEditor:context',
      when: (c) => c.target.type === 'object' && Boolean(ctx.canvas.documents.imageFieldOf(c.target.object.objectType)),
      items: [
        menu.action('imageEditor:edit', 'Edit art...', {
          icon: ICONS.edit,
          order: MENU_ORDER.edit,
          onClick: (c) => {
            if (c.target.type === 'object') this.open(c.target.object.objectType, c.target.object.id);
          },
        }),
      ],
    });
  }

  /** Novo editor headless ligado a este canvas (para UI própria). */
  createEditor(): ImageEditor {
    return new ImageEditor({
      canvas: this.ctx.canvas,
      defaultSettings: this.defaultSettings,
    });
  }

  /**
   * Abre (ou foca) a janela do editor para o documento e carrega a arte
   * atual. Emite `imageEditor:opened`.
   */
  open(type: string, id: string): void {
    const windows = this.ctx.canvas.plugins.get<WindowsPlugin>('windows');
    if (!windows) return;
    const handle = windows.manager.open('imageEditor');
    const panel = handle?.content as OpenVTTImageEditor | null;
    if (panel) panel.edit(type, id);
    dynamicBus(this.ctx.bus).emit('imageEditor:opened', { type, id });
  }

  /** Notifica aplicação (usado pela UI built-in; UIs próprias podem chamar). */
  notifyApplied(type: string, id: string): void {
    dynamicBus(this.ctx.bus).emit('imageEditor:applied', { type, id });
  }
}

export const imageEditorPlugin = new ImageEditorPlugin();
