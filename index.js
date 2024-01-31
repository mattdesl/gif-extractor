import { encode } from "fast-png";
import { get, set } from "idb-keyval";
import { GIFExtractor } from "./lib/gif";
import {
  isFileSystemAPISupported,
  attachFileDrop,
  verifyPermission,
} from "./lib/util";

const $ = document.querySelector.bind(document);
if (!isFileSystemAPISupported()) {
  $(".not-supported").style.display = "";
  $(".content").style.display = "none";
} else {
  setup();
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
    if (!dir) return showError("Need to select a directory first");
    const verified = await verifyPermission(dir, true);
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

  async function extract() {
    status.textContent = "Reading...";
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
