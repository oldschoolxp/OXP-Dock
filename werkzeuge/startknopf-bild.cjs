// Bereitet ein Logo als Startknopf vor: weißen Rand entfernen (falls nicht schon transparent),
// auf den Inhalt zuschneiden, als 256er-PNG speichern.
// Aufruf: electron werkzeuge/startknopf-bild.cjs <quelle> <ziel.png>
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const [src, out] = process.argv.slice(-2);
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL("about:blank");
  const dataUrl = "data:image/webp;base64," + fs.readFileSync(src).toString("base64");
  const res = await w.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(dataUrl)}; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H); const p = d.data;
    const corner = [p[0], p[1], p[2], p[3]];
    if (corner[3] > 200) {
      // weißen Hintergrund von den Rändern aus wegfüllen
      const seen = new Uint8Array(W * H); const stack = [];
      for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
      for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
      while (stack.length) {
        const i = stack.pop(); if (seen[i]) continue; seen[i] = 1;
        const r = p[i*4], gg = p[i*4+1], b = p[i*4+2];
        const minc = Math.min(r, gg, b);
        if (minc < 200) continue;
        p[i*4+3] = minc > 245 ? 0 : Math.round(255 * (245 - minc) / 45);
        const x = i % W, y = (i / W) | 0;
        if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
      }
      g.putImageData(d, 0, 0);
    }
    // auf Inhalt zuschneiden
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p[(y*W+x)*4+3] > 20) { if (x<x0)x0=x; if (x>x1)x1=x; if (y<y0)y0=y; if (y>y1)y1=y; }
    const side = Math.max(x1 - x0, y1 - y0) + 1;
    const o = document.createElement('canvas'); o.width = o.height = 256;
    const og = o.getContext('2d'); og.imageSmoothingQuality = 'high';
    const s = 256 / side;
    og.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (256 - (x1 - x0 + 1) * s) / 2, (256 - (y1 - y0 + 1) * s) / 2, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
    return { corner, W, H, box: [x0, y0, x1, y1], png: o.toDataURL('image/png') };
  })()`);
  fs.writeFileSync(out, Buffer.from(res.png.split(",")[1], "base64"));
  console.log("Ecke", res.corner, "Größe", res.W, res.H, "Inhalt", res.box, "->", out);
  app.quit();
});
