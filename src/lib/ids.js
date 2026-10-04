import { SECTIONS, emptyPackage } from "./model";

/**
 * Turn submitted items into a package with stable ids.
 * An id is kept only if that section has used it before; anything else gets the
 * next unused number. Ids of removed items are never handed out again, so an old
 * citation can't end up pointing at a different item.
 */
export function assignIds(input, history) {
  const pkg = emptyPackage();
  for (const { key, prefix } of SECTIONS) {
    const known = new Set(
      history.flatMap((version) => version[key].map((i) => i.id)),
    );
    let next =
      Math.max(
        0,
        ...[...known].map((id) => Number(id.slice(prefix.length)) || 0),
      ) + 1;
    const used = new Set();
    for (const item of input[key] ?? []) {
      const text = item.text.trim();
      if (!text) continue;
      let id = item.id;
      if (!id || !known.has(id) || used.has(id)) id = `${prefix}${next++}`;
      used.add(id);
      pkg[key].push({ id, text });
    }
  }
  return pkg;
}
