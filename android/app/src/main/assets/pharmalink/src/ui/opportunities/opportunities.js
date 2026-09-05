/**
 * PharmaLink OS - Sales Opportunities Screen
 * Shows detected buyer/seller matches from WhatsApp data. Nothing on
 * this screen creates a Deal by itself - the person must explicitly
 * press "Convert to Deal" on a specific match (frozen decision: no
 * automatic Deal creation, no automatic commission, no automatic
 * confirmation).
 */

import { findSalesOpportunities } from '../../orchestrators/findSalesOpportunities.js';
import { getMedicineById } from '../../db/repositories/medicinesRepo.js';
import { getContactById } from '../../db/repositories/contactsRepo.js';
import { addDeal } from '../../db/repositories/dealsRepo.js';

let opportunities = [];

function opportunityCard(opportunity, index, medicine, buyer) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  const bestMatch = opportunity.sellerMatches[0];
  const urgentStrip = opportunity.buyEntity.isUrgent ? '<div class="entity-card__urgent-strip">🔥 طلب عاجل - فرصة سريعة</div>' : '';

  card.innerHTML = `
    ${urgentStrip}
    <div class="entity-card__header">
      <span class="entity-card__title">${medicine ? medicine.name : opportunity.buyEntity.rawMedicineText}</span>
      <span class="badge badge--deal">فرصة بيع</span>
    </div>
    <div class="entity-card__section">
      <div class="entity-card__section-label">المشتري</div>
      <div class="entity-row"><span class="entity-row__title">${buyer ? buyer.name : opportunity.buyEntity.phone}</span><span class="entity-row__meta">${opportunity.buyEntity.phone}</span></div>
      <div class="entity-card__section-label">أفضل ${opportunity.sellerMatches.length} عرض من الموردين</div>
      ${opportunity.sellerMatches
        .slice(0, 3)
        .map(
          (m) => `
        <div class="entity-row">
          <span class="entity-row__title">${m.contact.name}</span>
          <span class="entity-row__info"><span class="entity-row__price">${m.price} ج</span></span>
        </div>`
        )
        .join('')}
    </div>
    <div class="price-row">
      <div>
        <div class="price-row__main">${bestMatch.price} ج</div>
        <div class="price-row__note">أفضل سعر متاح - ${bestMatch.contact.name}</div>
      </div>
      <span class="price-row__badge">جاهزة للتحويل</span>
    </div>
    <div class="entity-card__action">
      <button class="btn btn--gold" data-action="convert" data-index="${index}" style="flex:1">تحويل إلى صفقة</button>
    </div>
  `;
  return card;
}

async function refreshList(mountEl) {
  const listEl = mountEl.querySelector('#opportunities-list');
  listEl.innerHTML = '';

  if (opportunities.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🎯</div><p>لا توجد فرص بيع مطابقة حاليًا</p></div>`;
    return;
  }

  for (let i = 0; i < opportunities.length; i += 1) {
    const opportunity = opportunities[i];
    const [medicine, buyer] = await Promise.all([
      getMedicineById(opportunity.buyEntity.medicineId),
      getContactById(opportunity.buyEntity.contactId),
    ]);
    listEl.appendChild(opportunityCard(opportunity, i, medicine, buyer));
  }
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div class="welcome" style="padding:20px 4px 8px;">
      <h2 style="color:var(--gold)">فرص البيع</h2>
      <p>مطابقات محتملة بين طلبات الشراء والعروض المتاحة - أنت من يقرر تحويلها إلى صفقة</p>
    </div>
    <div id="opportunities-list"></div>
  `;

  opportunities = await findSalesOpportunities();
  await refreshList(mountEl);

  mountEl.querySelector('#opportunities-list').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-action="convert"]');
    if (!button) return;

    const opportunity = opportunities[Number(button.dataset.index)];
    const bestMatch = opportunity.sellerMatches[0];
    const confirmed = window.confirm(
      `تحويل هذه الفرصة إلى صفقة معلقة بسعر ${bestMatch.price} ج مع ${bestMatch.contact.name}؟`
    );
    if (!confirmed) return;

    await addDeal({
      medicineId: opportunity.buyEntity.medicineId,
      buyerId: opportunity.buyEntity.contactId,
      sellerId: bestMatch.contact.id,
      quantity: opportunity.buyEntity.quantity || 1,
      price: bestMatch.price,
    });

    opportunities = opportunities.filter((_, i) => i !== Number(button.dataset.index));
    await refreshList(mountEl);
  });
}
