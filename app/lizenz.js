const api = window.dock;
const $ = (id) => document.getElementById(id);

function anzeigen(s) {
  if (!s) return;
  $("grund").textContent = s.valid ? "" : s.text || "";
  if (s.valid) {
    $("grund").innerHTML = `<span id="ok">✓ ${s.text}</span>`;
  }
}
// automatisch Bindestriche setzen: DOCK-XXXX-XXXX-XXXX
$("key").addEventListener("input", () => {
  const roh = $("key").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ohne = roh.startsWith("DOCK") ? roh.slice(4) : roh;
  const teile = ["DOCK", ohne.slice(0, 4), ohne.slice(4, 8), ohne.slice(8, 12)].filter((t, i) => i === 0 || t);
  $("key").value = roh ? teile.join("-") : "";
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
