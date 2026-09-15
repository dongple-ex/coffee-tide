function clampPosition(position, area, width, height) {
  return {
    x: Math.round(Math.min(Math.max(position.x, area.x), area.x + Math.max(0, area.width - width))),
    y: Math.round(Math.min(Math.max(position.y, area.y), area.y + Math.max(0, area.height - height))),
  };
}
function validRegions(value, width, height) {
  if (!Array.isArray(value) || value.length > 32) return [];
  return value.filter((r) => r && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(r[k])) &&
    r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1);
}
function hitTest(point, bounds, regions) {
  return regions.some((r) => point.x >= bounds.x + r.x && point.x <= bounds.x + r.x + r.width &&
    point.y >= bounds.y + r.y && point.y <= bounds.y + r.y + r.height);
}
module.exports = { clampPosition, validRegions, hitTest };
