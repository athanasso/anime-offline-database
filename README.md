# Anime Offline Database

[![License: ODbL-1.0](https://img.shields.io/badge/License-ODbL--1.0-orange.svg)](https://opendatacommons.org/licenses/odbl/1-0/)
[![Automated Weekly Build](https://github.com/athanasso/anime-offline-database/actions/workflows/update-database.yml/badge.svg)](https://github.com/athanasso/anime-offline-database/actions/workflows/update-database.yml)
[![Latest Release](https://img.shields.io/github/v/release/athanasso/anime-offline-database?label=latest%20release&color=blue)](https://github.com/athanasso/anime-offline-database/releases/latest)

An automated, open-source dataset containing anime metadata cross-referenced across major anime platforms: **MyAnimeList**, **AniList**, **Kitsu**, **AniDB**, **Anime-Planet**, **AniSearch**, and **LiveChart**.

This repository is an **automated, drop-in replacement** for the original `manami-project/anime-offline-database` (archived July 2026).

---

## 📥 Download Dataset

Always available from the **[Latest GitHub Release](https://github.com/athanasso/anime-offline-database/releases/latest)**:

| File | Format | Description |
|---|---|---|
| **[`anime-offline-database-minified.json`](https://github.com/athanasso/anime-offline-database/releases/latest/download/anime-offline-database-minified.json)** | Minified JSON | Single-line compact JSON, recommended for apps and services. |
| **[`anime-offline-database.json`](https://github.com/athanasso/anime-offline-database/releases/latest/download/anime-offline-database.json)** | Indented JSON | Full human-readable JSON formatted with 2 spaces. |

---

## 🔄 How it Works

1. **Deterministic Cross-References**: Leverages [Fribb/anime-lists](https://github.com/Fribb/anime-lists) (maintained with 39,000+ entries across 12 platforms) to link IDs without fuzzy matching errors.
2. **Automated Weekly Builds**: Runs automatically every Sunday via GitHub Actions.
3. **Auto-Enrichment**: Brand new anime are automatically enriched via public APIs (Jikan, Kitsu) for titles, synonyms, episode counts, status, seasons, studios, and high-res cover art.
4. **Zero Manual Bottlenecks**: 100% automated and open source.

---

## 📋 Schema & Sample Entry

```json
{
  "sources": [
    "https://anilist.co/anime/142051",
    "https://anime-planet.com/anime/raise-a-suilen-nvade-show",
    "https://kitsu.app/anime/47450",
    "https://myanimelist.net/anime/51478"
  ],
  "title": "!NVADE SHOW!",
  "type": "SPECIAL",
  "episodes": 1,
  "status": "FINISHED",
  "animeSeason": {
    "season": "FALL",
    "year": 2020
  },
  "picture": "https://cdn.myanimelist.net/images/anime/1615/149911.jpg",
  "thumbnail": "https://cdn.myanimelist.net/images/anime/1615/149911t.jpg",
  "synonyms": [
    "!nvade Show!",
    "Invade Show!",
    "RAISE A SUILEN: !NVADE SHOW!"
  ],
  "studios": [
    "sanzigen"
  ],
  "tags": [
    "band",
    "music"
  ]
}
```

---

## 🛠️ Building Locally

```bash
# Clone the repository
git clone https://github.com/athanasso/anime-offline-database.git
cd anime-offline-database

# Run the builder
node build_database.js
```

Outputs will be saved in `dist/`.

---

## 📄 License

Database licensed under the **[Open Database License (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/1-0/)**.
