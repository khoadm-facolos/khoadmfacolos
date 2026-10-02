/**
 * =========================================================================
 * FACOLOS FINANCIAL REPORTING SYSTEM (BCTC) - UI CONTROLLER
 * Thiết kế đồng bộ chuẩn hệ thống Facolos Executive Dashboard
 * Chỉ hiển thị 03 Báo cáo Tài chính: B01-DN (CĐKT), B02-DN (KQKD), B03-DN (LCTT)
 * =========================================================================
 */

(function () {
  'use strict';

  const BCTC_MODULE = {
    regime: 'TT200',           // 'TT200' | 'TT133'
    periodMode: 'MTD',         // 'MTD' | 'YTD' | 'FULL_YEAR'
    activeSubTab: 'b01',       // 'b01' | 'b02' | 'b03'
    lcttMethod: 'INDIRECT',    // 'INDIRECT' | 'DIRECT'
    collapsedNodes: new Set(),
    searchQuery: '',

    init: function () {
      this.bindEvents();
    },

    bindEvents: function () {},

    getMonth: function () {
      if (window.BCTC_LOGIC && typeof window.BCTC_LOGIC.getSelectedMonth === 'function') {
        return window.BCTC_LOGIC.getSelectedMonth();
      }
      const el = document.getElementById('monthSelect');
      if (el && el.value) {
        const val = parseInt(el.value, 10);
        if (val >= 1 && val <= 12) return val;
      }
      return 8;
    },

    getYear: function () {
      const el = document.getElementById('yearSelect');
      return el && el.value ? el.value : '2026';
    },

    setRegime: function (val) {
      this.regime = val;
      const badgeEl = document.getElementById('bctcRegimeBadge');
      if (badgeEl) {
        badgeEl.textContent = val === 'TT200' ? 'Thông tư 200/2014/TT-BTC' : 'Thông tư 133/2016/TT-BTC';
      }
      const selectEl = document.getElementById('bctcRegimeSelect');
      if (selectEl && selectEl.value !== val) selectEl.value = val;
      this.render();
    },

    setPeriodMode: function (val) {
      this.periodMode = val;
      const selectEl = document.getElementById('bctcPeriodModeSelect');
      if (selectEl && selectEl.value !== val) selectEl.value = val;
      this.render();
    },

    setLcttMethod: function (val) {
      this.lcttMethod = val;
      const selectEl = document.getElementById('b03MethodSelect');
      if (selectEl && selectEl.value !== val) selectEl.value = val;
      this.renderB03();
    },

    switchSubTab: function (subtab, btn) {
      this.activeSubTab = subtab;
      const container = document.getElementById('panel-bctc');
      if (container) {
        container.querySelectorAll('.toggle-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.subtab === subtab);
        });
      }

      ['b01', 'b02', 'b03'].forEach(tab => {
        const el = document.getElementById('bctc-subview-' + tab);
        if (el) el.style.display = (tab === subtab) ? 'block' : 'none';
      });

      const lcttWrap = document.getElementById('bctcLcttMethodWrap');
      if (lcttWrap) lcttWrap.style.display = (subtab === 'b03') ? 'flex' : 'none';

      this.updateHeaderMeta();
      this.renderActiveSubTab();
    },

    toggleAllTree: function (expand) {
      if (expand === undefined) expand = this.collapsedNodes.size > 0;
      this.collapsedNodes.clear();
      if (!expand) {
        const data = this.getActiveData();
        if (data && data.rows) {
          data.rows.forEach(r => {
            if (r.level <= 2) this.collapsedNodes.add(r.code);
          });
        }
      }
      this.renderActiveSubTab();
    },

    toggleTreeNode: function (code) {
      if (this.collapsedNodes.has(code)) {
        this.collapsedNodes.delete(code);
      } else {
        this.collapsedNodes.add(code);
      }
      this.renderActiveSubTab();
    },

    handleSearch: function (query) {
      this.searchQuery = (query || '').toLowerCase().trim();
      const clearBtn = document.getElementById('bctcSearchClear');
      if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
      this.renderActiveSubTab();
    },

    exportExcel: function () {
      if (window.BCTC_LOGIC && typeof window.BCTC_LOGIC.exportExcel === 'function') {
        window.BCTC_LOGIC.exportExcel(this.regime, this.periodMode, this.getMonth());
      }
    },

    getActiveData: function () {
      const m = this.getMonth();
      if (!window.BCTC_LOGIC) return null;
      if (this.activeSubTab === 'b01') return window.BCTC_LOGIC.getB01Data(this.regime, this.periodMode, m);
      if (this.activeSubTab === 'b02') return window.BCTC_LOGIC.getB02Data(this.regime, this.periodMode, m);
      if (this.activeSubTab === 'b03') return window.BCTC_LOGIC.getB03Data(this.regime, this.lcttMethod, this.periodMode, m);
      return null;
    },

    updateHeaderMeta: function () {
      const m = this.getMonth();
      const y = this.getYear();
      const metaEl = document.getElementById('bctcHeaderMeta');
      if (!metaEl) return;

      const lastDay = (m === 2) ? 28 : ([4, 6, 9, 11].includes(m) ? 30 : 31);

      let text = '';
      if (this.periodMode === 'FULL_YEAR') {
        text = `Kỳ báo cáo: Cả năm ${y} (Chi tiết các tháng)`;
      } else if (this.periodMode === 'YTD') {
        text = this.activeSubTab === 'b01'
          ? `Thời điểm: 01/01/${y} đến ${lastDay}/${String(m).padStart(2, '0')}/${y}`
          : `Kỳ báo cáo: Lũy kế từ Tháng 1 đến Tháng ${m}/${y}`;
      } else {
        text = this.activeSubTab === 'b01'
          ? `Tại ngày: ${lastDay}/${String(m).padStart(2, '0')}/${y}`
          : `Kỳ báo cáo: Tháng ${m}/${y}`;
      }

      metaEl.textContent = text;
    },

    render: function () {
      if (!window.BCTC_LOGIC) return;
      this.updateHeaderMeta();
      this.renderActiveSubTab();
    },

    renderActiveSubTab: function () {
      if (this.activeSubTab === 'b01') this.renderB01();
      else if (this.activeSubTab === 'b02') this.renderB02();
      else if (this.activeSubTab === 'b03') this.renderB03();
    },

    getUnclosedNotice: function (m, y, hasData) {
      if (hasData) return '';
      return `
        <div class="bctc-unclosed-notice" style="margin-bottom:14px; padding:12px 18px; border-radius:10px; background:rgba(229,193,124,0.12); border:1px solid rgba(229,193,124,0.4); display:flex; align-items:center; justify-content:space-between; font-size:13px; color:#b45309; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:16px;">⚠️</span>
            <span><strong>Tháng ${m}/${y}:</strong> Kỳ báo cáo chưa chốt sổ BCTC. Dữ liệu BCTC đã chốt hiện có từ <strong>Tháng 1 đến Tháng 6/${y}</strong>.</span>
          </div>
          <button type="button" onclick="const sel=document.getElementById('monthSelect'); if(sel){sel.value='6'; sel.dispatchEvent(new Event('change'));}" style="border:none; background:#0e3d34; color:#e5c17c; padding:6px 14px; border-radius:6px; font-weight:700; cursor:pointer; font-size:12px; white-space:nowrap;">Xem kỳ chốt gần nhất (T6/${y}) →</button>
        </div>
      `;
    },

    // -------------------------------------------------------------
    // BẢNG 1: B01-DN (BẢNG CÂN ĐỐI KẾ TOÁN)
    // -------------------------------------------------------------
    renderB01: function () {
      const container = document.getElementById('b01TableContainer');
      if (!container) return;

      const m = this.getMonth();
      const y = this.getYear();
      const b01 = window.BCTC_LOGIC.getB01Data(this.regime, this.periodMode, m);
      const rows = b01.rows;
      const months = b01.availableMonths || window.BCTC_LOGIC.getAvailableMonths();

      const q = this.searchQuery;
      const filtered = q ? rows.filter(r => r.name.toLowerCase().includes(q) || r.code.includes(q)) : rows;

      let theadHtml = '';
      if (this.periodMode === 'FULL_YEAR') {
        const monthCols = months.map(mon => `<th class="num" style="min-width:105px;">T${mon}/${y.slice(-2)}</th>`).join('');
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:320px;">Chỉ tiêu Kế toán</th>
              <th style="width:70px; text-align:center;">Mã số</th>
              <th style="width:85px; text-align:center;">Thuyết minh</th>
              ${monthCols}
              <th class="num" style="min-width:130px; background:var(--brand-dark, #071F1A) !important;">Số cuối kỳ (T${m})</th>
              <th class="num" style="min-width:90px;">Tỷ trọng</th>
            </tr>
          </thead>
        `;
      } else if (this.periodMode === 'YTD') {
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:340px;">Chỉ tiêu Kế toán</th>
              <th style="width:75px; text-align:center;">Mã số</th>
              <th style="width:90px; text-align:center;">Thuyết minh</th>
              <th class="num" style="min-width:140px;">Số cuối kỳ (T${m}/${y})</th>
              <th class="num" style="min-width:140px;">Số đầu năm (01/01/${y})</th>
              <th class="num" style="min-width:120px;">Chênh lệch (YTD)</th>
              <th class="num" style="min-width:95px;">Tỷ trọng</th>
            </tr>
          </thead>
        `;
      } else {
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:340px;">Chỉ tiêu Kế toán</th>
              <th style="width:75px; text-align:center;">Mã số</th>
              <th style="width:90px; text-align:center;">Thuyết minh</th>
              <th class="num" style="min-width:140px;">Số cuối kỳ (T${m}/${y})</th>
              <th class="num" style="min-width:140px;">Số đầu kỳ (T${m > 1 ? m - 1 : 1}/${y})</th>
              <th class="num" style="min-width:120px;">Chênh lệch (MTD)</th>
              <th class="num" style="min-width:95px;">Tỷ trọng</th>
            </tr>
          </thead>
        `;
      }

      let tbodyHtml = '<tbody>';
      filtered.forEach(r => {
        const isCollapsed = this.isRowHiddenByParent(r, rows);
        if (isCollapsed && !q) return;

        const hasChildren = this.hasChildren(r.code, rows);
        const isNodeCollapsed = this.collapsedNodes.has(r.code);
        const indentPx = (r.level - 1) * 20;

        let rowCls = `row-l${Math.min(r.level, 3)}`;
        if (['280', '440', '250', '500'].includes(r.code)) rowCls = 'row-total';

        const treeBtn = hasChildren ? `
          <span class="bctc-tree-btn" onclick="event.stopPropagation(); BCTC_MODULE.toggleTreeNode('${r.code}')">
            ${isNodeCollapsed ? '+' : '−'}
          </span>
        ` : `<span class="bctc-tree-spacer"></span>`;

        if (this.periodMode === 'FULL_YEAR') {
          const monthTds = months.map(mon => {
            const v = (r.monthlyVals && r.monthlyVals[mon] !== undefined) ? r.monthlyVals[mon] : null;
            return `<td class="num">${this.fmt(v)}</td>`;
          }).join('');

          tbodyHtml += `
            <tr class="${rowCls}">
              <td class="sticky-col" style="padding-left: ${12 + indentPx}px;">
                ${treeBtn}
                <span>${r.name}</span>
              </td>
              <td style="text-align:center;"><span class="bctc-code-badge">${r.code}</span></td>
              <td style="text-align:center; color:var(--muted);">${r.thuyetMinh || '—'}</td>
              ${monthTds}
              <td class="num" style="font-weight:700; ${r.isNegative ? 'color:var(--down);' : ''}">${this.fmt(r.curVal)}</td>
              <td class="num" style="color:var(--muted);">${r.structurePct ? (r.structurePct.toFixed(1) + '%') : '—'}</td>
            </tr>
          `;
        } else {
          const diffStr = (r.diff === null || r.diff === undefined) ? '—' : (r.diff > 0 ? `+${this.fmt(r.diff)}` : (r.diff < 0 ? this.fmt(r.diff) : '0,000'));
          const diffColor = (r.diff === null || r.diff === undefined) ? 'var(--muted)' : (r.diff > 0 ? 'var(--up)' : (r.diff < 0 ? 'var(--down)' : 'var(--muted)'));

          tbodyHtml += `
            <tr class="${rowCls}">
              <td class="sticky-col" style="padding-left: ${12 + indentPx}px;">
                ${treeBtn}
                <span>${r.name}</span>
              </td>
              <td style="text-align:center;"><span class="bctc-code-badge">${r.code}</span></td>
              <td style="text-align:center; color:var(--muted);">${r.thuyetMinh || '—'}</td>
              <td class="num" style="${r.isNegative ? 'color:var(--down);' : ''}">${this.fmt(r.curVal)}</td>
              <td class="num" style="color:var(--muted);">${this.fmt(r.compVal)}</td>
              <td class="num" style="color:${diffColor}; font-weight:600;">${diffStr}</td>
              <td class="num" style="color:var(--muted);">${r.structurePct ? (r.structurePct.toFixed(1) + '%') : '—'}</td>
            </tr>
          `;
        }
      });
      tbodyHtml += '</tbody>';

      const hasData = rows.some(r => r.curVal !== null && r.curVal !== undefined);
      const noticeHtml = this.getUnclosedNotice(m, y, hasData);
      container.innerHTML = `${noticeHtml}<table class="detail-table bctc-table">${theadHtml}${tbodyHtml}</table>`;
    },

    // -------------------------------------------------------------
    // BẢNG 2: B02-DN (KẾT QUẢ KINH DOANH)
    // -------------------------------------------------------------
    renderB02: function () {
      const container = document.getElementById('b02TableContainer');
      if (!container) return;

      const m = this.getMonth();
      const y = this.getYear();
      const b02 = window.BCTC_LOGIC.getB02Data(this.regime, this.periodMode, m);
      const rows = b02.rows;
      const months = b02.availableMonths || window.BCTC_LOGIC.getAvailableMonths();

      const q = this.searchQuery;
      const filtered = q ? rows.filter(r => r.name.toLowerCase().includes(q) || r.code.includes(q)) : rows;

      let theadHtml = '';
      if (this.periodMode === 'FULL_YEAR') {
        const monthCols = months.map(mon => `<th class="num" style="min-width:105px;">T${mon}/${y.slice(-2)}</th>`).join('');
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:320px;">Chỉ tiêu Doanh thu & Chi phí</th>
              <th style="width:70px; text-align:center;">Mã số</th>
              <th style="width:85px; text-align:center;">Thuyết minh</th>
              ${monthCols}
              <th class="num" style="min-width:130px; background:var(--brand-dark, #071F1A) !important;">Cả năm (Lũy kế)</th>
              <th class="num" style="min-width:100px;">% / DTT cả năm</th>
            </tr>
          </thead>
        `;
      } else if (this.periodMode === 'YTD') {
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:340px;">Chỉ tiêu Doanh thu & Chi phí</th>
              <th style="width:75px; text-align:center;">Mã số</th>
              <th style="width:90px; text-align:center;">Thuyết minh</th>
              <th class="num" style="min-width:140px;">Lũy kế YTD (T1 - T${m}/${y})</th>
              <th class="num" style="min-width:140px;">Kỳ này MTD (T${m}/${y})</th>
              <th class="num" style="min-width:110px;">% / DTT (YTD)</th>
              <th class="num" style="min-width:110px;">% / DTT (MTD)</th>
            </tr>
          </thead>
        `;
      } else {
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:340px;">Chỉ tiêu Doanh thu & Chi phí</th>
              <th style="width:75px; text-align:center;">Mã số</th>
              <th style="width:90px; text-align:center;">Thuyết minh</th>
              <th class="num" style="min-width:140px;">Kỳ này MTD (T${m}/${y})</th>
              <th class="num" style="min-width:140px;">Kỳ trước (T${m > 1 ? m - 1 : 1}/${y})</th>
              <th class="num" style="min-width:120px;">Chênh lệch (MTD)</th>
              <th class="num" style="min-width:110px;">% / DTT (MTD)</th>
            </tr>
          </thead>
        `;
      }

      let tbodyHtml = '<tbody>';
      filtered.forEach(r => {
        let rowCls = `row-l${Math.min(r.level, 3)}`;
        if (['10', '20', '30', '50', '60'].includes(r.code)) rowCls = 'row-total';

        const indentPx = (r.level - 1) * 18;

        if (this.periodMode === 'FULL_YEAR') {
          const monthTds = months.map(mon => {
            const v = (r.monthlyVals && r.monthlyVals[mon] !== undefined) ? r.monthlyVals[mon] : null;
            const isNeg = v !== null && v < 0;
            return `<td class="num" style="${isNeg ? 'color:var(--down);' : ''}">${this.fmt(v)}</td>`;
          }).join('');

          const isNegTot = r.fullYearVal < 0;
          tbodyHtml += `
            <tr class="${rowCls}">
              <td class="sticky-col" style="padding-left: ${14 + indentPx}px;">
                <span>${r.name}</span>
              </td>
              <td style="text-align:center;"><span class="bctc-code-badge">${r.code}</span></td>
              <td style="text-align:center; color:var(--muted);">${r.thuyetMinh || '—'}</td>
              ${monthTds}
              <td class="num" style="font-weight:700; ${isNegTot ? 'color:var(--down);' : ''}">${this.fmt(r.fullYearVal)}</td>
              <td class="num" style="color:var(--muted);">${r.marginFullYearPct !== null ? (r.marginFullYearPct.toFixed(1) + '%') : '—'}</td>
            </tr>
          `;
        } else if (this.periodMode === 'YTD') {
          const isNegMtd = r.mtdVal < 0;
          const isNegYtd = r.ytdVal < 0;
          tbodyHtml += `
            <tr class="${rowCls}">
              <td class="sticky-col" style="padding-left: ${14 + indentPx}px;">
                <span>${r.name}</span>
              </td>
              <td style="text-align:center;"><span class="bctc-code-badge">${r.code}</span></td>
              <td style="text-align:center; color:var(--muted);">${r.thuyetMinh || '—'}</td>
              <td class="num" style="${isNegYtd ? 'color:var(--down);' : ''}">${this.fmt(r.ytdVal)}</td>
              <td class="num" style="${isNegMtd ? 'color:var(--down);' : ''}">${this.fmt(r.mtdVal)}</td>
              <td class="num" style="color:var(--muted);">${r.marginYtdPct !== null ? (r.marginYtdPct.toFixed(1) + '%') : '—'}</td>
              <td class="num" style="color:var(--muted);">${r.marginMtdPct !== null ? (r.marginMtdPct.toFixed(1) + '%') : '—'}</td>
            </tr>
          `;
        } else {
          const isNegMtd = r.mtdVal < 0;
          const isNegPrev = r.prevMtdVal < 0;
          const diffStr = (r.diffMtd === null || r.diffMtd === undefined) ? '—' : (r.diffMtd > 0 ? `+${this.fmt(r.diffMtd)}` : (r.diffMtd < 0 ? this.fmt(r.diffMtd) : '0,000'));
          const diffColor = (r.diffMtd === null || r.diffMtd === undefined) ? 'var(--muted)' : (r.diffMtd > 0 ? 'var(--up)' : (r.diffMtd < 0 ? 'var(--down)' : 'var(--muted)'));

          tbodyHtml += `
            <tr class="${rowCls}">
              <td class="sticky-col" style="padding-left: ${14 + indentPx}px;">
                <span>${r.name}</span>
              </td>
              <td style="text-align:center;"><span class="bctc-code-badge">${r.code}</span></td>
              <td style="text-align:center; color:var(--muted);">${r.thuyetMinh || '—'}</td>
              <td class="num" style="${isNegMtd ? 'color:var(--down);' : ''}">${this.fmt(r.mtdVal)}</td>
              <td class="num" style="color:var(--muted); ${isNegPrev ? 'color:var(--down);' : ''}">${this.fmt(r.prevMtdVal)}</td>
              <td class="num" style="color:${diffColor}; font-weight:600;">${diffStr}</td>
              <td class="num" style="color:var(--muted);">${r.marginMtdPct !== null ? (r.marginMtdPct.toFixed(1) + '%') : '—'}</td>
            </tr>
          `;
        }
      });
      tbodyHtml += '</tbody>';

      const hasData = rows.some(r => r.mtdVal !== null && r.mtdVal !== undefined);
      const noticeHtml = this.getUnclosedNotice(m, y, hasData);
      container.innerHTML = `${noticeHtml}<table class="detail-table bctc-table">${theadHtml}${tbodyHtml}</table>`;
    },

    // -------------------------------------------------------------
    // BẢNG 3: B03-DN (LƯU CHUYỂN TIỀN TỆ)
    // -------------------------------------------------------------
    renderB03: function () {
      const container = document.getElementById('b03TableContainer');
      if (!container) return;

      const m = this.getMonth();
      const y = this.getYear();
      const b03 = window.BCTC_LOGIC.getB03Data(this.regime, this.lcttMethod, this.periodMode, m);
      const rows = b03.rows;
      const months = b03.availableMonths || window.BCTC_LOGIC.getAvailableMonths();

      const q = this.searchQuery;
      const filtered = q ? rows.filter(r => r.name.toLowerCase().includes(q) || r.code.includes(q)) : rows;

      let theadHtml = '';
      if (this.periodMode === 'FULL_YEAR') {
        const monthCols = months.map(mon => `<th class="num" style="min-width:105px;">T${mon}/${y.slice(-2)}</th>`).join('');
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:340px;">Dòng tiền & Khoản mục thu / chi</th>
              <th style="width:70px; text-align:center;">Mã số</th>
              <th style="width:85px; text-align:center;">Thuyết minh</th>
              ${monthCols}
              <th class="num" style="min-width:140px; background:var(--brand-dark, #071F1A) !important;">Cả năm (Lũy kế)</th>
            </tr>
          </thead>
        `;
      } else if (this.periodMode === 'YTD') {
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:360px;">Dòng tiền & Khoản mục thu / chi</th>
              <th style="width:75px; text-align:center;">Mã số</th>
              <th style="width:90px; text-align:center;">Thuyết minh</th>
              <th class="num" style="min-width:150px;">Lũy kế YTD (T1 - T${m}/${y})</th>
              <th class="num" style="min-width:150px;">Kỳ này MTD (T${m}/${y})</th>
            </tr>
          </thead>
        `;
      } else {
        theadHtml = `
          <thead>
            <tr>
              <th class="sticky-col" style="min-width:360px;">Dòng tiền & Khoản mục thu / chi</th>
              <th style="width:75px; text-align:center;">Mã số</th>
              <th style="width:90px; text-align:center;">Thuyết minh</th>
              <th class="num" style="min-width:150px;">Kỳ này MTD (T${m}/${y})</th>
              <th class="num" style="min-width:150px;">Kỳ trước (T${m > 1 ? m - 1 : 1}/${y})</th>
              <th class="num" style="min-width:120px;">Chênh lệch (MTD)</th>
            </tr>
          </thead>
        `;
      }

      let tbodyHtml = '<tbody>';
      filtered.forEach(r => {
        let rowCls = `row-l${Math.min(r.level, 3)}`;
        if (['I', 'II', 'III', '20', '30', '40', '50', '60', '70'].includes(r.code)) rowCls = 'row-total';

        const indentPx = (r.level - 1) * 20;

        if (this.periodMode === 'FULL_YEAR') {
          const monthTds = months.map(mon => {
            const v = (r.monthlyVals && r.monthlyVals[mon] !== undefined) ? r.monthlyVals[mon] : null;
            const isNeg = v !== null && v < 0;
            return `<td class="num" style="${isNeg ? 'color:var(--down);' : ''}">${this.fmt(v)}</td>`;
          }).join('');

          const isNegTot = r.fullYearVal < 0;
          tbodyHtml += `
            <tr class="${rowCls}">
              <td class="sticky-col" style="padding-left: ${14 + indentPx}px;">
                <span>${r.name}</span>
              </td>
              <td style="text-align:center;"><span class="bctc-code-badge">${r.code}</span></td>
              <td style="text-align:center; color:var(--muted);">${r.thuyetMinh || '—'}</td>
              ${monthTds}
              <td class="num" style="font-weight:700; ${isNegTot ? 'color:var(--down);' : ''}">${this.fmt(r.fullYearVal)}</td>
            </tr>
          `;
        } else if (this.periodMode === 'YTD') {
          const isNegMtd = r.mtdVal < 0;
          const isNegYtd = r.ytdVal < 0;
          tbodyHtml += `
            <tr class="${rowCls}">
              <td class="sticky-col" style="padding-left: ${14 + indentPx}px;">
                <span>${r.name}</span>
              </td>
              <td style="text-align:center;"><span class="bctc-code-badge">${r.code}</span></td>
              <td style="text-align:center; color:var(--muted);">${r.thuyetMinh || '—'}</td>
              <td class="num" style="${isNegYtd ? 'color:var(--down);' : ''}">${this.fmt(r.ytdVal)}</td>
              <td class="num" style="${isNegMtd ? 'color:var(--down);' : ''}">${this.fmt(r.mtdVal)}</td>
            </tr>
          `;
        } else {
          const isNegMtd = r.mtdVal < 0;
          const isNegPrev = r.prevMtdVal < 0;
          const diffStr = (r.diffMtd === null || r.diffMtd === undefined) ? '—' : (r.diffMtd > 0 ? `+${this.fmt(r.diffMtd)}` : (r.diffMtd < 0 ? this.fmt(r.diffMtd) : '0,000'));
          const diffColor = (r.diffMtd === null || r.diffMtd === undefined) ? 'var(--muted)' : (r.diffMtd > 0 ? 'var(--up)' : (r.diffMtd < 0 ? 'var(--down)' : 'var(--muted)'));

          tbodyHtml += `
            <tr class="${rowCls}">
              <td class="sticky-col" style="padding-left: ${14 + indentPx}px;">
                <span>${r.name}</span>
              </td>
              <td style="text-align:center;"><span class="bctc-code-badge">${r.code}</span></td>
              <td style="text-align:center; color:var(--muted);">${r.thuyetMinh || '—'}</td>
              <td class="num" style="${isNegMtd ? 'color:var(--down);' : ''}">${this.fmt(r.mtdVal)}</td>
              <td class="num" style="color:var(--muted); ${isNegPrev ? 'color:var(--down);' : ''}">${this.fmt(r.prevMtdVal)}</td>
              <td class="num" style="color:${diffColor}; font-weight:600;">${diffStr}</td>
            </tr>
          `;
        }
      });
      tbodyHtml += '</tbody>';

      const hasData = rows.some(r => r.mtdVal !== null && r.mtdVal !== undefined);
      const noticeHtml = this.getUnclosedNotice(m, y, hasData);
      container.innerHTML = `${noticeHtml}<table class="detail-table bctc-table">${theadHtml}${tbodyHtml}</table>`;
    },

    // Kiểm tra xem dòng có bị ẩn do cha nó đang thu gọn không
    isRowHiddenByParent: function (row, allRows) {
      if (!row.parentId) return false;
      if (this.collapsedNodes.has(row.parentId)) return true;
      const parent = allRows.find(r => r.code === row.parentId);
      if (parent) return this.isRowHiddenByParent(parent, allRows);
      return false;
    },

    // Kiểm tra 1 mã có con không
    hasChildren: function (code, allRows) {
      return allRows.some(r => r.parentId === code);
    },

    // Định dạng số tiền VN (tỷ đồng)
    fmt: function (val, dp = 3) {
      if (val === null || val === undefined || isNaN(val)) return '—';
      return Number(val).toLocaleString('vi-VN', {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp
      });
    }
  };

  window.BCTC_MODULE = BCTC_MODULE;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => BCTC_MODULE.init());
  } else {
    BCTC_MODULE.init();
  }
})();
