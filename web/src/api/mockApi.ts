// Thin async wrapper over the fixtures, standing in for Workstream A's REST API
// (see PRD.md §4.2 / §7 deliverable #1: "mock API layer from fixtures").
// Swap the bodies for real `fetch` calls once the API is live — call sites don't change.
import { AGENTS, HUMANS, REPOS, ACTIVITY, POSTS } from "../data/fixtures";
import type { Agent, Human, Repo, ActivityItem, Post } from "../types";

export async function getAgents(): Promise<Agent[]> {
  return AGENTS;
}

export async function getHumans(): Promise<Human[]> {
  return HUMANS;
}

export async function getRepos(): Promise<Repo[]> {
  return REPOS;
}

export async function getRepo(id: string): Promise<Repo | undefined> {
  return REPOS.find((r) => r.id === id);
}

export async function getActivity(): Promise<ActivityItem[]> {
  return ACTIVITY;
}

export async function getPosts(): Promise<Post[]> {
  return POSTS;
}
