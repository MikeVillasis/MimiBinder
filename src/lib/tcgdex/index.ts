// Server-only TCGdex client. Used by /api routes and the snapshot cron job.
export {
  fetchCard,
  fetchCards,
  fetchFx,
  fetchSeries,
  fetchSet,
  fetchSets,
  getSerieIndex,
  searchCards,
  REVALIDATE,
  SEARCH_PAGE_SIZE,
  TcgdexError,
  TCGDEX_BASE,
} from "./client";
export { EXCLUDED_SERIES, TCGPLAYER_KEYS } from "./normalize";
