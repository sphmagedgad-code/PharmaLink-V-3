/**
 * PharmaLink OS - Sales Opportunity Detection
 * FROZEN BUSINESS DECISION: this module only DETECTS and DISPLAYS
 * potential buyer/seller matches. It never creates a Deal, never sets
 * a commission, and never auto-confirms anything. Only an explicit
 * user action (the Opportunities screen's "convert" button) creates a
 * Deal, via the normal dealsRepo.addDeal path.
 *
 * Reuses existing architecture only: parsedEntitiesRepo for recent buy
 * requests, matchSupplier.js for seller price matching, dealsRepo to
 * check whether a matching deal already exists (so a converted or
 * already-handled opportunity doesn't keep resurfacing).
 */

import { getRecentEntities } from '../db/repositories/parsedEntitiesRepo.js';
import { getDealsByBuyer } from '../db/repositories/dealsRepo.js';
import { matchSellersForMedicine } from './matchSupplier.js';
import { DEAL_STATUS, PARSED_ENTITY_TYPE } from '../shared/constants.js';

/**
 * @param {number} scanLimit - how many recent parsed entities to scan
 * (bounded read via the existing cursor-based repo method - never a
 * full-store scan, consistent with the 500k-message scale decision).
 * @returns {Promise<Array<{ buyEntity: object, sellerMatches: Array<{contact:object, price:number, date:string}> }>>}
 */
export async function findSalesOpportunities(scanLimit = 300) {
  const recentEntities = await getRecentEntities(scanLimit);
  const buyEntities = recentEntities.filter((e) => e.type === PARSED_ENTITY_TYPE.BUY);

  const opportunities = [];
  const dealCheckCache = new Map(); // buyerId -> deals[]

  for (const buyEntity of buyEntities) {
    const sellerMatches = await matchSellersForMedicine(buyEntity.medicineId);
    if (sellerMatches.length === 0) continue;

    if (!dealCheckCache.has(buyEntity.contactId)) {
      dealCheckCache.set(buyEntity.contactId, await getDealsByBuyer(buyEntity.contactId));
    }
    const buyerDeals = dealCheckCache.get(buyEntity.contactId);
    const alreadyHandled = buyerDeals.some(
      (d) => d.medicineId === buyEntity.medicineId && d.status !== DEAL_STATUS.CANCELLED
    );
    if (alreadyHandled) continue;

    opportunities.push({ buyEntity, sellerMatches });
  }

  return opportunities;
}
