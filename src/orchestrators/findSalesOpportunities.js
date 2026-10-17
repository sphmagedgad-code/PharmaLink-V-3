/**
 * PharmaLink OS - Ranked Sales Opportunity Detection.
 * Detects and displays potential matches only; it never creates or confirms
 * deals automatically. A user must explicitly convert an opportunity.
 *
 * Ranking is deterministic and explainable: urgency, medicine category,
 * freshness, estimated order value, and contact-data completeness contribute
 * to priority. The newest request for a buyer/medicine pair represents that
 * pair, preventing repeated requests from flooding the opportunity list.
 */

import { getRecentEntitiesByType } from '../db/repositories/parsedEntitiesRepo.js';
import { getDealsByBuyer } from '../db/repositories/dealsRepo.js';
import { getMedicineById } from '../db/repositories/medicinesRepo.js';
import { getContactById } from '../db/repositories/contactsRepo.js';
import { matchSellersForMedicine } from './matchSupplier.js';
import { DEAL_STATUS, PARSED_ENTITY_TYPE, MEDICINE_CATEGORY } from '../shared/constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function ageInDays(value, now) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? Math.max(0, (now - time) / DAY_MS) : Infinity;
}

function scoreOpportunity(buyEntity, medicine, buyer, sellerMatches, now) {
  const reasons = [];
  let score = 0;
  const category = medicine?.category;
  const ageDays = ageInDays(buyEntity.receivedAt, now);
  const best = sellerMatches[0];
  const estimatedValue = Number(best?.price || 0) * Number(buyEntity.quantity || 0);

  if (buyEntity.isUrgent) {
    score += 40;
    reasons.push('طلب عاجل');
  }
  if (buyEntity.isShortage) {
    score += 35;
    reasons.push('طلب بسبب نقص/عدم توافر');
  }

  if (category === MEDICINE_CATEGORY.SHORTAGE) {
    score += 35;
    reasons.push('دواء نقص');
  }
  if (category === MEDICINE_CATEGORY.HIGH_VALUE) {
    score += 25;
    reasons.push('دواء مرتفع القيمة');
  }
  if (category === MEDICINE_CATEGORY.CANCER) {
    score += 25;
    reasons.push('دواء أورام');
  }
  if (category === MEDICINE_CATEGORY.HORMONAL) {
    score += 15;
    reasons.push('دواء هرموني');
  }
  if (category === MEDICINE_CATEGORY.IMMUNOLOGY) {
    score += 15;
    reasons.push('دواء مناعي');
  }

  if (ageDays <= 1) {
    score += 20;
    reasons.push('طلب جديد خلال 24 ساعة');
  } else if (ageDays <= 3) {
    score += 12;
    reasons.push('طلب حديث');
  } else if (ageDays <= 7) {
    score += 5;
  }

  if (estimatedValue >= 10000) {
    score += 20;
    reasons.push('قيمة طلب مرتفعة');
  } else if (estimatedValue >= 3000) {
    score += 12;
    reasons.push('قيمة طلب جيدة');
  } else if (estimatedValue >= 1000) {
    score += 6;
  }

  // Data quality affects confidence in a match, not the medical priority.
  if (buyer?.whatsapp && buyer?.name) score += 5;
  if (buyEntity.phone) score += 3;
  if (Number(buyEntity.quantity) > 0) {
    score += 4;
    reasons.push('الكمية محددة');
  }
  if (best?.contact?.whatsapp && best?.contact?.name) {
    score += 5;
    reasons.push('بيانات المورد مكتملة');
  } else if (best?.contact?.whatsapp) {
    score += 2;
  }
  if (Number.isFinite(Date.parse(best?.date || '')) && ageInDays(best.date, now) <= 7) {
    score += 5;
    reasons.push('سعر المورد حديث');
  }

  return {
    priorityScore: score,
    priorityReasons: reasons,
    estimatedValue: estimatedValue > 0 ? estimatedValue : null,
  };
}

/**
 * @param {number} scanLimit - number of recent parsed entities to inspect.
 * @returns {Promise<Array<{buyEntity: object, sellerMatches: Array, priorityScore: number, priorityReasons: string[], estimatedValue: number|null}>>}
 */
export async function findSalesOpportunities(scanLimit = 300) {
  const buyEntities = await getRecentEntitiesByType(PARSED_ENTITY_TYPE.BUY, scanLimit, Math.max(10000, scanLimit * 20));
  const opportunities = [];
  const dealCheckCache = new Map();
  const seenBuyerMedicinePairs = new Set();
  const medicineCache = new Map();
  const buyerCache = new Map();
  const now = Date.now();

  for (const buyEntity of buyEntities) {
    const buyerIdentity = buyEntity.contactId || buyEntity.phone || buyEntity.sourceMessageId || buyEntity.id;
    const pairKey = `${buyerIdentity}:${buyEntity.medicineId}`;
    // getRecentEntities returns newest first: keep the freshest request only.
    if (seenBuyerMedicinePairs.has(pairKey)) continue;
    seenBuyerMedicinePairs.add(pairKey);

    const sellerMatches = await matchSellersForMedicine(buyEntity.medicineId);
    if (sellerMatches.length === 0) continue;

    if (!dealCheckCache.has(buyEntity.contactId)) {
      dealCheckCache.set(buyEntity.contactId, await getDealsByBuyer(buyEntity.contactId));
    }
    const buyerDeals = dealCheckCache.get(buyEntity.contactId);
    const alreadyHandled = buyerDeals.some(
      (deal) => deal.medicineId === buyEntity.medicineId && deal.status !== DEAL_STATUS.CANCELLED
    );
    if (alreadyHandled) continue;

    let medicine = medicineCache.get(buyEntity.medicineId);
    if (medicine === undefined) {
      medicine = await getMedicineById(buyEntity.medicineId);
      medicineCache.set(buyEntity.medicineId, medicine || null);
    }
    let buyer = buyerCache.get(buyEntity.contactId);
    if (buyer === undefined) {
      buyer = buyEntity.contactId ? await getContactById(buyEntity.contactId) : null;
      buyerCache.set(buyEntity.contactId, buyer || null);
    }
    const scored = scoreOpportunity(buyEntity, medicine, buyer, sellerMatches, now);
    opportunities.push({
      buyEntity,
      sellerMatches,
      medicineCategory: medicine?.category || MEDICINE_CATEGORY.GENERAL,
      ...scored,
    });
  }

  opportunities.sort((a, b) =>
    b.priorityScore - a.priorityScore ||
    (Date.parse(b.buyEntity.receivedAt) || 0) - (Date.parse(a.buyEntity.receivedAt) || 0)
  );
  return opportunities;
}
