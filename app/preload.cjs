const { contextBridge, ipcRenderer, webUtils } = require("electron");

const allowedInvoke = new Set([
  "hello", "np-quelle", "bar-menu", "bar-rect", "preview-rects", "start-menu", "start-menu-context", "keys", "media", "click-group", "group-menu", "launch-new", "open-url",
  "live-menu", "stream-menu", "dropped-files", "reorder-pin", "popup-size", "popup-close", "preview-show", "preview-hide", "preview-activate", "preview-close-window", "widget-popup", "widget-action", "widget-popup-refresh", "shelf-drag",
  "settings-load", "update-check", "lizenz-status", "lizenz-pruefen", "lizenz-eingeben", "settings-save", "settings-move-pin", "settings-remove-pin", "settings-add-pin", "settings-import-windows-pins", "quit",
]);
const allowedOn = new Set(["windows", "pins", "widget", "config", "settings-state", "update-status", "lizenz-status", "mouse-left-bar", "popup-view", "preview-closed", "icons"]);

contextBridge.exposeInMainWorld("dock", {
  invoke: (ch, arg) => (allowedInvoke.has(ch) ? ipcRenderer.invoke(ch, arg) : Promise.reject(new Error("nicht erlaubt"))),
  on: (ch, cb) => {
    if (allowedOn.has(ch)) ipcRenderer.on(ch, (_e, payload) => cb(payload));
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
});
