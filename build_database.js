/**
 * build_database.js
 *
 * Automated Anime Offline Database builder.
 * 
 * 1. Downloads the latest release of anime-offline-database (seeds from previous release or cedya77).
 * 2. Cross-references against Fribb/anime-lists (39,000+ entries across 12 platforms).
 * 3. Automatically enriches newly detected anime via public APIs (Jikan, Kitsu).
 * 4. Generates drop-in compatible anime-offline-database-minified.json and anime-offline-database.json.
 */

const fs = require('fs/promises');
const path = require('path');

const FRIBB_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
const FALLBACK_RELEASE_URL = 'https://api.github.com/repos/cedya77/anime-offline-database/releases/latest';

const DIST_DIR = path.join(__dirname, 'dist');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getWeekTag(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

function formatSourcesFromFribb(item) {
  const sources = [];
  if (item.anidb_id) sources.push(`https://anidb.net/anime/${item.anidb_id}`);
  if (item.anilist_id) sources.push(`https://anilist.co/anime/${item.anilist_id}`);
  if (item['anime-planet_id']) sources.push(`https://anime-planet.com/anime/${item['anime-planet_id']}`);
  if (item.anisearch_id) sources.push(`https://anisearch.com/anime/${item.anisearch_id}`);
  if (item.kitsu_id) sources.push(`https://kitsu.app/anime/${item.kitsu_id}`);
  if (item.livechart_id) sources.push(`https://livechart.me/anime/${item.livechart_id}`);
  if (item.mal_id) sources.push(`https://myanimelist.net/anime/${item.mal_id}`);
  if (item.simkl_id) sources.push(`https://simkl.com/anime/${item.simkl_id}`);
  if (item.animenewsnetwork_id) sources.push(`https://animenewsnetwork.com/encyclopedia/anime.php?id=${item.animenewsnetwork_id}`);
  if (item.animecountdown_id) sources.push(`https://animecountdown.com/${item.animecountdown_id}`);
  if (item.tvdb_id) sources.push(`https://thetvdb.com/dereferrer/series/${item.tvdb_id}`);

  if (item.themoviedb_id) {
    if (item.themoviedb_id.tv) sources.push(`https://www.themoviedb.org/tv/${item.themoviedb_id.tv}`);
    if (item.themoviedb_id.movie) sources.push(`https://www.themoviedb.org/movie/${item.themoviedb_id.movie}`);
  }

  if (item.imdb_id) {
    const ids = Array.isArray(item.imdb_id) ? item.imdb_id : [item.imdb_id];
    for (const id of ids) {
      if (id) sources.push(`https://www.imdb.com/title/${id}`);
    }
  }

  return Array.from(new Set(sources)).sort();
}

async function fetchMetadataForMalId(malId) {
  // 1. Try Jikan (Unofficial MAL API)
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
      headers: { 'User-Agent': 'anime-offline-database-crawler/1.0' }
    });
    if (res.ok) {
      const data = await res.json();
      const a = data.data;
      if (a) {
        return {
          title: a.title || a.title_english || a.title_japanese || null,
          type: (a.type || 'TV').toUpperCase(),
          episodes: a.episodes || 0,
          status: a.status ? a.status.toUpperCase().replace(/\s+/g, '_') : 'FINISHED',
          animeSeason: {
            season: a.season ? a.season.toUpperCase() : 'UNDEFINED',
            year: a.year || (a.aired?.from ? new Date(a.aired.from).getFullYear() : null)
          },
          picture: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
          thumbnail: a.images?.jpg?.small_image_url || a.images?.jpg?.image_url || null,
          synonyms: Array.from(new Set([
            ...(a.titles?.map(t => t.title) || []),
            ...(a.title_synonyms || [])
          ])).filter(Boolean),
          tags: a.genres?.map(g => g.name.toLowerCase()) || [],
          studios: a.studios?.map(s => s.name.toLowerCase()) || [],
          producers: a.producers?.map(p => p.name.toLowerCase()) || []
        };
      }
    }
  } catch (e) {
    console.warn(`[Jikan] Failed for MAL ${malId}:`, e.message);
  }

  // 2. Fallback to Kitsu API
  try {
    const res = await fetch(
      `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${malId}&include=item`,
      { headers: { 'Accept': 'application/vnd.api+json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const item = data.included?.[0];
      if (item?.attributes) {
        const attr = item.attributes;
        return {
          title: attr.canonicalTitle || attr.titles?.en || attr.titles?.en_jp || null,
          type: (attr.subtype || 'TV').toUpperCase(),
          episodes: attr.episodeCount || 0,
          status: attr.status ? attr.status.toUpperCase() : 'FINISHED',
          animeSeason: {
            season: 'UNDEFINED',
            year: attr.startDate ? new Date(attr.startDate).getFullYear() : null
          },
          picture: attr.posterImage?.large || attr.posterImage?.original || null,
          thumbnail: attr.posterImage?.small || null,
          synonyms: Object.values(attr.titles || {}).filter(Boolean),
          tags: [],
          studios: [],
          producers: []
        };
      }
    }
  } catch (e) {
    console.warn(`[Kitsu] Failed for MAL ${malId}:`, e.message);
  }

  return null;
}

async function buildDatabase() {
  try {
    const tag = getWeekTag();
    console.log(`=== Building Anime Offline Database [${tag}] ===`);

    await fs.mkdir(DIST_DIR, { recursive: true });

    // Step 1: Download base dataset
    console.log('1/5 Downloading latest release base dataset...');
    const ghHeaders = { 'User-Agent': 'anime-offline-database-builder' };
    if (process.env.GITHUB_TOKEN) {
      ghHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const currentRepo = process.env.GITHUB_REPOSITORY || 'athanasso/anime-offline-database';
    let relRes = await fetch(`https://api.github.com/repos/${currentRepo}/releases/latest`, { headers: ghHeaders });
    if (!relRes.ok) {
      console.log(`No previous release on ${currentRepo}. Bootstrapping from upstream fallback...`);
      relRes = await fetch(FALLBACK_RELEASE_URL, { headers: { 'User-Agent': 'anime-offline-database-builder' } });
    }
    if (!relRes.ok) throw new Error('Failed to fetch release metadata: HTTP ' + relRes.status);
    const relData = await relRes.json();
    const asset = relData.assets?.find(a => a.name === 'anime-offline-database-minified.json');
    if (!asset) throw new Error('anime-offline-database-minified.json not found in release');

    console.log(`Downloading ${asset.name} (${(asset.size / (1024 * 1024)).toFixed(1)} MB)...`);
    const aodRes = await fetch(asset.browser_download_url);
    if (!aodRes.ok) throw new Error('Failed to download AOD base: HTTP ' + aodRes.status);
    const aodJson = await aodRes.json();
    const dataset = aodJson.data || [];
    console.log(`Loaded ${dataset.length} base entries.`);

    // Step 2: Index base dataset
    console.log('2/5 Indexing existing entries...');
    const malIndex = new Map();
    const anilistIndex = new Map();
    const anidbIndex = new Map();
    const kitsuIndex = new Map();

    for (const item of dataset) {
      if (!Array.isArray(item.sources)) continue;
      for (const src of item.sources) {
        const malM = src.match(/myanimelist\.net\/anime\/(\d+)/);
        if (malM) malIndex.set(parseInt(malM[1], 10), item);
        const aniM = src.match(/anilist\.co\/anime\/(\d+)/);
        if (aniM) anilistIndex.set(parseInt(aniM[1], 10), item);
        const anidbM = src.match(/anidb\.net\/anime\/(\d+)/);
        if (anidbM) anidbIndex.set(parseInt(anidbM[1], 10), item);
        const kitsuM = src.match(/kitsu\.app\/anime\/(\d+)/);
        if (kitsuM) kitsuIndex.set(parseInt(kitsuM[1], 10), item);
      }
    }

    // Step 3: Fetch Fribb cross-reference database
    console.log('3/5 Fetching Fribb anime-lists...');
    const fribbRes = await fetch(FRIBB_URL);
    if (!fribbRes.ok) throw new Error('Failed to fetch Fribb list: HTTP ' + fribbRes.status);
    const fribbData = await fribbRes.json();
    console.log(`Fetched ${fribbData.length} Fribb cross-reference entries.`);

    // Step 4: Cross-reference and detect new anime
    console.log('4/5 Cross-referencing entries and detecting new anime...');
    const missingFribb = [];
    let updatedSourcesCount = 0;

    for (const fribb of fribbData) {
      let existing = null;
      if (fribb.mal_id && malIndex.has(fribb.mal_id)) existing = malIndex.get(fribb.mal_id);
      else if (fribb.anilist_id && anilistIndex.has(fribb.anilist_id)) existing = anilistIndex.get(fribb.anilist_id);
      else if (fribb.anidb_id && anidbIndex.has(fribb.anidb_id)) existing = anidbIndex.get(fribb.anidb_id);
      else if (fribb.kitsu_id && kitsuIndex.has(fribb.kitsu_id)) existing = kitsuIndex.get(fribb.kitsu_id);

      if (existing) {
        // Merge any new sources
        const freshSources = formatSourcesFromFribb(fribb);
        let changed = false;
        for (const s of freshSources) {
          if (!existing.sources.includes(s)) {
            existing.sources.push(s);
            changed = true;
          }
        }
        if (changed) {
          existing.sources.sort();
          updatedSourcesCount++;
        }
      } else {
        missingFribb.push(fribb);
      }
    }

    console.log(`Detected ${missingFribb.length} new anime to enrich (updated ${updatedSourcesCount} existing entries with new sources).`);

    // Enrich missing entries (cap to 50 per run to prevent timeout)
    const toEnrich = missingFribb.slice(0, 50);
    let newlyEnrichedCount = 0;

    for (let i = 0; i < toEnrich.length; i++) {
      const fribb = toEnrich[i];
      const malId = fribb.mal_id;
      if (!malId) continue;

      console.log(`[${i + 1}/${toEnrich.length}] Enriching new anime MAL ID ${malId}...`);
      const meta = await fetchMetadataForMalId(malId);
      if (meta && meta.title) {
        const newEntry = {
          sources: formatSourcesFromFribb(fribb),
          title: meta.title,
          type: meta.type || fribb.type || 'TV',
          episodes: meta.episodes || 0,
          status: meta.status || 'FINISHED',
          animeSeason: meta.animeSeason || { season: 'UNDEFINED', year: null },
          picture: meta.picture,
          thumbnail: meta.thumbnail,
          synonyms: meta.synonyms || [],
          studios: meta.studios || [],
          producers: meta.producers || [],
          relatedAnime: [],
          tags: meta.tags || []
        };
        dataset.push(newEntry);
        newlyEnrichedCount++;
      }
      await sleep(400); // Polite rate limit
    }

    // Sort alphabetically by title
    dataset.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    // Step 5: Format and write output
    console.log('5/5 Generating release artifacts...');
    const resultObj = {
      $schema: `https://raw.githubusercontent.com/${currentRepo}/main/schemas/anime-offline-database-minified.schema.json`,
      license: 'ODbL-1.0',
      repository: `https://github.com/${currentRepo}`,
      lastUpdate: Math.floor(Date.now() / 1000),
      data: dataset
    };

    const minifiedPath = path.join(DIST_DIR, 'anime-offline-database-minified.json');
    const fullPath = path.join(DIST_DIR, 'anime-offline-database.json');
    const notesPath = path.join(DIST_DIR, 'release_notes.md');
    const tagPath = path.join(DIST_DIR, 'tag.txt');

    console.log('Writing minified JSON...');
    await fs.writeFile(minifiedPath, JSON.stringify(resultObj), 'utf8');

    console.log('Writing formatted JSON...');
    await fs.writeFile(fullPath, JSON.stringify(resultObj, null, 2), 'utf8');

    // Stats breakdown
    let malCount = 0, anilistCount = 0, kitsuCount = 0, anidbCount = 0;
    let imdbCount = 0, tmdbCount = 0, tvdbCount = 0, simklCount = 0;

    for (const item of dataset) {
      for (const s of (item.sources || [])) {
        if (s.includes('myanimelist.net')) malCount++;
        if (s.includes('anilist.co')) anilistCount++;
        if (s.includes('kitsu.app')) kitsuCount++;
        if (s.includes('anidb.net')) anidbCount++;
        if (s.includes('imdb.com')) imdbCount++;
        if (s.includes('themoviedb.org')) tmdbCount++;
        if (s.includes('thetvdb.com')) tvdbCount++;
        if (s.includes('simkl.com')) simklCount++;
      }
    }

    const releaseNotes = [
      `## Release ${tag}`,
      '',
      'Automated weekly build of **Anime Offline Database**.',
      '',
      '### 📊 Dataset Statistics',
      `- **Total Anime Entries**: \`${dataset.length.toLocaleString()}\``,
      `- **MyAnimeList Links**: \`${malCount.toLocaleString()}\``,
      `- **AniList Links**: \`${anilistCount.toLocaleString()}\``,
      `- **Kitsu Links**: \`${kitsuCount.toLocaleString()}\``,
      `- **AniDB Links**: \`${anidbCount.toLocaleString()}\``,
      `- **IMDb Links**: \`${imdbCount.toLocaleString()}\``,
      `- **TheMovieDB (TMDb) Links**: \`${tmdbCount.toLocaleString()}\``,
      `- **TheTVDB Links**: \`${tvdbCount.toLocaleString()}\``,
      `- **Simkl Links**: \`${simklCount.toLocaleString()}\``,
      `- **Newly Enriched Entries This Run**: \`${newlyEnrichedCount}\``,
      `- **Updated Source Cross-References**: \`${updatedSourcesCount}\``,
      '',
      '### 📦 Assets',
      '- `anime-offline-database-minified.json` — Compact JSON for production and web use.',
      '- `anime-offline-database.json` — Pretty-printed standard JSON.',
      ''
    ].join('\n');

    await fs.writeFile(notesPath, releaseNotes, 'utf8');
    await fs.writeFile(tagPath, tag, 'utf8');

    console.log(`Done! Generated ${dataset.length} entries for release ${tag}.`);
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

buildDatabase();
