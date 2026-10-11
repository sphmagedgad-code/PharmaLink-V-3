/**
 * PharmaLink OS - Search Index Repository
 * The central search engine (per the frozen "search is first-class"
 * decision). Every other repository calls indexEntity()/removeEntity()
 * on every create/update/delete so searchIndex is always in sync -
 * search itself never scans the source stores directly.
 *
 * Query strategy: the FIRST significant query token is looked up via
 * the `by_token` index using a prefix IDBKeyRange (bounded, indexed -
 * never a full-store scan). That narrows candidates to a small set of
 * entityRefs. Only that small candidate set is then checked in memory
 * against any remaining query tokens. This stays fast at 500k+ rows
 * because the expensive part (the index range scan) is bounded by the
 * prefix, not the store size.
 */

import { getDatabase } from '../connection.js';
import { requestToPromise, runAtomicTransaction } from './transactions.js';
import { validateSearchIndexRow } from '../schemaGuards.js';
import { generateId } from '../schema.js';
import { STORE_NAMES, SEARCH_RESULT_LIMIT } from '../../shared/constants.js';
import { tokenize } from '../../shared/searchTokens.js';
import { wrapAsync } from '../../shared/errorHandler.js';

const STORE = STORE_NAMES.SEARCH_INDEX;

/**
 * Replaces all searchIndex rows for one entity with a fresh set built
 * from `tokens`. Safe to call on create AND update (removes stale
 * rows first) - this is what keeps the index synchronized.
 */
export const indexEntity = wrapAsync('searchIndexRepo.indexEntity', async function indexEntity(entityType, entityId, tokens, snippet) {
  const db = await getDatabase();
  const entityRef = `${entityType}:${entityId}`;

  const existingTx = db.transaction([STORE], 'readonly');
  const existingIndex = existingTx.objectStore(STORE).index('by_entityRef');
  const existingRows = (await requestToPromise(existingIndex.getAll(entityRef))) || [];

  const newRows = Array.from(new Set(tokens)).map((token) => {
    const row = {
      id: generateId(),
      token,
      entityType,
      entityId,
      entityRef,
      snippet: snippet || '',
    };
    validateSearchIndexRow(row);
    return row;
  });

  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    const store = tx.objectStore(STORE);
    for (const row of existingRows) {
      store.delete(row.id);
    }
    for (const row of newRows) {
      store.add(row);
    }
  });
});

/** Removes every searchIndex row for one entity (used on delete). */
export const removeEntity = wrapAsync('searchIndexRepo.removeEntity', async function removeEntity(entityType, entityId) {
  const db = await getDatabase();
  const entityRef = `${entityType}:${entityId}`;

  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_entityRef');
  const rows = (await requestToPromise(index.getAll(entityRef))) || [];
  if (rows.length === 0) return;

  await runAtomicTransaction(db, [STORE], 'readwrite', (writeTx) => {
    const store = writeTx.objectStore(STORE);
    for (const row of rows) {
      store.delete(row.id);
    }
  });
});

/**
 * Runs a global search. Returns an array of unique { entityType,
 * entityId, snippet } matches, most-referenced-first, capped at
 * SEARCH_RESULT_LIMIT. `entityTypes` optionally restricts the result
 * to a subset (e.g. only 'contact').
 */
export const search = wrapAsync('searchIndexRepo.search', async function search(query, entityTypes = null) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const tokenIndex = tx.objectStore(STORE).index('by_token');
  const byEntityRef = new Map();

  // Search each token through the indexed prefix range. Keep a relevance
  // score so exact-token hits rank above prefix-only hits; no full-store scan.
  for (const queryToken of tokens) {
    const range = IDBKeyRange.bound(queryToken, queryToken + '\\uffff');
    const rows = (await requestToPromise(tokenIndex.getAll(range))) || [];
    for (const row of rows) {
      if (entityTypes && !entityTypes.includes(row.entityType)) continue;
      let result = byEntityRef.get(row.entityRef);
      if (!result) {
        result = {
          entityType: row.entityType,
          entityId: row.entityId,
          snippet: row.snippet || '',
          matchedQueryTokens: new Set(),
          exactQueryTokens: new Set(),
        };
        byEntityRef.set(row.entityRef, result);
      }
      result.matchedQueryTokens.add(queryToken);
      if (row.token === queryToken) result.exactQueryTokens.add(queryToken);
    }
  }

  // Keep AND semantics for precision: every meaningful query token must
  // be represented in the same entity. Then rank by coverage and exactness.
  const requiredTokenCount = tokens.length;
  const typeWeight = {
    [SEARCH_ENTITY_TYPE.MEDICINE]: 2,
    [SEARCH_ENTITY_TYPE.PARSED_ENTITY]: 2,
    [SEARCH_ENTITY_TYPE.CONTACT]: 1,
    [SEARCH_ENTITY_TYPE.DEAL]: 0.5,
    [SEARCH_ENTITY_TYPE.WHATSAPP_MESSAGE]: 0,
  };
  const results = Array.from(byEntityRef.values())
    .filter((result) => result.matchedQueryTokens.size === requiredTokenCount)
    .map((result) => ({
      entityType: result.entityType,
      entityId: result.entityId,
      snippet: result.snippet,
      score: result.matchedQueryTokens.size * 10 + result.exactQueryTokens.size * 8 + (typeWeight[result.entityType] || 0),
    }))
    .sort((a, b) => b.score - a.score);

  return results.slice(0, SEARCH_RESULT_LIMIT);
});
