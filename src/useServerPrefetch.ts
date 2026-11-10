// packages/features/crud/src/useServerPrefetch.ts

/**
 * @fileoverview useServerPrefetch - Internal server-render prefetch for CRUD queries
 * @description Shared by useBaseCrudList and useCrudDoc. Not exported to consumers.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import {
  hasProvider,
  isClient,
  useAuthSessionSnapshot,
  useQueryClient,
} from '@donotdev/core';
import type { ScopeConfig } from '@donotdev/core';

import { getCrudServiceInstance } from './useCrud';

/** A CRUD query descriptor (`getListQueryOptions` / `getDocQueryOptions`). */
interface PrefetchableQuery<TData> {
  readonly queryKey: readonly unknown[];
  readonly queryFn: (context: { client: object }) => Promise<TData>;
  readonly staleTime: number;
}

/**
 * Server render: fetch the query before rendering, so the HTML carries the data and the
 * streamed hydration (NextJsAppProviders) seeds the browser cache under the same key:
 * the first paint is final (no loading → content swap, image in the initial HTML).
 * Signed-out visitors read with the public role; signed-in visitors with their own
 * access token (adapter.forAccessToken; the database verifies it), i.e. exactly what
 * their browser would read. Without a usable token (or an adapter that cannot read
 * as a token holder) the browser loads it. Scoped (tenant) entities never prefetch.
 *
 * No-op in the browser. Call unconditionally (it calls hooks).
 *
 * "Settled" is read from the cache entry, not from the observer result: on the retry
 * render the observer masks a stored error (retryOnMount: it plans a fetch on mount,
 * which never happens on the server), and suspending again would repeat the failed
 * read forever.
 *
 * @param query - Query descriptor, or null while the CRUD service is not ready
 * @param enabled - The calling hook's `enabled` option
 * @param scope - Entity scope; scoped entities are never prefetched
 * @throws {Promise<undefined>} Suspends the render until the read settles
 * @internal
 */
export function useServerPrefetch<TData>(
  query: PrefetchableQuery<TData> | null,
  enabled: boolean,
  scope: ScopeConfig | undefined
): void {
  const queryClient = useQueryClient();
  const sessionSnapshot = useAuthSessionSnapshot();
  if (isClient() || !enabled || !query || scope) return;

  const state = queryClient.getQueryState(query.queryKey);
  if (state && (state.data !== undefined || state.error)) return;

  const signedOut = !hasProvider('auth') || sessionSnapshot?.user === null;
  const canRead =
    signedOut ||
    (!!sessionSnapshot?.user &&
      !!sessionSnapshot.accessToken &&
      !!getCrudServiceInstance()?.bindRequestAccessToken(
        queryClient,
        sessionSnapshot.accessToken
      ));
  if (!canRead) return;

  // Thrown, not `use()`d: the hooks of one component suspend one after another, and
  // React's `use()` replays an earlier hook's settled promise in the same slot,
  // rendering this hook without its data (TanStack's suspense throws too). A failed
  // read settles to undefined: the retry sees the error, renders loading, and the
  // browser (which receives no data for it) fetches it again — same first paint.
  throw queryClient.fetchQuery(query).then(
    () => undefined,
    () => undefined
  );
}
