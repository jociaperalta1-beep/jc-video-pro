/* ============================================================
   JC VIDEO PRO — Música de iTunes (búsqueda y previews de 30 s)
   API pública de iTunes, sin claves ni servidores propios.
   ============================================================ */

import { importAudioBlob, addRemoteMedia } from "./media.js";

const SEARCH_API = "https://itunes.apple.com/search";

function slug(value = "pista") {
  return String(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "pista";
}

async function fetchWithTimeout(url, ms = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, mode: "cors" });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchITunes(term, limit = 12) {
  const query = String(term || "").trim();
  if (!query) return [];
  const url = `${SEARCH_API}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}&country=US`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`iTunes respondió ${res.status}`);
  const data = await res.json();
  return (data.results || [])
    .filter((item) => item.previewUrl && item.trackName)
    .map((item, index) => ({
      id: String(item.trackId || `track_${index}`),
      title: item.trackName,
      artist: item.artistName || "Artista desconocido",
      album: item.collectionName || "",
      previewUrl: item.previewUrl,
      artwork: item.artworkUrl100 || "",
      duration: 30,
      explicit: item.trackExplicitness === "explicit",
    }));
}

function trackName(track) {
  return `${track.title} — ${track.artist}`;
}

export async function addTrackToLibrary(track) {
  if (!track?.previewUrl) throw new Error("La pista no tiene preview disponible");
  const name = trackName(track);
  try {
    const res = await fetchWithTimeout(track.previewUrl, 35000);
    if (!res.ok) throw new Error(`Preview respondió ${res.status}`);
    const blob = await res.blob();
    if (blob.size < 1024) throw new Error("El preview llegó vacío");
    return await importAudioBlob(blob, {
      name,
      fileName: `${slug(name)}.m4a`,
      thumb: track.artwork,
      source: "iTunes",
      previewUrl: track.previewUrl,
    });
  } catch (err) {
    console.warn("[JCVP música] descarga del preview; se usará la URL remota", err);
    return addRemoteMedia({
      name,
      type: "audio",
      url: track.previewUrl,
      previewUrl: track.previewUrl,
      thumb: track.artwork,
      duration: track.duration || 30,
      source: "iTunes",
    });
  }
}

export async function downloadTrack(track) {
  if (!track?.previewUrl) throw new Error("La pista no tiene preview disponible");
  try {
    const res = await fetchWithTimeout(track.previewUrl, 35000);
    if (!res.ok) throw new Error(`Preview respondió ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(trackName(track))}.m4a`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch (err) {
    window.open(track.previewUrl, "_blank", "noopener,noreferrer");
    throw err;
  }
}
