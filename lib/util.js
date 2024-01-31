export function isFileSystemAPISupported() {
  return typeof window.showDirectoryPicker === "function";
}

export function attachFileDrop({ container = window, onDrop }) {
  async function handlerFunction(ev) {
    ev.preventDefault();
    if (ev.type === "drop") {
      let dt = ev.dataTransfer;
      let files = dt.files;
      if (!files.length) return;
      onDrop(files);
    }
  }

  container.addEventListener("dragenter", handlerFunction, false);
  container.addEventListener("dragleave", handlerFunction, false);
  container.addEventListener("dragover", handlerFunction, false);
  container.addEventListener("drop", handlerFunction, false);
  return () => {
    container.removeEventListener("dragenter", handlerFunction, false);
    container.removeEventListener("dragleave", handlerFunction, false);
    container.removeEventListener("dragover", handlerFunction, false);
    container.removeEventListener("drop", handlerFunction, false);
  };
}

export async function verifyPermission(dirHandle, readWrite) {
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
