// Läuft als letztes Skript: alle Widgets sind angemeldet → jetzt erst bauen und Daten anfordern
window.OXPbereit = true;
if (window.OXPState?.config?.widgetOrder) renderWidgets();
window.dock.invoke("hello");
