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
