/**
 * Host half of the `dsh-turn-quote` bundle.
 *
 * The capability lives entirely in the browser: the Client module registers an
 * `@` trigger source that lists earlier turns of the current Session and turns
 * a pick into an inline reference chip whose codec expands to the quoted text
 * at submit time. The Host therefore contributes no rows, services, or tools —
 * this entry only carries the bundle's patch and display metadata.
 */
export function apply() {}