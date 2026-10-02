// The GitHub REST API, as much of it as issues and gists need.
//
// Every call carries the user's own token, read from the Keychain by the caller and passed
// in; nothing here stores it. Errors are sorted into the few things a user can act on — no
// token, a token GitHub refused, a repository that is gone or out of reach — and anything
// else is a plain failure that says to try again.

import type { FetchInit, FetchResponse } from "@atat/api";

const API = "https://api.github.com";

export type Fetch = (url: string, init?: FetchInit) => Promise<FetchResponse>;

export type GitHubErrorKind = "missingToken" | "tokenRejected" | "notFound" | "notAllowed" | "failed";

export class GitHubError extends Error {
  constructor(readonly kind: GitHubErrorKind) {
    super(kind);
  }
}

export interface Repository {
  fullName: string;
  isPrivate: boolean;
}

export interface Created {
  url: string;
  /// `#123` for an issue, the gist's file name for a gist.
  label: string;
}

/// The repositories the user can open issues in, most recently pushed first. One page of a
/// hundred is enough for a picker; a user with more types the name into Settings.
export async function listRepositories(token: string, fetch: Fetch): Promise<Repository[]> {
  const response = await request(
    fetch,
    token,
    "GET",
    "/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member"
  );
  const payload = (await response.json()) as {
    full_name?: unknown;
    private?: unknown;
    has_issues?: unknown;
    archived?: unknown;
  }[];
  return (Array.isArray(payload) ? payload : [])
    .filter((repo) => repo.has_issues !== false && repo.archived !== true)
    .map((repo) => ({ fullName: String(repo.full_name ?? ""), isPrivate: repo.private === true }))
    .filter((repo) => /^[\w.-]+\/[\w.-]+$/.test(repo.fullName));
}

export async function createIssue(
  token: string,
  repository: string,
  issue: { title: string; body: string; labels: string[] },
  fetch: Fetch
): Promise<Created> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new GitHubError("notFound");
  const title = issue.title.replace(/\s+/g, " ").trim();
  if (title.length === 0) throw new GitHubError("failed");
  const response = await request(fetch, token, "POST", `/repos/${repository}/issues`, {
    title: title.slice(0, 256),
    body: issue.body,
    ...(issue.labels.length > 0 ? { labels: issue.labels } : {}),
  });
  const payload = (await response.json()) as { html_url?: unknown; number?: unknown };
  return { url: String(payload.html_url ?? ""), label: `#${String(payload.number ?? "")}` };
}

export async function createGist(
  token: string,
  gist: { fileName: string; content: string; description: string; isPublic: boolean },
  fetch: Fetch
): Promise<Created> {
  const fileName = gist.fileName.trim() || "snippet.txt";
  const response = await request(fetch, token, "POST", "/gists", {
    description: gist.description,
    public: gist.isPublic,
    files: { [fileName]: { content: gist.content } },
  });
  const payload = (await response.json()) as { html_url?: unknown };
  return { url: String(payload.html_url ?? ""), label: fileName };
}

/// The labels a repository offers, for the picker. A repository with none, or a token that
/// cannot read them, gets an empty picker rather than an error.
export async function listLabels(token: string, repository: string, fetch: Fetch): Promise<string[]> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) return [];
  try {
    const response = await request(fetch, token, "GET", `/repos/${repository}/labels?per_page=100`);
    const payload = (await response.json()) as { name?: unknown }[];
    return (Array.isArray(payload) ? payload : []).map((label) => String(label.name ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

async function request(
  fetch: Fetch,
  token: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<FetchResponse> {
  if (token.trim().length === 0) throw new GitHubError("missingToken");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.trim()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub refuses a request that names no client.
      "User-Agent": "AtAt-GitHub-Extension",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    timeoutMs: 30_000,
  });
  if (response.status >= 200 && response.status < 300) return response;
  if (response.status === 401) throw new GitHubError("tokenRejected");
  if (response.status === 404) throw new GitHubError("notFound");
  if (response.status === 403 || response.status === 422) throw new GitHubError("notAllowed");
  throw new GitHubError("failed");
}

// ----------------------------------------------------------------------- drafting

export interface IssueDraft {
  title: string;
  body: string;
}

/// A title and a tidy description from the user's agent. The selection stays in the body
/// as a quote, so the issue still carries what the user actually saw even if the draft
/// misreads it. Anything unusable falls back to the text's first line and the text itself.
export async function draftIssue(
  text: string,
  ask: ((prompt: string) => Promise<string>) | null
): Promise<IssueDraft> {
  const fallback = { title: firstLine(text), body: quote(text) };
  if (!ask) return fallback;
  const prompt = [
    "Draft a GitHub issue from the text below.",
    "Use the language the text is written in.",
    'Reply with JSON only, no code fence: {"title":"…","summary":"…"}',
    "title: at most twelve words, no trailing period.",
    "summary: one or two sentences saying what is wrong or what is wanted. Do not invent details.",
    "",
    "<text>",
    text.slice(0, 6_000),
    "</text>",
  ].join("\n");
  try {
    const reply = await ask(prompt);
    const json = reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { title?: unknown; summary?: unknown };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    return {
      title: title.length > 0 ? title.replace(/[.。]$/, "") : fallback.title,
      body: summary.length > 0 ? `${summary}\n\n${quote(text)}` : fallback.body,
    };
  } catch {
    return fallback;
  }
}

/// The selection as a Markdown quote; a block that looks like code is fenced instead, so
/// indentation survives.
export function quote(text: string): string {
  const trimmed = text.replace(/\s+$/, "");
  if (looksLikeCode(trimmed)) return `\`\`\`\n${trimmed}\n\`\`\``;
  return trimmed.split("\n").map((line) => `> ${line}`).join("\n");
}

export function firstLine(text: string): string {
  return (text.trim().split("\n")[0] ?? "").replace(/^[#>*\-\s]+/, "").slice(0, 80);
}

function looksLikeCode(text: string): boolean {
  const lines = text.split("\n");
  if (lines.length < 2) return /[{};]\s*$/.test(text) || /^\s*(const|let|func|def|class|import)\b/.test(text);
  const indented = lines.filter((line) => /^( {2,}|\t)/.test(line)).length;
  const syntax = lines.filter((line) => /[{}();]\s*$|=>|^\s*(\/\/|#include|import |from |def |func |class )/.test(line)).length;
  return indented + syntax >= Math.ceil(lines.length / 2);
}

// -------------------------------------------------------------------------- gists

/// A file name for a gist: what the agent or the user named it, else a guess from the
/// content's language, so GitHub highlights it.
export function guessFileName(text: string): string {
  const source = text.trim();
  if (/^\s*[{[]/.test(source)) {
    try {
      JSON.parse(source);
      return "snippet.json";
    } catch {
      // not JSON after all
    }
  }
  const rules: [RegExp, string][] = [
    [/^\s*(import SwiftUI|import Foundation|func \w+\(|let \w+: |guard let )/m, "snippet.swift"],
    [/^\s*(interface |type \w+ = |import .* from ['"]|export (const|function|default))/m, "snippet.ts"],
    [/^\s*(def |import \w+$|from \w+ import |print\()/m, "snippet.py"],
    [/^\s*(package main|func main\(\)|fmt\.)/m, "snippet.go"],
    [/^\s*(fn main\(\)|let mut |use std::|impl )/m, "snippet.rs"],
    [/^\s*(#!\/bin\/(ba|z)?sh|\$ |echo |export \w+=)/m, "snippet.sh"],
    [/^\s*(SELECT |INSERT |UPDATE |CREATE TABLE )/im, "snippet.sql"],
    [/^\s*(<!DOCTYPE|<html|<div|<\/)/im, "snippet.html"],
    [/^\s*(const |let |function |=> |console\.)/m, "snippet.js"],
    [/^\s*#{1,6} /m, "snippet.md"],
  ];
  return rules.find(([pattern]) => pattern.test(source))?.[1] ?? "snippet.txt";
}
