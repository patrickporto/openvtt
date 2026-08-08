/**
 * Generates a tangent-space normal map from a height (grayscale) canvas
 * using the Sobel operator.
 */
export function heightCanvasToNormalCanvas(
  source: HTMLCanvasElement,
  strength = 2
): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  const srcCtx = source.getContext('2d');
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!srcCtx || !outCtx || width === 0 || height === 0) return out;

  const srcData = srcCtx.getImageData(0, 0, width, height).data;
  const outImage = outCtx.createImageData(width, height);
  const outData = outImage.data;

  const heightAt = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    return (srcData[i] + srcData[i + 1] + srcData[i + 2]) / (3 * 255);
  };

  for (let y = 0; y < height; y++) {
    const ym = (y - 1 + height) % height;
    const yp = (y + 1) % height;
    for (let x = 0; x < width; x++) {
      const xm = (x - 1 + width) % width;
      const xp = (x + 1) % width;

      const tl = heightAt(xm, ym), t = heightAt(x, ym), tr = heightAt(xp, ym);
      const l = heightAt(xm, y), r = heightAt(xp, y);
      const bl = heightAt(xm, yp), b = heightAt(x, yp), br = heightAt(xp, yp);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const i = (y * width + x) * 4;
      outData[i] = Math.round((nx * 0.5 + 0.5) * 255);
      outData[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      outData[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      outData[i + 3] = 255;
    }
  }

  outCtx.putImageData(outImage, 0, 0);
  return out;
}
