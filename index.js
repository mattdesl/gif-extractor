import { parseGIF, decompressFrames } from "gifuct-js";
// import fetch from "node-fetch";
// import { globby } from "globby";
// import { readFile, writeFile } from "fs/promises";
import { encode } from "fast-png";
import { get, set } from "idb-keyval";

import { attachFileDrop } from "./lib/util";
// import { mkdirp } from "mkdirp";
// import * as path from "path";
// import { GifReader } from "omggif";
// var GifReader     = require('omggif').GifReader

// const argv = process.argv.slice(2);
// const paths = await globby(argv);

// for (let p of paths) {
//   const buf = await readFile(p);

//   const name = path.basename(file, path.extname(file));
//   const gifDir = path.dirname(file);
//   const outDir = path.resolve(gifDir, name);
//   await mkdirp(outDir);
//   // await extract(buf);
// }

function isFrameSequenceSupported() {
  return typeof window.showDirectoryPicker === "function";
}

const $ = document.querySelector.bind(document);
if (!isFrameSequenceSupported()) {
  $(".not-supported").style.display = "";
  $(".content").style.display = "none";
} else {
  setup();
}

async function verifyPermission(dirHandle, readWrite) {
  const options = {};
  if (readWrite) {
    options.mode = "readwrite";
  }
  // Check if permission was already granted. If so, return true.
  if ((await dirHandle.queryPermission(options)) === "granted") {
    return true;
  }
  // Request permission. If the user grants permission, return true.
  if ((await dirHandle.requestPermission(options)) === "granted") {
    return true;
  }
  // The user didn't grant permission, so return false.
  return false;
}

async function setup() {
  let dir;

  let gifFiles = [];
  const dropper = $(".dropper");
  const extractBtn = $(".extract");
  const status = $(".status");

  addPlaceholder();
  const oldDir = await get("dir");
  if (oldDir) {
    setDir(oldDir);
  }

  $(".outdir-select").onclick = (ev) => {
    ev.preventDefault();
    try {
      selectDir();
    } catch (err) {
      showError(err);
    }
  };
  extractBtn.onclick = async (ev) => {
    ev.preventDefault();
    const verified = await verifyPermission(oldDir, true);
    if (verified) {
      await extract();
    } else {
      showError("Only works if permission is granted.");
    }
  };
  const sizeSelect = $(".size-select");
  const sizeInputContainer = $(".size-input-container");
  const sizeInput = $(".size-input");
  let scaleMode = "none";
  sizeSelect.oninput = (ev) => {
    scaleMode = sizeSelect.options[sizeSelect.selectedIndex].value;
    sizeInputContainer.style.display = scaleMode === "none" ? "none" : "";
  };

  attachFileDrop({
    container: document.body,
    async onDrop(files) {
      gifFiles = files;

      clearElement(dropper);
      updateButtonState();

      if (gifFiles.length > 0) {
        for (let file of gifFiles) {
          const image = await readAsImage(file);
          dropper.appendChild(image);
        }
      } else {
        addPlaceholder();
      }
    },
  });

  function clearElement(el) {
    while (el.lastElementChild) {
      el.removeChild(el.lastElementChild);
    }
  }

  function addPlaceholder() {
    const span = document.createElement("span");
    span.classList.add("dropper-content");
    span.textContent = `Drag & Drop your GIF files onto this page.`;
    dropper.appendChild(span);
    return span;
  }

  async function readAsImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result;
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error(`could not load image file ${file.name}`));
        image.crossOrigin = "Anonymous";
        image.src = data;
      };
      reader.onerror = () =>
        reject(new Error(`could not read file ${file.name}`));
      reader.readAsDataURL(file);
    });
  }
  async function readAsBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result;
        resolve(data);
      };
      reader.onerror = () =>
        reject(new Error(`could not read file ${file.name}`));
      reader.readAsArrayBuffer(file);
    });
  }

  function resize(rgba, srcWidth, srcHeight, dstWidth, dstHeight) {
    // Create a new Uint8Array to hold the resized image data
    const out = new Uint8ClampedArray(dstWidth * dstHeight * 4);

    // Calculate the ratio of the old width/height to the new width/height
    const xRatio = srcWidth / dstWidth;
    const yRatio = srcHeight / dstHeight;

    for (let dstY = 0; dstY < dstHeight; dstY++) {
      for (let dstX = 0; dstX < dstWidth; dstX++) {
        // Find the nearest neighbor in the source image
        const srcX = Math.min(Math.round(dstX * xRatio), srcWidth - 1);
        const srcY = Math.min(Math.round(dstY * yRatio), srcHeight - 1);

        // Calculate the index in the one-dimensional image arrays
        const srcIndex = (srcY * srcWidth + srcX) * 4;
        const dstIndex = (dstY * dstWidth + dstX) * 4;

        // Copy the pixel data from the source to the destination
        for (let i = 0; i < 4; i++) {
          // RGBA has 4 components
          out[dstIndex + i] = rgba[srcIndex + i];
        }
      }
    }

    return out;
  }

  async function extract() {
    for (let file of gifFiles) {
      const buf = await readAsBuffer(file);
      const dirOutName = file.name.replace(/\.(gif)$/i, "");
      const outDir = await dir.getDirectoryHandle(dirOutName, { create: true });
      for (let frame of GIFExtractor(buf)) {
        const { data, width, height, channels, name, frameIndex, totalFrames } =
          frame;
        status.textContent = `Extracting ${dirOutName}: ${
          frameIndex + 1
        } / ${totalFrames}`;

        const aspect = width / height;
        let newWidth = width,
          newHeight = height;
        if (scaleMode === "width") {
          newWidth = parseInt(sizeInput.value, 10) || width;
          newHeight = Math.floor(newWidth / aspect);
        } else if (scaleMode === "height") {
          newHeight = parseInt(sizeInput.value, 10) || height;
          newWidth = Math.floor(newHeight * aspect);
        }

        const resizedData =
          newWidth == width && newHeight == height
            ? data
            : resize(data, width, height, newWidth, newHeight);
        const enc = encode({
          data: resizedData,
          width: newWidth,
          height: newHeight,
          channels,
          depth: 8,
        });
        const fh = await outDir.getFileHandle(name, { create: true });
        const fw = await fh.createWritable();
        fw.write(enc);
        fw.close();
      }
    }
    status.textContent = `Done. Check your output folder!`;
  }

  function showError(error) {
    if (typeof error !== "string") error = error.message || "unknown error";
    const errStr = `Error: ${error}`;
    alert(errStr);
  }

  function updateButtonState() {
    if (dir && gifFiles.length > 0) {
      extractBtn.removeAttribute("disabled");
    }
  }

  async function selectDir() {
    try {
      dir = await window.showDirectoryPicker({
        mode: "readwrite",
        // startIn: "downloads",
      });
      setDir(dir);
    } catch (err) {
      if (err.code === 20 || err.name === "AbortError") {
        // don't warn on abort
        return null;
      } else {
        throw err;
      }
    }
  }

  async function setDir(dirHandle) {
    dir = dirHandle;
    if (!dir || dir.kind !== "directory") throw new Error("expected directory");
    $(".outdir-name").textContent = dir.name;
    await set("dir", dir);
    updateButtonState();
  }
}

// let fileHandle;
// butOpenFile.addEventListener("click", async () => {
//   // Destructure the one-element array.
//   [fileHandle] = await window.showOpenFilePicker();
//   // Do something with the file handle.
// });

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

function* GIFExtractor(buf) {
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

    // const bg = frame.colorTable[frame.transparentIndex];

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
    // await writeFile(path.resolve(outDir, frameName), enc);
  }
}

// async function extract(buf) {
//   const gif = parseGIF(buf);
//   const frames = decompressFrames(gif, true);

//   let prevDisposalType;
//   const channels = 4;
//   const maxDigits = 4;

//   const { width, height } = gif.lsd;

//   const buffer = new Uint8Array(width * height * channels);
//   for (let j = 0; j < width * height; j++) {
//     buffer[j * 4 + 3] = 0xff;
//   }

//   for (let i = 0; i < frames.length; i++) {
//     const frame = frames[i];
//     if (frame.dims.top !== 0 || frame.dims.left !== 0) {
//       throw new Error("expected top and left to be 0");
//     }

//     if (frame.dims.width !== width || frame.dims.height !== height) {
//       throw new Error("expected { width, height } to match across all frames");
//     }

//     if (i === 0 || prevDisposalType === 2) {
//       buffer.fill(0x00);
//     }

//     prevDisposalType = frame.disposalType;

//     // const bg = frame.colorTable[frame.transparentIndex];

//     for (let j = 0; j < width * height; j++) {
//       const fgR = frame.patch[j * 4 + 0];
//       const fgG = frame.patch[j * 4 + 1];
//       const fgB = frame.patch[j * 4 + 2];
//       const fgA = frame.patch[j * 4 + 3];

//       const bgR = buffer[j * 4 + 0];
//       const bgG = buffer[j * 4 + 1];
//       const bgB = buffer[j * 4 + 2];

//       const [r, g, b] = composite([bgR, bgG, bgB], [fgR, fgG, fgB], fgA);
//       buffer[j * 4 + 0] = r;
//       buffer[j * 4 + 1] = g;
//       buffer[j * 4 + 2] = b;
//       buffer[j * 4 + 3] = 0xff;
//     }

//     const enc = encode({
//       data: buffer,
//       width,
//       height,
//       channels: 4,
//       depth: 8,
//     });

//     const frameName = String(i).padStart(maxDigits, "0") + ".png";
//     await writeFile(path.resolve(outDir, frameName), enc);
//   }
// }

// function* decodeGIF(data) {
//   const reader = new GifReader(data);
//   const nFrames = reader.numFrames();
//   const { width, height } = reader;
//   for (let i = 0; i < nFrames; i++) {
//     const channels = 4;
//     const data = new Uint8ClampedArray(channels * width * height);
//     reader.decodeAndBlitFrameRGBA(i, data);
//     yield {
//       frame: i,
//       totalFrames: nFrames,
//       width,
//       height,
//       data,
//     };
//   }
// }

// function handleGif(data, cb) {
//   var reader;
//   try {
//     reader = new GifReader(data);
//   } catch (err) {
//     cb(err);
//     return;
//   }
//   if (reader.numFrames() > 0) {
//     var nshape = [reader.numFrames(), reader.height, reader.width, 4];
//     var ndata = new Uint8Array(nshape[0] * nshape[1] * nshape[2] * nshape[3]);
//     var result = ndarray(ndata, nshape);
//     try {
//       for (var i = 0; i < reader.numFrames(); ++i) {
//         reader.decodeAndBlitFrameRGBA(
//           i,
//           ndata.subarray(result.index(i, 0, 0, 0), result.index(i + 1, 0, 0, 0))
//         );
//       }
//     } catch (err) {
//       cb(err);
//       return;
//     }
//     cb(null, result.transpose(0, 2, 1));
//   } else {
//     var nshape = [reader.height, reader.width, 4];
//     var ndata = new Uint8Array(nshape[0] * nshape[1] * nshape[2]);
//     var result = ndarray(ndata, nshape);
//     try {
//       reader.decodeAndBlitFrameRGBA(0, ndata);
//     } catch (err) {
//       cb(err);
//       return;
//     }
//     cb(null, result.transpose(1, 0));
//   }
// }
