const api = window.dock;
const $ = (id) => document.getElementById(id);

function anzeigen(s) {
  if (!s) return;
  // gleiches Aussehen wie das Dock
  if (s.look?.accent) document.documentElement.style.setProperty("--lila", s.look.accent);
  if (s.look?.barColor) document.documentElement.style.setProperty("--bar-farbe", s.look.barColor);
  $("grund").textContent = s.valid ? "" : s.text || "";
  if (s.valid) {
    $("grund").innerHTML = `<span id="ok">✓ ${s.text}</span>`;
  }
}
// automatisch Bindestriche setzen: DOCK-XXXX-XXXX-XXXX
$("key").addEventListener("input", () => {
  // Schlüssel säubern: alles außer Buchstaben/Ziffern weg, ein vorangestelltes „DOCK“ nur einmal – egal ob
  // getippt, mit Bindestrichen, Leerzeichen oder Zeilenumbruch eingefügt
  const roh = $("key").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if ("DOCK".startsWith(roh)) return; // „D“, „DO“, „DOC“ – noch am Tippen, nichts umbauen
  const ohne = (roh.startsWith("DOCK") ? roh.slice(4) : roh).slice(0, 12);
  $("key").value = ["DOCK", ohne.slice(0, 4), ohne.slice(4, 8), ohne.slice(8, 12)].filter((t, i) => i === 0 || t).join("-");
});
async function freischalten() {
  const key = $("key").value.trim();
  if (!/^DOCK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
    $("grund").textContent = "Bitte den vollständigen Schlüssel eingeben (DOCK-XXXX-XXXX-XXXX).";
    return;
  }
  $("los").disabled = true;
  $("los").textContent = "Prüfe …";
  const s = await api.invoke("lizenz-eingeben", key);
  $("los").disabled = false;
  $("los").textContent = "Freischalten";
  anzeigen(s);
}
$("los").onclick = freischalten;
$("key").onkeydown = (e) => e.key === "Enter" && freischalten();
$("neu").onclick = async () => anzeigen(await api.invoke("lizenz-pruefen"));
$("ende").onclick = () => api.invoke("quit");
api.invoke("lizenz-status").then(anzeigen);
setTimeout(() => $("key").focus(), 50);
