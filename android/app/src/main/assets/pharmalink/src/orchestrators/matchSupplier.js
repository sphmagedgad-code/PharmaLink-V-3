/**
 * PharmaLink OS - Seller Matching
 * Given a medicine, returns seller contacts who have quoted a price
 * for it, sorted cheapest-first. Price-based only - no AI weighting
 * (frozen decision). Filename kept as matchSupplier.js for continuity
 * with the originally frozen file list; the concept it now matches
 * against is a Contact with isSeller=true, not a separate Supplier.
 */

import { getSellers } from '../db/repositories/contactsRepo.js';

/**
 * @param {string} medicineId
 * @returns {Promise<Array<{ contact: object, price: number, date: string }>>}
 */
export async function matchSellersForMedicine(medicineId) {
  const sellers = await getSellers();
  const matches = [];

  for (const seller of sellers) {
    const entry = seller.lastPrices && seller.lastPrices[medicineId];
    if (entry) {
      matches.push({ contact: seller, price: entry.price, date: entry.date });
    }
  }

  matches.sort((a, b) => a.price - b.price);
  return matches;
}
