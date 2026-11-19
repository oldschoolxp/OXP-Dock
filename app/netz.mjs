// Internet-Abfragen des Hauptprozesses über den Netzwerkweg von Chromium (net.fetch):
// nutzt wie der Browser den Proxy und die Zertifikate von Windows – wichtig in Firmennetzen,
// in denen das eingebaute fetch von Node mit „fetch failed“ scheitert. Notfalls doch Node-fetch.
import { net } from "electron";

const KEINE_VERBINDUNG = "Keine Verbindung – neuer Versuch in 1 Min.";

export async function holen(url, opt = {}) {
  try {
    return await net.fetch(url, opt);
  } catch (e) {
    if (opt.signal?.aborted) throw new Error("Zeitüberschreitung – neuer Versuch in 1 Min.");
    try {
      return await globalThis.fetch(url, opt);
    } catch {
      throw new Error(KEINE_VERBINDUNG);
    }
  }
}
