import { hostname } from "node:os";

/**
 * Unique id for THIS running process (host + pid + random). Render can run
 * several copies of this exact server at once — when sessions fight
 * (REPLACED takeovers), this id in logs + /health tells you instantly
 * whether you are looking at one instance or a clone war.
 */
export const INSTANCE_ID = `${hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
