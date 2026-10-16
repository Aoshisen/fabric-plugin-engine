import type { Canvas } from "fabric";
import type { EditorSerializer, PluginHost } from "../contracts";

export class Serializer implements EditorSerializer {
  private readonly canvas: Canvas;
  private readonly plugins: PluginHost;

  constructor(canvas: Canvas, plugins: PluginHost) {
    this.canvas = canvas;
    this.plugins = plugins;
  }

  exportJSON(): string {
    let json = JSON.stringify(this.canvas.toJSON());
    for (const plugin of this.plugins.hookPlugins) {
      if (plugin.hookExportBefore) json = plugin.hookExportBefore(json);
    }
    return json;
  }

  async loadJSON(json: string): Promise<void> {
    let data = json;
    for (const plugin of this.plugins.hookPlugins) {
      if (plugin.hookImportBefore) data = await plugin.hookImportBefore(data);
    }

    await this.canvas.loadFromJSON(JSON.parse(data) as Record<string, unknown>);
    this.canvas.requestRenderAll();

    for (const plugin of this.plugins.hookPlugins) {
      plugin.hookImportAfter?.();
    }
  }
}
