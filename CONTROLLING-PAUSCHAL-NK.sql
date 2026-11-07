-- ═══ Controlling · Pauschal NK part (optional repair, Nov 2026 · safe to run twice) ═══
-- Controlling › tenant history › "Confirm as rent from move-in" saved a Casa Castel Pauschale WITHOUT the NK part
-- inside it ("davon NK"). From then on Controlling counted the whole Pauschale as Kaltmiete, and Settlements counted
-- that NK as your own cost. The app is fixed (it keeps the NK part now); this puts it back for entries saved before.
--
-- "Add rent from a date" did the same to the rent it carried over from the tenant (the months before the new rent).
-- It touches only rent entries made by those two (note 'confirmed in tenant history' / 'Miete vom Mieter übernommen') where:
--   · the Pauschale is exactly Kaltmiete + Nebenkosten as still saved with the tenant, and
--   · the NK part of the entry is empty, while the tenant has Nebenkosten saved.
-- Nothing else changes. No rows → nothing was affected.

-- 1 · Preview: run this first — these entries get their NK part back
select rp.id, t.first_name, t.last_name, t.room, rp.valid_from, rp.pauschale, t.nebenkosten as nk_part_back
from rent_periods rp
join tenant_records t on t.id::text = rp.tenant_id
where rp.app = 'casa' and rp.mode = 'pauschal' and rp.note in ('confirmed in tenant history', 'Miete vom Mieter übernommen')
  and coalesce(rp.nebenkosten, 0) = 0 and coalesce(t.nebenkosten, 0) > 0
  and round(rp.pauschale * 100) = round((coalesce(t.kaltmiete, 0) + t.nebenkosten) * 100);

-- 2 · Repair
update rent_periods rp
set nebenkosten = t.nebenkosten, updated_at = now()
from tenant_records t
where t.id::text = rp.tenant_id
  and rp.app = 'casa' and rp.mode = 'pauschal' and rp.note in ('confirmed in tenant history', 'Miete vom Mieter übernommen')
  and coalesce(rp.nebenkosten, 0) = 0 and coalesce(t.nebenkosten, 0) > 0
  and round(rp.pauschale * 100) = round((coalesce(t.kaltmiete, 0) + t.nebenkosten) * 100);
