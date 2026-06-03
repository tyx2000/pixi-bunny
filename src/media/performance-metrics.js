export function estimateRendererBackingBytes(targetApp) {
  const renderer = targetApp?.renderer;

  if (!renderer) {
    return 0;
  }

  const backingCanvas = renderer.canvas || targetApp.canvas;
  const width = Number(backingCanvas?.width || renderer.width || targetApp.screen?.width || 0);
  const height = Number(backingCanvas?.height || renderer.height || targetApp.screen?.height || 0);

  return Math.max(0, width * height * 4);
}

export function estimateTextureBytes(texture) {
  if (!texture || texture.destroyed) {
    return 0;
  }

  const source = texture.source || texture.baseTexture || {};
  const resolution = Number(source.resolution || texture.resolution) || 1;
  const width = Number(source.pixelWidth || source.realWidth || source.width || texture.width || 0);
  const height = Number(
    source.pixelHeight || source.realHeight || source.height || texture.height || 0
  );

  return Math.max(0, width * height * resolution * resolution * 4);
}
