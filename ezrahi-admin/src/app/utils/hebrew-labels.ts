import * as maplibregl from 'maplibre-gl';

/**
 * Show map labels in Hebrew. The Carto base style renders most labels from
 * `name_en` (English), but the vector tiles also carry `name:he` wherever
 * OpenStreetMap has a Hebrew name. After the style loads, every symbol layer
 * whose text comes from a name field is switched to Hebrew-first with a
 * fallback to the local `name`.
 *
 * "Noto Sans Regular" (already in the style's font stacks, and the only
 * hosted stack with full Hebrew glyph coverage) renders the Hebrew text;
 * it is appended to any stack missing it.
 */
export function applyHebrewLabels(map: maplibregl.Map): void {
  const style = map.getStyle();
  if (!style || !Array.isArray(style.layers)) return;
  const hebrewFirst = [
    'case',
    ['all', ['has', 'name:he'], ['!=', ['get', 'name:he'], '']],
    ['get', 'name:he'],
    ['get', 'name'],
  ] as unknown as maplibregl.ExpressionSpecification;
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    const layout = layer.layout as Record<string, unknown> | undefined;
    if (!layout || layout['text-field'] == null) continue;
    const current = JSON.stringify(layout['text-field']);
    // Only touch name-based labels (skip housenumbers, refs, etc.).
    if (!current.includes('name_en') && !current.includes('{name}')) continue;
    map.setLayoutProperty(layer.id, 'text-field', hebrewFirst);
    const fonts = layout['text-font'];
    if (Array.isArray(fonts) && !(fonts as unknown[]).includes('Noto Sans Regular')) {
      map.setLayoutProperty(layer.id, 'text-font', [...(fonts as string[]), 'Noto Sans Regular']);
    }
  }
}
