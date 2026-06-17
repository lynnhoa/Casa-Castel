/* ═══════════════════════════════════════════════════════════════════════════
 *  CASA CASTEL — RENTALS CONTRACT MODAL PATCH
 *  rentals-opencontract-patch.js
 *
 *  Replace the two "coming soon" blocks inside _aptOpenContract() in
 *  rentals-tab-apartments.js with the versions below.
 *
 *  Prerequisites:
 *    • rentals-kurzzeit.js   appended after rentals-tab-apartments.js
 *    • rentals-mietvertrag.js appended after rentals-tab-apartments.js
 *    • html2canvas and jsPDF loaded in rentals-index.html
 *      (same CDN tags already used in the WG app)
 *
 *  FIND this block (kurzzeit branch, lines ~1373):
 *  ─────────────────────────────────────────────────────────────────────────
 *    footer.innerHTML = `<button class="rm-btn--cancel" id="aptContractCancelBtn">Cancel</button><button class="rm-btn--pdf" disabled><i class="ti ti-printer"></i> PDF — coming soon</button>`;
 *
 *  REPLACE WITH:
 * ═══════════════════════════════════════════════════════════════════════════ */

// ── KURZZEIT BRANCH — replace the footer.innerHTML + add the click handler ──

    footer.innerHTML = `<button class="rm-btn--cancel" id="aptContractCancelBtn">Cancel</button><button class="rm-btn--pdf" id="aptKzPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;

    setTimeout(() => {
      document.getElementById('aptKzPdfBtn')?.addEventListener('click', async () => {
        const apt2       = appApartments.find(a => a.id === _aptContractId);
        if (!apt2) return;
        const mieterName = document.getElementById('apt-cm-name')?.value.trim();
        const mieterAdr  = document.getElementById('apt-cm-adr')?.value.trim();
        const mieterDob  = document.getElementById('apt-cm-dob')?.value.trim();
        const mieterEmail= document.getElementById('apt-cm-email')?.value.trim();
        const startVal   = document.getElementById('apt-cm-start')?.value;
        const endVal     = document.getElementById('apt-cm-end')?.value;
        const sigVal     = document.getElementById('apt-cm-sig')?.value;
        const kautionVal = document.getElementById('apt-cm-kaution')?.value;

        if (!mieterName) { alert('Bitte Mietername eingeben.');  return; }
        if (!startVal)   { alert('Bitte Mietbeginn auswählen.'); return; }
        if (!endVal)     { alert('Bitte Mietende angeben.');     return; }

        const data = _buildRentalKurzzeitData(apt2, appSettings, {
          mieterName, mieterAdr, mieterDob, mieterEmail,
          startVal, endVal, sigVal, kautionVal,
        });
        const html = _renderRentalKurzzeitHTML(data);

        let container = document.getElementById('_pdfRenderContainer');
        if (container) container.remove();
        container = document.createElement('div');
        container.id = '_pdfRenderContainer';
        container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
        container.innerHTML = html;
        document.body.appendChild(container);
        await document.fonts.ready;

        if (window.innerWidth >= 701) {
          _openPdfPreview('Kurzzeitmiete', _generateRentalKurzzeitPDF);
        } else {
          await _generateRentalKurzzeitPDF();
        }
      });
    }, 0);


/* ═══════════════════════════════════════════════════════════════════════════
 *  FIND this block (mietvertrag branch, lines ~1382):
 *  ─────────────────────────────────────────────────────────────────────────
 *    footer.innerHTML = `<button class="rm-btn--cancel" id="aptContractCancelBtn">Cancel</button><button class="rm-btn--pdf" disabled><i class="ti ti-printer"></i> PDF — coming soon</button>`;
 *
 *  REPLACE WITH:
 * ═══════════════════════════════════════════════════════════════════════════ */

// ── MIETVERTRAG BRANCH — replace the footer.innerHTML + add the click handler ──

    footer.innerHTML = `<button class="rm-btn--cancel" id="aptContractCancelBtn">Cancel</button><button class="rm-btn--pdf" id="aptMvPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;

    setTimeout(() => {
      document.getElementById('aptMvPdfBtn')?.addEventListener('click', async () => {
        const apt2       = appApartments.find(a => a.id === _aptContractId);
        if (!apt2) return;
        const mieterName        = document.getElementById('apt-mv-name')?.value.trim();
        const mieterAdr         = document.getElementById('apt-mv-adr')?.value.trim();
        const mieterDob         = document.getElementById('apt-mv-dob')?.value.trim();
        const mieterEmail       = document.getElementById('apt-mv-email')?.value.trim();
        const startVal          = document.getElementById('apt-mv-start')?.value;
        const sigVal            = document.getElementById('apt-mv-sig')?.value;
        const befristet         = document.getElementById('apt-mv-befristung-btn')?.dataset.mode === 'befristet';
        const endVal            = befristet ? document.getElementById('apt-mv-end')?.value : null;
        const grundVal          = befristet ? (document.querySelector('input[name="apt-mv-grund"]:checked')?.value || '') : '';
        const eigenbedarfPerson = grundVal === 'eigenbedarf'
          ? document.getElementById('apt-mv-eigenbedarf-person')?.value.trim() : '';

        if (!mieterName) { alert('Bitte Mietername eingeben.'); return; }
        if (!startVal)   { alert('Bitte Mietbeginn auswählen.'); return; }
        if (befristet && !endVal) { alert('Bitte Mietende angeben.'); return; }
        if (befristet && grundVal === 'eigenbedarf' && !eigenbedarfPerson) {
          alert('Bitte Eigenbedarfsperson angeben (gesetzliche Pflicht).'); return;
        }

        // Map apt fields to the shape _buildRentalMietvertragData expects
        const apt2Room = {
          ...apt2,
          name:              apt2.name,
          flaeche_m2:        apt2.flaeche_m2,
          gemeinschaftsraeume: [],
          haustuerschluessel:  apt2.schlussel?.haustuerschluessel ?? 1,
          zimmerschluessel:    apt2.schlussel?.wohnungsschluessel ?? 1,
          kaltmiete:           apt2.pricing?.kaltmiete,
          nk_pauschale:        apt2.pricing?.nk_pauschale,
          mietvertrag_pricing: 'kalt_nk',
          kaution_override:    apt2.pricing?.kaution_override,
          kaution_default:     apt2.pricing?.kaution_default,
          inventar:            apt2.inventar || [],
        };

        const data = _buildRentalMietvertragData(apt2Room, appSettings, {
          mieterName, mieterAdr, mieterDob, mieterEmail, startVal, sigVal,
          befristet, endVal, grundVal, eigenbedarfPerson,
        });
        const html = _renderRentalMietvertragHTML(data);

        let container = document.getElementById('_pdfRenderContainer');
        if (container) container.remove();
        container = document.createElement('div');
        container.id = '_pdfRenderContainer';
        container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
        container.innerHTML = html;
        document.body.appendChild(container);
        await document.fonts.ready;

        if (window.innerWidth >= 701) {
          _openPdfPreview('Mietvertrag', _generateRentalMietvertragPDF);
        } else {
          await _generateRentalMietvertragPDF();
        }
      });

      document.getElementById('apt-mv-start')?.addEventListener('input', _aptUpdateMvMonatToggle);
    }, 0);
