// Testfenster für die Dock-Tests: node/electron testfenster.cjs <titel> <bildschirm-nr (von links, ab 0)> <max|normal|voll>
// Öffnet ein einfaches Chromium-Fenster (wie Chrome, Discord, Claude …) auf dem gewünschten Bildschirm.
const { app, BrowserWindow, screen } = require("electron");
const [titel, nr, modus] = process.argv.slice(process.argv.findIndex((a) => a.endsWith("testfenster.cjs")) + 1);
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const anzeigen = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x);
  const d = anzeigen[Number(nr) || 0] || anzeigen[0];
  const w = new BrowserWindow({
    x: d.workArea.x + 60,
    y: d.workArea.y + 60,
    width: Math.round(d.workArea.width * 0.5),
    height: Math.round(d.workArea.height * 0.5),
    title: titel,
    show: false,
    backgroundColor: "#203040",
  });
  w.loadURL("data:text/html,<title>" + encodeURIComponent(titel) + "</title><body style='margin:0;background:linear-gradient(#245,#a42)'>");
  w.once("ready-to-show", () => {
    w.show();
    if (modus === "max") w.maximize();
    if (modus === "voll") w.setBounds(d.workArea);
    if (modus === "fs") w.setFullScreen(true);
  });
  w.setTitle(titel);
  w.webContents.on("page-title-updated", (e) => e.preventDefault());
});
app.on("window-all-closed", () => app.quit());
