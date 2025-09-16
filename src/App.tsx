import React, { useEffect, useMemo, useState } from "react";
import Streamgraph from "./components/Charts/Streamgraph";
import MoviesRuntime from "./components/Charts/MoviesRuntime";
import TVSeasons from "./components/Charts/TVSeasons";

// ---------- literal unions ----------
const TYPES = ["All", "Movie", "TV Show"] as const;
type ContentType = (typeof TYPES)[number];

const RATINGS = ["Kids", "Teen", "Adult", "Other"] as const;
type RatingGroup = (typeof RATINGS)[number];

// ---------- data types ----------
interface GenreYearRec {
  release_year: number;
  genres: string;
  type: Exclude<ContentType, "All">; // "Movie" | "TV Show"
  count: number;
  total: number;
}
interface RatingDistRec {
  type: Exclude<ContentType, "All">;
  rating_group: RatingGroup;
  count: number;
}
interface MovieRuntimeRec {
  title: string;
  release_year: number;
  runtime_min: number | null;      // allow nulls from JSON
  rating_group: RatingGroup;
  primary_genre: string | null;
  primary_country: string | null;
}
interface TVSeasonsRec {
  title: string;
  release_year: number;
  seasons: number | null;          // allow nulls from JSON
  rating_group: RatingGroup;
  primary_genre: string | null;
  primary_country: string | null;
}

// ---------- paths to JSON in /public/data ----------
const DATA = {
  genreByYear: "/data/derived_genre_by_year.json",
  ratingDist: "/data/derived_rating_distribution.json",
  moviesRuntime: "/data/derived_movies_runtime.json",
  tvSeasons: "/data/derived_tv_seasons.json",
};

export default function App() {
  // raw data
  const [genreByYear, setGenreByYear] = useState<GenreYearRec[]>([]);
  const [ratingDist, setRatingDist] = useState<RatingDistRec[]>([]);
  const [moviesRuntime, setMoviesRuntime] = useState<MovieRuntimeRec[]>([]);
  const [tvSeasons, setTvSeasons] = useState<TVSeasonsRec[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [typeFilter, setTypeFilter] = useState<ContentType>("All");
  const [yearRange, setYearRange] = useState<[number, number]>([1990, 2021]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [ratingGroups, setRatingGroups] = useState<RatingGroup[]>([...RATINGS]);

  // brushes from charts
  const [movieYRange, setMovieYRange] = useState<[number, number] | null>(null);
  const [tvYRange, setTvYRange] = useState<[number, number] | null>(null);

  // load data
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [g, r, m, t] = await Promise.all([
        fetch(DATA.genreByYear).then((res) => res.json()),
        fetch(DATA.ratingDist).then((res) => res.json()),
        fetch(DATA.moviesRuntime).then((res) => res.json()),
        fetch(DATA.tvSeasons).then((res) => res.json()),
      ]);
      setGenreByYear(g);
      setRatingDist(r);
      setMoviesRuntime(m);
      setTvSeasons(t);
      setLoading(false);
    })();
  }, []);

  // derived lists/ranges
  const allGenres = useMemo(
    () => Array.from(new Set(genreByYear.map((d) => d.genres))).sort(),
    [genreByYear]
  );
  const minYear = useMemo(
    () => (genreByYear.length ? Math.min(...genreByYear.map((d) => d.release_year)) : 1990),
    [genreByYear]
  );
  const maxYear = useMemo(
    () => (genreByYear.length ? Math.max(...genreByYear.map((d) => d.release_year)) : 2021),
    [genreByYear]
  );
  useEffect(() => {
    if (genreByYear.length) setYearRange([minYear, maxYear]);
  }, [genreByYear, minYear, maxYear]);

  // apply filters
  const filteredGenreByYear = useMemo(() => {
    return genreByYear.filter(
      (d) =>
        (typeFilter === "All" || d.type === typeFilter) &&
        d.release_year >= yearRange[0] &&
        d.release_year <= yearRange[1] &&
        (selectedGenres.length === 0 || selectedGenres.includes(d.genres))
    );
  }, [genreByYear, typeFilter, yearRange, selectedGenres]);

  const totalTitles = useMemo(
    () => filteredGenreByYear.reduce((acc, d) => acc + d.count, 0),
    [filteredGenreByYear]
  );

  const filteredMovies = useMemo(() => {
    return moviesRuntime.filter(
      (d) =>
        d.runtime_min != null &&
        d.release_year >= yearRange[0] &&
        d.release_year <= yearRange[1] &&
        (selectedGenres.length === 0 ||
          (d.primary_genre && selectedGenres.includes(d.primary_genre))) &&
        ratingGroups.includes(d.rating_group) &&
        (movieYRange ? d.runtime_min >= movieYRange[0] && d.runtime_min <= movieYRange[1] : true)
    );
  }, [moviesRuntime, yearRange, selectedGenres, ratingGroups, movieYRange]);

  const filteredTV = useMemo(() => {
    return tvSeasons.filter(
      (d) =>
        d.seasons != null &&
        d.release_year >= yearRange[0] &&
        d.release_year <= yearRange[1] &&
        (selectedGenres.length === 0 ||
          (d.primary_genre && selectedGenres.includes(d.primary_genre))) &&
        ratingGroups.includes(d.rating_group) &&
        (tvYRange ? d.seasons >= tvYRange[0] && d.seasons <= tvYRange[1] : true)
    );
  }, [tvSeasons, yearRange, selectedGenres, ratingGroups, tvYRange]);

  // UI
  return (
    <div className="min-h-screen bg-[#0B0B0F] text-white">
      <header className="sticky top-0 z-10 backdrop-blur bg-black/30 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="text-xl font-semibold tracking-tight">Netflix Universe Explorer</div>
          <div className="text-xs opacity-70">Step 1 — App Shell + Filters</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-12 gap-6">
        {/* Filter rail */}
        <aside className="col-span-12 md:col-span-3 lg:col-span-3 bg-[#141414] rounded-2xl p-4 border border-white/10">
          <h2 className="text-lg font-medium mb-3">Filters</h2>

          {/* Type */}
          <div className="mb-4">
            <label className="block text-sm mb-2 opacity-80">Type</label>
            <div className="flex gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 rounded-full border text-sm ${
                    typeFilter === t ? "bg-[#E50914] border-[#E50914]" : "border-white/20 hover:border-white/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Year range */}
          <div className="mb-4">
            <label className="block text-sm mb-2 opacity-80">Release year</label>
            <div className="text-xs opacity-70 mb-2">
              {yearRange[0]} – {yearRange[1]}
            </div>
            <input
              type="range"
              min={minYear}
              max={maxYear}
              value={yearRange[0]}
              onChange={(e) => setYearRange([+e.target.value, yearRange[1]])}
              className="w-full"
            />
            <input
              type="range"
              min={minYear}
              max={maxYear}
              value={yearRange[1]}
              onChange={(e) => setYearRange([yearRange[0], +e.target.value])}
              className="w-full"
            />
          </div>

          {/* Rating groups */}
          <div className="mb-4">
            <label className="block text-sm mb-2 opacity-80">Rating groups</label>
            <div className="flex flex-wrap gap-2">
              {RATINGS.map((r) => {
                const active = ratingGroups.includes(r);
                return (
                  <button
                    key={r}
                    onClick={() =>
                      setRatingGroups((prev) => (active ? prev.filter((x) => x !== r) : [...prev, r]))
                    }
                    className={`px-3 py-1 rounded-full border text-sm ${
                      active ? "bg-white/10 border-white/40" : "border-white/20 hover:border-white/40"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Genres */}
          <div className="mb-2">
            <label className="block text-sm mb-2 opacity-80">Genres</label>
            <div className="max-h-48 overflow-auto pr-1 space-y-1">
              {allGenres.map((g) => {
                const active = selectedGenres.includes(g);
                return (
                  <label key={g} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() =>
                        setSelectedGenres((prev) => (active ? prev.filter((x) => x !== g) : [...prev, g]))
                      }
                    />
                    <span className="opacity-90">{g}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={() => {
                setTypeFilter("All");
                setYearRange([minYear, maxYear]);
                setSelectedGenres([]);
                setRatingGroups([...RATINGS]);
                setMovieYRange(null);
                setTvYRange(null);
              }}
              className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-sm"
            >
              Reset
            </button>
          </div>
        </aside>

        {/* Main viewport */}
        <section className="col-span-12 md:col-span-9 lg:col-span-9 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#141414] rounded-2xl p-4 border border-white/10">
              <div className="text-xs opacity-70">Selected titles</div>
              <div className="text-2xl font-semibold">{totalTitles.toLocaleString()}</div>
            </div>
            <div className="bg-[#141414] rounded-2xl p-4 border border-white/10">
              <div className="text-xs opacity-70">Years range</div>
              <div className="text-2xl font-semibold">
                {yearRange[0]}–{yearRange[1]}
              </div>
            </div>
            <div className="bg-[#141414] rounded-2xl p-4 border border-white/10">
              <div className="text-xs opacity-70">Active genres</div>
              <div className="text-2xl font-semibold">{selectedGenres.length || "All"}</div>
            </div>
          </div>

          {/* STREAMGRAPH */}
          <div className="bg-[#141414] rounded-2xl p-4 border border-white/10 h-[460px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm opacity-70">
                Loading data…
              </div>
            ) : (
              <Streamgraph
                data={filteredGenreByYear.map((d) => ({
                  release_year: d.release_year,
                  genres: d.genres,
                  count: d.count,
                }))}
                yearRange={yearRange}
              />
            )}
          </div>

          {/* RUNTIME + SEASONS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#141414] rounded-2xl p-4 border border-white/10 h-[420px]">
              {loading ? (
                <div className="h-full flex items-center justify-center text-sm opacity-70">Loading data…</div>
              ) : (
                <MoviesRuntime data={filteredMovies as any} onBrush={setMovieYRange} />
              )}
            </div>
            <div className="bg-[#141414] rounded-2xl p-4 border border-white/10 h-[420px]">
              {loading ? (
                <div className="h-full flex items-center justify-center text-sm opacity-70">Loading data…</div>
              ) : (
                <TVSeasons data={filteredTV as any} onBrush={setTvYRange} />
              )}
            </div>
          </div>

          {/* Optional badges showing active numeric brushes */}
          {(movieYRange || tvYRange) && (
            <div className="text-xs opacity-80">
              {movieYRange && (
                <span className="mr-3 inline-block px-2 py-1 rounded bg-white/10 border border-white/20">
                  Runtime filter: {movieYRange[0]}–{movieYRange[1]} min
                </span>
              )}
              {tvYRange && (
                <span className="inline-block px-2 py-1 rounded bg-white/10 border border-white/20">
                  Seasons filter: {tvYRange[0]}–{tvYRange[1]}
                </span>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
