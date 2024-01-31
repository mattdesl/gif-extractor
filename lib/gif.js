import { parseGIF, decompressFrames } from "gifuct-js";

function roundByte(n) {
  return Math.max(0, Math.min(0xff, Math.round(n)));
}

function composite(rgb1, rgb2, alphaByte) {
  const alpha = Math.max(0, Math.min(1, alphaByte / 0xff));

  // Decompose the two colors into their red, green, and blue components
  const [r1, g1, b1] = rgb1;
  const [r2, g2, b2] = rgb2;

  // Perform the blending
  // background.rgba * (1.0 - alpha) + (foreground.rgba * alpha);
  let r = r1 * (1 - alpha) + r2 * alpha;
  let g = g1 * (1 - alpha) + g2 * alpha;
  let b = b1 * (1 - alpha) + b2 * alpha;

  // Combine the blended components back into a single color
  return [r, g, b].map((n) => roundByte(n));
}

export function* GIFExtractor(buf) {
  const gif = parseGIF(buf);
  const frames = decompressFrames(gif, true);

  let prevDisposalType;
  const channels = 4;
  const frameCount = frames.length;
  const maxDigits = Math.max(4, String(frameCount).length);

  const { width, height } = gif.lsd;

  const buffer = new Uint8Array(width * height * channels);
  for (let j = 0; j < width * height; j++) {
    buffer[j * 4 + 3] = 0xff;
  }

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (frame.dims.top !== 0 || frame.dims.left !== 0) {
      throw new Error("expected top and left to be 0");
    }

    if (frame.dims.width !== width || frame.dims.height !== height) {
      throw new Error("expected { width, height } to match across all frames");
    }

    if (i === 0 || prevDisposalType === 2) {
      buffer.fill(0x00);
    }

    prevDisposalType = frame.disposalType;

    for (let j = 0; j < width * height; j++) {
      const fgR = frame.patch[j * 4 + 0];
      const fgG = frame.patch[j * 4 + 1];
      const fgB = frame.patch[j * 4 + 2];
      const fgA = frame.patch[j * 4 + 3];

      const bgR = buffer[j * 4 + 0];
      const bgG = buffer[j * 4 + 1];
      const bgB = buffer[j * 4 + 2];

      const [r, g, b] = composite([bgR, bgG, bgB], [fgR, fgG, fgB], fgA);
      buffer[j * 4 + 0] = r;
      buffer[j * 4 + 1] = g;
      buffer[j * 4 + 2] = b;
      buffer[j * 4 + 3] = 0xff;
    }

    const frameName = String(i).padStart(maxDigits, "0") + ".png";
    yield {
      frameIndex: i,
      totalFrames: frameCount,
      name: frameName,
      data: buffer,
      channels: 4,
      width,
      height,
    };
  }
}
