export async function markSitemapDirty(event = {}, storage) {
  if (!storage?.read || !storage?.write) throw new Error("Sitemap state storage is required");
  const path = "data/seo/sitemap-state.json";
  const previous = await storage.read(path, {});
  const now = new Date().toISOString();
  const recentEvents = Array.isArray(previous?.recentEvents) ? previous.recentEvents : [];
  const state = {
    ...previous,
    dirty: true,
    lastMutationAt: now,
    lastMutation: {
      source: String(event.source || "content"),
      action: String(event.action || "updated"),
      objectId: String(event.objectId || ""),
      url: String(event.url || ""),
      at: now
    },
    recentEvents: [
      {
        source: String(event.source || "content"),
        action: String(event.action || "updated"),
        objectId: String(event.objectId || ""),
        url: String(event.url || ""),
        at: now
      },
      ...recentEvents
    ].slice(0, 50)
  };
  await storage.write(path, state);
  return state;
}
