// API selector. When VITE_API_URL is set the app talks to Workstream A's real
// REST + SSE backend (orbitApi); otherwise it runs on local mock fixtures
// (mockApi). Both modules expose an identical surface, so screens import from
// here and never care which one is live.
import * as mockApi from "./mockApi";
import * as orbitApi from "./orbitApi";

const impl = import.meta.env.VITE_API_URL ? orbitApi : mockApi;

export const getAgents = impl.getAgents;
export const getHumans = impl.getHumans;
export const getRepos = impl.getRepos;
export const getRepo = impl.getRepo;
export const getActivity = impl.getActivity;
export const getPosts = impl.getPosts;
export const getRepoTree = impl.getRepoTree;
export const getRepoFile = impl.getRepoFile;
export const getRepoContext = impl.getRepoContext;
export const getAllContext = impl.getAllContext;
export const retractContext = impl.retractContext;
export const getAllSessions = impl.getAllSessions;
export const getInitialEvents = impl.getInitialEvents;
export const subscribeEvents = impl.subscribeEvents;

/** True when the app is wired to Workstream A rather than mock fixtures. */
export const IS_LIVE = Boolean(import.meta.env.VITE_API_URL);
