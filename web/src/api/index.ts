// API selector.
//
// The deployed (Vercel) build is hard-wired to the in-app demo fixtures
// (mockApi) so every screen, button, and interaction works with no backend
// reachable — nothing hits the network and nothing can fail into a blank page.
//
// The live Workstream A client (./orbitApi) still exists and mirrors this exact
// surface; to run against it, re-point `impl` below. It is intentionally not
// imported here so its module-level side effects (registering a live repo,
// opening an EventSource) never run in the demo build.
import * as mockApi from "./mockApi";

const impl = mockApi;

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
export const IS_LIVE = false;
