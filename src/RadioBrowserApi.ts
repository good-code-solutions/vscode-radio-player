export interface RadioStation {
    name: string;
    url: string;
    fallbackUrl?: string;
    thumbnail?: string;
    country?: string;
    stationUuid?: string;
    codec?: string;
    latitude?: number;
    longitude?: number;
}

export interface RadioCountry {
    code: string;
    name: string;
    latitude?: number;
    longitude?: number;
}

export interface RadioStationLocation {
    name: string;
    countryCode: string;
    latitude: number;
    longitude: number;
    stationUuid?: string;
    url?: string;
    codec?: string;
}

export interface RadioGenre {
    name: string;
    stationCount: number;
}

interface RadioBrowserClient {
    getCategory(category: string, filter?: Record<string, string | boolean | number>): Promise<unknown>;
    getStations(filter: {
        by: string;
        searchterm: string;
        limit: number;
        hidebroken: boolean;
        order: string;
        reverse: boolean;
    }): Promise<unknown>;
    clickStation(stationUuid: string): Promise<unknown>;
}

interface ApiCountry {
    name?: unknown;
    iso_3166_1?: unknown;
}

interface ApiStation {
    stationuuid?: unknown;
    name?: unknown;
    url_resolved?: unknown;
    url?: unknown;
    favicon?: unknown;
    countrycode?: unknown;
    codec?: unknown;
    geo_lat?: unknown;
    geo_long?: unknown;
}

interface ApiTag {
    name?: unknown;
    stationcount?: unknown;
}

const STATIONS_LIMIT = 100;
const CACHE_DURATION_MS = 60 * 60 * 1000;
const stationCache = new Map<string, { expiresAt: number; stations: RadioStation[] }>();
const genreStationCache = new Map<string, { expiresAt: number; stations: RadioStation[] }>();
let globeStationsCache: { expiresAt: number; stations: RadioStationLocation[] } | undefined;
let countriesCache: { expiresAt: number; countries: RadioCountry[] } | undefined;
let genresCache: { expiresAt: number; genres: RadioGenre[] } | undefined;
const radioBrowser = require('radio-browser') as RadioBrowserClient;

export class RadioBrowserApi {
    public async getCountries(): Promise<RadioCountry[]> {
        if (countriesCache && countriesCache.expiresAt > Date.now()) {
            return countriesCache.countries;
        }

        const response = await radioBrowser.getCategory('countries', {
            order: 'stationcount',
            reverse: true
        });
        if (!Array.isArray(response)) {
            throw new Error('Radio Browser returned an unexpected country response.');
        }

        const countries = response.flatMap((item: ApiCountry) => {
            const code = typeof item?.iso_3166_1 === 'string' ? item.iso_3166_1.toLowerCase() : '';
            const name = typeof item?.name === 'string' ? item.name.trim() : '';
            if (!/^[a-z]{2}$/.test(code) || !name) {
                return [];
            }
            return [{ code, name }];
        });
        countriesCache = { expiresAt: Date.now() + CACHE_DURATION_MS, countries };
        return countries;
    }

    public async getGenres(): Promise<RadioGenre[]> {
        if (genresCache && genresCache.expiresAt > Date.now()) {
            return genresCache.genres;
        }

        const response = await radioBrowser.getCategory('tags', {
            order: 'stationcount',
            reverse: true,
            limit: 60
        });
        if (!Array.isArray(response)) {
            throw new Error('Radio Browser returned an unexpected genre response.');
        }

        const genres = response.flatMap((item: ApiTag): RadioGenre[] => {
            if (typeof item?.name !== 'string' || !item.name.trim()) {
                return [];
            }
            const stationCount = Number(item.stationcount);
            return [{
                name: item.name.trim(),
                stationCount: Number.isFinite(stationCount) ? stationCount : 0
            }];
        });
        genresCache = { expiresAt: Date.now() + CACHE_DURATION_MS, genres };
        return genres;
    }

    public async getStationsForGenre(genreName: string): Promise<RadioStation[]> {
        const genre = genreName.trim();
        if (!genre || genre.length > 100) {
            throw new Error('Genre must be between 1 and 100 characters.');
        }
        const cacheKey = genre.toLocaleLowerCase();
        const cached = genreStationCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.stations;
        }

        const response = await radioBrowser.getStations({
            by: 'tagexact',
            searchterm: genre,
            limit: STATIONS_LIMIT,
            hidebroken: true,
            order: 'votes',
            reverse: true
        });
        if (!Array.isArray(response)) {
            throw new Error('Radio Browser returned an unexpected genre station response.');
        }

        const stations = response.flatMap((item: ApiStation) => normalizeStation(item));
        genreStationCache.set(cacheKey, { expiresAt: Date.now() + CACHE_DURATION_MS, stations });
        return stations;
    }

    public async getStationsForCountry(countryCode: string): Promise<RadioStation[]> {
        const code = countryCode.toLowerCase();
        if (!/^[a-z]{2}$/.test(code)) {
            throw new Error('Country code must be a two-letter ISO code.');
        }

        const cached = stationCache.get(code);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.stations;
        }

        const response = await radioBrowser.getStations({
            by: 'countrycodeexact',
            searchterm: code.toUpperCase(),
            limit: STATIONS_LIMIT,
            hidebroken: true,
            order: 'votes',
            reverse: true
        });
        if (!Array.isArray(response)) {
            throw new Error('Radio Browser returned an unexpected station response.');
        }

        const stations = response.flatMap((item: ApiStation) => normalizeStation(item, code));
        stationCache.set(code, { expiresAt: Date.now() + CACHE_DURATION_MS, stations });
        return stations;
    }

    public async getGlobeStations(): Promise<RadioStationLocation[]> {
        if (globeStationsCache && globeStationsCache.expiresAt > Date.now()) {
            return globeStationsCache.stations;
        }

        const response = await radioBrowser.getStations({
            by: 'name',
            searchterm: 'a',
            limit: 1000,
            hidebroken: true,
            order: 'votes',
            reverse: true
        });
        if (!Array.isArray(response)) {
            throw new Error('Radio Browser returned an unexpected globe station response.');
        }

        const stations = response.flatMap((item: ApiStation): RadioStationLocation[] => {
            const countryCode = typeof item?.countrycode === 'string' ? item.countrycode.toLowerCase() : '';
            const latitude = typeof item?.geo_lat === 'number' ? item.geo_lat : Number.NaN;
            const longitude = typeof item?.geo_long === 'number' ? item.geo_long : Number.NaN;
            if (
                typeof item?.name !== 'string' || !item.name.trim() ||
                !/^[a-z]{2}$/.test(countryCode) ||
                !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
                !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
                (latitude === 0 && longitude === 0)
            ) {
                return [];
            }
            const location: RadioStationLocation = {
                name: item.name.trim(),
                countryCode,
                latitude,
                longitude
            };
            if (typeof item.stationuuid === 'string') {
                location.stationUuid = item.stationuuid;
            }
            const url = item.url_resolved ?? item.url;
            if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
                location.url = url;
            }
            if (typeof item.codec === 'string') {
                location.codec = item.codec;
            }
            return [location];
        });
        globeStationsCache = { expiresAt: Date.now() + CACHE_DURATION_MS, stations };
        return stations;
    }

    public async recordStationClick(stationUuid: string): Promise<void> {
        if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(stationUuid)) {
            throw new Error('Station ID must be a valid Radio Browser UUID.');
        }
        await radioBrowser.clickStation(stationUuid);
    }
}

function normalizeStation(station: ApiStation, fallbackCountry?: string): RadioStation[] {
    if (!station || typeof station.name !== 'string' || !station.name.trim()) {
        return [];
    }

    const resolvedUrl = station.url_resolved;
    const originalUrl = station.url;
    const url = typeof resolvedUrl === 'string' && /^https?:\/\//i.test(resolvedUrl)
        ? resolvedUrl
        : originalUrl;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return [];
    }
    const fallbackUrl = typeof resolvedUrl === 'string' && resolvedUrl !== url
        ? resolvedUrl
        : typeof originalUrl === 'string' && originalUrl !== url
            ? originalUrl
            : undefined;

    const thumbnail = station.favicon;
    const country = typeof station.countrycode === 'string' && /^[a-z]{2}$/i.test(station.countrycode)
        ? station.countrycode.toLowerCase()
        : fallbackCountry;

    const normalized: RadioStation = {
        name: station.name.trim(),
        url,
        country,
        stationUuid: typeof station.stationuuid === 'string' ? station.stationuuid : undefined,
        codec: typeof station.codec === 'string' ? station.codec : undefined
    };
    if (typeof station.geo_lat === 'number' && Number.isFinite(station.geo_lat) &&
        station.geo_lat >= -90 && station.geo_lat <= 90) {
        normalized.latitude = station.geo_lat;
    }
    if (typeof station.geo_long === 'number' && Number.isFinite(station.geo_long) &&
        station.geo_long >= -180 && station.geo_long <= 180) {
        normalized.longitude = station.geo_long;
    }
    if (typeof thumbnail === 'string' && /^https?:\/\//i.test(thumbnail)) {
        normalized.thumbnail = thumbnail;
    }
    if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl)) {
        normalized.fallbackUrl = fallbackUrl;
    }
    return [normalized];
}
