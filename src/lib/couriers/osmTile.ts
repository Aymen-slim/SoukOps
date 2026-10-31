/** One OSM tile plus the pin's position inside it. Safe to import from client components. */
export function osmTilePin(lat: number, lng: number, zoom = 15): { url: string; leftPct: number; topPct: number } {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  const xt = Math.floor(x);
  const yt = Math.floor(y);
  return {
    url: `https://tile.openstreetmap.org/${zoom}/${xt}/${yt}.png`,
    leftPct: (x - xt) * 100,
    topPct: (y - yt) * 100,
  };
}
