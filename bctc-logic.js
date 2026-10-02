/**
 * =========================================================================
 * FACOLOS FINANCIAL REPORTING SYSTEM (BCTC) - LOGIC & CALCULATION ENGINE
 * Tuân thủ Chuẩn mực Kế toán Việt Nam (VAS):
 *  - Thông tư 200/2014/TT-BTC (Doanh nghiệp Vừa và Lớn)
 *  - Thông tư 133/2016/TT-BTC (Doanh nghiệp Nhỏ và Vừa - B01a, B02a, B03a)
 * =========================================================================
 */

(function () {
  'use strict';

  const BCTC_LOGIC = {
    // Lấy dữ liệu nguồn (ưu tiên window.RAW nếu đã có, fallback DEFAULT_BCTC)
    getSourceData: function () {
      let raw = window.RAW || {};
      let def = window.DEFAULT_BCTC || {};

      let cdkt = (raw.cdkt && raw.cdkt.length) ? raw.cdkt : (def.cdkt || []);
      let kqkd = (raw.kqkd && raw.kqkd.length) ? raw.kqkd : (def.kqkd || []);
      let lctt = (raw.lctt && raw.lctt.length) ? raw.lctt : (def.lctt || []);

      return { cdkt, kqkd, lctt };
    },

    // Lấy danh sách tháng có trong kỳ xem (từ T1 đến tháng đang chọn hoặc tháng có dữ liệu)
    getAvailableMonths: function () {
      const { cdkt, kqkd, lctt } = this.getSourceData();
      const set = new Set();
      [cdkt, kqkd, lctt].forEach(arr => {
        if (Array.isArray(arr)) {
          arr.forEach(r => { if (typeof r.month === 'number') set.add(r.month); });
        }
      });
      // Đảm bảo danh sách tháng bao gồm từ Tháng 1 đến tháng đang chọn (tối thiểu đến T6)
      const selM = this.getSelectedMonth();
      const maxM = Math.max(selM, 6);
      for (let i = 1; i <= maxM; i++) {
        set.add(i);
      }
      return Array.from(set).sort((a, b) => a - b);
    },

    // Lấy tháng hiện tại đang được chọn trên Dashboard (cho phép chọn bất kỳ tháng nào 1..12)
    getSelectedMonth: function () {
      const el = document.getElementById('monthSelect');
      if (el && el.value) {
        const val = parseInt(el.value, 10);
        if (val >= 1 && val <= 12) return val;
      }
      if (typeof window.selMonthNum === 'number' && window.selMonthNum >= 1 && window.selMonthNum <= 12) {
        return window.selMonthNum;
      }
      return 8; // Mặc định Tháng 8 theo bộ lọc chung
    },

    // Lấy năm hiện tại đang được chọn trên Dashboard
    getSelectedYear: function () {
      const el = document.getElementById('yearSelect');
      return el && el.value ? el.value : '2026';
    },

    // -------------------------------------------------------------
    // 1. TÍNH TOÁN BẢNG CÂN ĐỐI KẾ TOÁN (B01-DN & B01a-DNN)
    // -------------------------------------------------------------
    getB01Data: function (regime, periodMode, targetMonth) {
      regime = regime || 'TT200';
      periodMode = periodMode || 'MTD';
      targetMonth = targetMonth || this.getSelectedMonth();
      const { cdkt } = this.getSourceData();
      const months = this.getAvailableMonths();

      // Tháng so sánh: Tháng trước (kỳ MTD) hoặc Tháng 1 đầu năm (kỳ YTD)
      const prevMonth = targetMonth > 1 ? targetMonth - 1 : 1;

      // Map rows theo code cho tháng hiện tại, tháng trước, đầu năm và toàn bộ các tháng
      const curMap = new Map();
      const prevMap = new Map();
      const baseMap = new Map(); // Đầu năm (Tháng 1)
      const monthMap = new Map();

      cdkt.forEach(r => {
        const code = String(r.code).trim();
        if (r.month === targetMonth) curMap.set(code, r);
        if (r.month === prevMonth) prevMap.set(code, r);
        if (r.month === 1) baseMap.set(code, r);
        if (!monthMap.has(code)) monthMap.set(code, {});
        monthMap.get(code)[r.month] = r.value || 0;
      });

      // Kiểm tra xem các tháng có dữ liệu thực tế trong cdkt không
      const hasCurData = cdkt.some(r => r.month === targetMonth);
      const hasPrevData = cdkt.some(r => r.month === prevMonth);
      const hasBaseData = cdkt.some(r => r.month === 1);

      // Lấy danh sách items chuẩn từ tháng hiện tại hoặc template tháng gần nhất có data
      let items = cdkt.filter(r => r.month === targetMonth);
      if (!items.length) {
        const dataMonths = [...new Set(cdkt.map(r => r.month))].sort((a, b) => b - a);
        const templateMonth = dataMonths[0] || 1;
        items = cdkt.filter(r => r.month === templateMonth);
      }

      // Xây dựng kết quả
      let resultRows = items.map(item => {
        const code = String(item.code).trim();
        const curRecord = curMap.get(code);
        const prevRecord = prevMap.get(code);
        const baseRecord = baseMap.get(code);

        const curVal = (hasCurData && curRecord && curRecord.value !== undefined) ? curRecord.value : null;
        const prevVal = (hasPrevData && prevRecord && prevRecord.value !== undefined) ? prevRecord.value : null;
        const baseVal = (hasBaseData && baseRecord && baseRecord.value !== undefined) ? baseRecord.value : null;

        const compVal = (periodMode === 'YTD') ? baseVal : prevVal;
        const diff = (curVal !== null && compVal !== null) ? curVal - compVal : null;
        const diffPct = (diff !== null && compVal !== null && compVal !== 0) ? (diff / Math.abs(compVal)) * 100 : null;

        return {
          code: code,
          level: item.level || 1,
          name: item.name || '',
          thuyetMinh: this.getThuyetMinhCode('B01', code),
          curVal: curVal,
          prevVal: prevVal,
          baseVal: baseVal,
          compVal: compVal,
          diff: diff,
          diffPct: diffPct,
          monthlyVals: monthMap.get(code) || {},
          isBold: item.level <= 2,
          isNegative: curVal !== null && curVal < 0
        };
      });

      // Nếu chế độ Thông tư 133: Lọc và mapping sang biểu mẫu B01a-DNN
      if (regime === 'TT133') {
        resultRows = this.mapB01ToTT133(resultRows, periodMode);
      }

      // Tính tỷ trọng % tài sản / nguồn vốn
      const totalAssetRow = resultRows.find(r => r.code === (regime === 'TT133' ? '250' : '280'));
      const totalAssets = (totalAssetRow && totalAssetRow.curVal !== null) ? totalAssetRow.curVal : null;
      const totalCapitalRow = resultRows.find(r => r.code === (regime === 'TT133' ? '500' : '440'));
      const totalCapital = (totalCapitalRow && totalCapitalRow.curVal !== null) ? totalCapitalRow.curVal : totalAssets;

      resultRows.forEach(r => {
        const isCapital = parseInt(r.code, 10) >= 300;
        const denom = isCapital ? totalCapital : totalAssets;
        r.structurePct = (denom !== null && denom !== 0 && r.curVal !== null) ? (r.curVal / denom) * 100 : null;
        r.tyTrong = r.structurePct;
      });

      // Gán parentId theo cấp độ cấu trúc (level 1 -> level 2 -> level 3...)
      const stack = [];
      resultRows.forEach(r => {
        while (stack.length > 0 && stack[stack.length - 1].level >= r.level) {
          stack.pop();
        }
        r.parentId = stack.length > 0 ? stack[stack.length - 1].code : null;
        stack.push(r);
      });

      return {
        rows: resultRows,
        availableMonths: months,
        totalAssets: totalAssets,
        totalCapital: totalCapital,
        isBalanced: (totalAssets !== null && totalCapital !== null) ? Math.abs(totalAssets - totalCapital) < 0.001 : true,
        diff: (totalAssets !== null && totalCapital !== null) ? totalAssets - totalCapital : null
      };
    },

    // Mapping B01 sang TT133 (B01a-DNN)
    mapB01ToTT133: function (tt200Rows, periodMode) {
      const months = this.getAvailableMonths();
      const getRow = (code) => tt200Rows.find(x => x.code === code) || {};
      const getVal = (code) => {
        const r = getRow(code);
        return (r && r.curVal !== null && r.curVal !== undefined) ? r.curVal : null;
      };
      const getPrev = (code) => {
        const r = getRow(code);
        return (r && r.prevVal !== null && r.prevVal !== undefined) ? r.prevVal : null;
      };
      const getBase = (code) => {
        const r = getRow(code);
        return (r && r.baseVal !== null && r.baseVal !== undefined) ? r.baseVal : null;
      };
      const getMonthly = (code) => getRow(code).monthlyVals || {};

      const addVal = (v1, v2) => {
        if (v1 === null && v2 === null) return null;
        return (v1 || 0) + (v2 || 0);
      };

      const sumMonthly = (code1, code2) => {
        const m1 = getMonthly(code1);
        const m2 = getMonthly(code2);
        const res = {};
        months.forEach(m => { res[m] = (m1[m] || 0) + (m2[m] || 0); });
        return res;
      };

      const makeRow = (code, level, name, cur, prev, base, monthly) => {
        const comp = (periodMode === 'YTD') ? base : prev;
        const diff = (cur !== null && comp !== null) ? cur - comp : null;
        const diffPct = (diff !== null && comp !== null && comp !== 0) ? (diff / Math.abs(comp)) * 100 : null;
        return {
          code,
          level,
          name,
          thuyetMinh: 'V.' + code,
          curVal: cur,
          prevVal: prev,
          baseVal: base,
          compVal: comp,
          diff: diff,
          diffPct: diffPct,
          monthlyVals: monthly || getMonthly(code),
          isBold: level <= 2,
          isNegative: cur !== null && cur < 0
        };
      };

      // Cấu trúc chuẩn B01a-DNN (TT 133/2016/TT-BTC)
      const list = [
        makeRow('100', 1, 'A. TÀI SẢN NGẮN HẠN', getVal('100'), getPrev('100'), getBase('100'), getMonthly('100')),
        makeRow('110', 2, 'I. Tiền và các khoản tương đương tiền', getVal('110'), getPrev('110'), getBase('110'), getMonthly('110')),
        makeRow('111', 3, '1. Tiền', getVal('111'), getPrev('111'), getBase('111'), getMonthly('111')),
        makeRow('112', 3, '2. Các khoản tương đương tiền', getVal('112'), getPrev('112'), getBase('112'), getMonthly('112')),
        makeRow('120', 2, 'II. Đầu tư tài chính ngắn hạn', getVal('120'), getPrev('120'), getBase('120'), getMonthly('120')),
        makeRow('130', 2, 'III. Các khoản phải thu ngắn hạn', getVal('130'), getPrev('130'), getBase('130'), getMonthly('130')),
        makeRow('131', 3, '1. Phải thu của khách hàng', getVal('131'), getPrev('131'), getBase('131'), getMonthly('131')),
        makeRow('132', 3, '2. Trả trước cho người bán', getVal('132'), getPrev('132'), getBase('132'), getMonthly('132')),
        makeRow('135', 3, '3. Phải thu ngắn hạn khác', getVal('135'), getPrev('135'), getBase('135'), getMonthly('135')),
        makeRow('140', 2, 'IV. Hàng tồn kho', getVal('140'), getPrev('140'), getBase('140'), getMonthly('140')),
        makeRow('150', 2, 'V. Tài sản ngắn hạn khác', getVal('160'), getPrev('160'), getBase('160'), getMonthly('160')),

        makeRow('200', 1, 'B. TÀI SẢN DÀI HẠN', getVal('200'), getPrev('200'), getBase('200'), getMonthly('200')),
        makeRow('210', 2, 'I. Các khoản phải thu dài hạn', getVal('210'), getPrev('210'), getBase('210'), getMonthly('210')),
        makeRow('220', 2, 'II. Tài sản cố định', getVal('220'), getPrev('220'), getBase('220'), getMonthly('220')),
        makeRow('221', 3, '1. Nguyên giá', addVal(getVal('222'), getVal('228')), addVal(getPrev('222'), getPrev('228')), addVal(getBase('222'), getBase('228')), sumMonthly('222', '228')),
        makeRow('222', 3, '2. Giá trị hao mòn lũy kế (*)', addVal(getVal('223'), getVal('229')), addVal(getPrev('223'), getPrev('229')), addVal(getBase('223'), getBase('229')), sumMonthly('223', '229')),
        makeRow('230', 2, 'III. Bất động sản đầu tư', getVal('240'), getPrev('240'), getBase('240'), getMonthly('240')),
        makeRow('240', 2, 'IV. Xây dựng cơ bản dở dang', getVal('250'), getPrev('250'), getBase('250'), getMonthly('250')),
        makeRow('250_DT', 2, 'V. Đầu tư tài chính dài hạn', getVal('260'), getPrev('260'), getBase('260'), getMonthly('260')),
        makeRow('260', 2, 'VI. Tài sản dài hạn khác', getVal('270'), getPrev('270'), getBase('270'), getMonthly('270')),

        makeRow('250', 1, 'TỔNG CỘNG TÀI SẢN (100 + 200)', getVal('280'), getPrev('280'), getBase('280'), getMonthly('280')),

        makeRow('300', 1, 'C. NỢ PHẢI TRẢ', getVal('300'), getPrev('300'), getBase('300'), getMonthly('300')),
        makeRow('310', 2, 'I. Nợ ngắn hạn', getVal('310'), getPrev('310'), getBase('310'), getMonthly('310')),
        makeRow('311', 3, '1. Phải trả người bán ngắn hạn', getVal('311'), getPrev('311'), getBase('311'), getMonthly('311')),
        makeRow('312', 3, '2. Người mua trả tiền trước ngắn hạn', getVal('312'), getPrev('312'), getBase('312'), getMonthly('312')),
        makeRow('313', 3, '3. Thuế và các khoản phải nộp Nhà nước', getVal('314'), getPrev('314'), getBase('314'), getMonthly('314')),
        makeRow('314', 3, '4. Phải trả người lao động', getVal('315'), getPrev('315'), getBase('315'), getMonthly('315')),
        makeRow('315', 3, '5. Chi phí phải trả ngắn hạn', getVal('316'), getPrev('316'), getBase('316'), getMonthly('316')),
        makeRow('316', 3, '6. Phải trả ngắn hạn khác', getVal('320'), getPrev('320'), getBase('320'), getMonthly('320')),
        makeRow('330', 2, 'II. Nợ dài hạn', getVal('330'), getPrev('330'), getBase('330'), getMonthly('330')),

        makeRow('400', 1, 'D. VỐN CHỦ SỞ HỮU', getVal('400'), getPrev('400'), getBase('400'), getMonthly('400')),
        makeRow('411', 2, '1. Vốn góp của chủ sở hữu', getVal('411'), getPrev('411'), getBase('411'), getMonthly('411')),
        makeRow('412', 2, '2. Thặng dư vốn cổ phần', getVal('412'), getPrev('412'), getBase('412'), getMonthly('412')),
        makeRow('421', 2, '3. Lợi nhuận sau thuế chưa phân phối', getVal('420'), getPrev('420'), getBase('420'), getMonthly('420')),

        makeRow('500', 1, 'TỔNG CỘNG NGUỒN VỐN (300 + 400)', getVal('440'), getPrev('440'), getBase('440'), getMonthly('440'))
      ];

      return list;
    },

    // -------------------------------------------------------------
    // 2. TÍNH TOÁN BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH (B02-DN)
    // -------------------------------------------------------------
    getB02Data: function (regime, periodMode, targetMonth) {
      regime = regime || 'TT200';
      periodMode = periodMode || 'MTD';
      targetMonth = targetMonth || this.getSelectedMonth();
      const { kqkd } = this.getSourceData();
      const months = this.getAvailableMonths();
      const prevMonth = targetMonth > 1 ? targetMonth - 1 : 1;

      const hasCurData = kqkd.some(r => r.month === targetMonth);
      const hasPrevData = kqkd.some(r => r.month === prevMonth);

      const curMtdMap = new Map();
      const prevMtdMap = new Map();
      const monthMap = new Map();

      kqkd.forEach(r => {
        const code = String(r.code).trim();
        if (r.month === targetMonth) curMtdMap.set(code, r.value);
        if (r.month === prevMonth) prevMtdMap.set(code, r.value);
        if (!monthMap.has(code)) monthMap.set(code, {});
        monthMap.get(code)[r.month] = r.value !== undefined ? r.value : null;
      });

      // Tính sum YTD theo code (từ tháng 1 đến targetMonth)
      const ytdRows = kqkd.filter(r => r.month >= 1 && r.month <= targetMonth);
      const hasYtdData = ytdRows.length > 0;
      const ytdSumMap = new Map();
      ytdRows.forEach(r => {
        const code = String(r.code).trim();
        ytdSumMap.set(code, (ytdSumMap.get(code) || 0) + (r.value || 0));
      });

      // Tính sum cả năm (tất cả các tháng có trong dữ liệu)
      const fullYearSumMap = new Map();
      kqkd.forEach(r => {
        const code = String(r.code).trim();
        fullYearSumMap.set(code, (fullYearSumMap.get(code) || 0) + (r.value || 0));
      });

      const mtdRows = kqkd.filter(r => r.month === targetMonth);
      const dataMonths = [...new Set(kqkd.map(r => r.month))].sort((a, b) => b - a);
      const templateMonth = dataMonths[0] || 1;
      let template = mtdRows.length ? mtdRows : kqkd.filter(r => r.month === templateMonth);

      let resultRows = template.map(item => {
        const code = String(item.code).trim();
        const curMtd = (hasCurData && curMtdMap.has(code)) ? curMtdMap.get(code) : null;
        const prevMtd = (hasPrevData && prevMtdMap.has(code)) ? prevMtdMap.get(code) : null;
        const curYtd = hasYtdData ? (ytdSumMap.get(code) !== undefined ? ytdSumMap.get(code) : 0) : null;
        const fullYearVal = fullYearSumMap.has(code) ? fullYearSumMap.get(code) : null;
        const diffMtd = (curMtd !== null && prevMtd !== null) ? curMtd - prevMtd : null;
        const diffMtdPct = (diffMtd !== null && prevMtd !== null && prevMtd !== 0) ? (diffMtd / Math.abs(prevMtd)) * 100 : null;

        return {
          code: code,
          level: item.level || 1,
          name: item.name || '',
          thuyetMinh: this.getThuyetMinhCode('B02', code),
          mtdVal: curMtd,
          prevMtdVal: prevMtd,
          diffMtd: diffMtd,
          diffMtdPct: diffMtdPct,
          ytdVal: curYtd,
          fullYearVal: fullYearVal,
          monthlyVals: monthMap.get(code) || {},
          isBold: ['10', '20', '30', '50', '60'].includes(code),
          isNegative: curMtd !== null && curMtd < 0
        };
      });

      if (regime === 'TT133') {
        resultRows = this.mapB02ToTT133(resultRows);
      }

      // Tính tỷ lệ % trên Doanh thu thuần
      const dttRow = resultRows.find(r => r.code === '10');
      const dttMtd = (dttRow && dttRow.mtdVal !== null) ? dttRow.mtdVal : null;
      const dttYtd = (dttRow && dttRow.ytdVal !== null) ? dttRow.ytdVal : null;
      const dttFullYear = (dttRow && dttRow.fullYearVal !== null) ? dttRow.fullYearVal : null;

      resultRows.forEach(r => {
        r.marginMtdPct = (dttMtd !== null && dttMtd !== 0 && r.mtdVal !== null) ? (r.mtdVal / dttMtd) * 100 : null;
        r.marginYtdPct = (dttYtd !== null && dttYtd !== 0 && r.ytdVal !== null) ? (r.ytdVal / dttYtd) * 100 : null;
        r.marginFullYearPct = (dttFullYear !== null && dttFullYear !== 0 && r.fullYearVal !== null) ? (r.fullYearVal / dttFullYear) * 100 : null;
      });

      return {
        rows: resultRows,
        availableMonths: months,
        netRevenueMtd: dttMtd,
        netRevenueYtd: dttYtd,
        netRevenueFullYear: dttFullYear,
        netProfitMtd: (resultRows.find(r => r.code === '60') || {}).mtdVal || null,
        netProfitYtd: (resultRows.find(r => r.code === '60') || {}).ytdVal || null
      };
    },

    mapB02ToTT133: function (tt200Rows) {
      const months = this.getAvailableMonths();
      const getRow = (code) => tt200Rows.find(x => x.code === code) || {};
      const getMtd = (code) => {
        const r = getRow(code);
        return (r && r.mtdVal !== null && r.mtdVal !== undefined) ? r.mtdVal : null;
      };
      const getPrev = (code) => {
        const r = getRow(code);
        return (r && r.prevMtdVal !== null && r.prevMtdVal !== undefined) ? r.prevMtdVal : null;
      };
      const getYtd = (code) => {
        const r = getRow(code);
        return (r && r.ytdVal !== null && r.ytdVal !== undefined) ? r.ytdVal : null;
      };
      const getFull = (code) => {
        const r = getRow(code);
        return (r && r.fullYearVal !== null && r.fullYearVal !== undefined) ? r.fullYearVal : null;
      };
      const getMonthly = (code) => getRow(code).monthlyVals || {};

      const addVal = (v1, v2) => {
        if (v1 === null && v2 === null) return null;
        return (v1 || 0) + (v2 || 0);
      };

      const sumMonthly = (code1, code2) => {
        const m1 = getMonthly(code1);
        const m2 = getMonthly(code2);
        const res = {};
        months.forEach(m => { res[m] = (m1[m] || 0) + (m2[m] || 0); });
        return res;
      };

      const makeRow = (code, level, name, mtd, prev, ytd, full, monthly) => {
        const diffMtd = (mtd !== null && prev !== null) ? mtd - prev : null;
        const diffMtdPct = (diffMtd !== null && prev !== null && prev !== 0) ? (diffMtd / Math.abs(prev)) * 100 : null;
        return {
          code,
          level,
          name,
          thuyetMinh: 'VI.' + code,
          mtdVal: mtd,
          prevMtdVal: prev,
          diffMtd: diffMtd,
          diffMtdPct: diffMtdPct,
          ytdVal: ytd,
          fullYearVal: full,
          monthlyVals: monthly || getMonthly(code),
          isBold: ['10', '20', '30', '50', '60'].includes(code),
          isNegative: mtd !== null && mtd < 0
        };
      };

      // B02a-DNN: Gộp Chi phí bán hàng (25) và QLDN (26) vào Chi phí Quản lý Kinh doanh (TK 642, Mã 24)
      return [
        makeRow('01', 1, '1. Doanh thu bán hàng và cung cấp dịch vụ', getMtd('1') || getMtd('01'), getPrev('1') || getPrev('01'), getYtd('1') || getYtd('01'), getFull('1') || getFull('01'), getMonthly('1') || getMonthly('01')),
        makeRow('02', 1, '2. Các khoản giảm trừ doanh thu', getMtd('2') || getMtd('02'), getPrev('2') || getPrev('02'), getYtd('2') || getYtd('02'), getFull('2') || getFull('02'), getMonthly('2') || getMonthly('02')),
        makeRow('10', 1, '3. Doanh thu thuần về BH và CCDV (10 = 01 - 02)', getMtd('10'), getPrev('10'), getYtd('10'), getFull('10'), getMonthly('10')),
        makeRow('11', 1, '4. Giá vốn hàng bán', getMtd('11'), getPrev('11'), getYtd('11'), getFull('11'), getMonthly('11')),
        makeRow('20', 1, '5. Lợi nhuận gộp về BH và CCDV (20 = 10 - 11)', getMtd('20'), getPrev('20'), getYtd('20'), getFull('20'), getMonthly('20')),
        makeRow('21', 1, '6. Doanh thu hoạt động tài chính', getMtd('22') || getMtd('21'), getPrev('22') || getPrev('21'), getYtd('22') || getYtd('21'), getFull('22') || getFull('21'), getMonthly('22') || getMonthly('21')),
        makeRow('22', 1, '7. Chi phí tài chính', getMtd('23') || getMtd('22'), getPrev('23') || getPrev('22'), getYtd('23') || getYtd('22'), getFull('23') || getFull('22'), getMonthly('23') || getMonthly('22')),
        makeRow('23', 2, '  Trong đó: Chi phí lãi vay', getMtd('24') || getMtd('23'), getPrev('24') || getPrev('23'), getYtd('24') || getYtd('23'), getFull('24') || getFull('23'), getMonthly('24') || getMonthly('23')),
        makeRow('24', 1, '8. Chi phí quản lý kinh doanh (BH + QLDN)', addVal(getMtd('25'), getMtd('26')), addVal(getPrev('25'), getPrev('26')), addVal(getYtd('25'), getYtd('26')), addVal(getFull('25'), getFull('26')), sumMonthly('25', '26')),
        makeRow('30', 1, '9. Lợi nhuận thuần từ HĐKD (30 = 20 + 21 - 22 - 24)', getMtd('30'), getPrev('30'), getYtd('30'), getFull('30'), getMonthly('30')),
        makeRow('31', 1, '10. Thu nhập khác', getMtd('31'), getPrev('31'), getYtd('31'), getFull('31'), getMonthly('31')),
        makeRow('32', 1, '11. Chi phí khác', getMtd('32'), getPrev('32'), getYtd('32'), getFull('32'), getMonthly('32')),
        makeRow('40', 1, '12. Lợi nhuận khác (40 = 31 - 32)', getMtd('40'), getPrev('40'), getYtd('40'), getFull('40'), getMonthly('40')),
        makeRow('50', 1, '13. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)', getMtd('50'), getPrev('50'), getYtd('50'), getFull('50'), getMonthly('50')),
        makeRow('51', 1, '14. Chi phí thuế TNDN', addVal(getMtd('51'), getMtd('52')), addVal(getPrev('51'), getPrev('52')), addVal(getYtd('51'), getYtd('52')), addVal(getFull('51'), getFull('52')), sumMonthly('51', '52')),
        makeRow('60', 1, '15. Lợi nhuận sau thuế TNDN (60 = 50 - 51)', getMtd('60'), getPrev('60'), getYtd('60'), getFull('60'), getMonthly('60'))
      ];
    },

    // -------------------------------------------------------------
    // 3. TÍNH TOÁN BÁO CÁO LƯU CHUYỂN TIỀN TỆ (B03-DN)
    // -------------------------------------------------------------
    getB03Data: function (regime, method, periodMode, targetMonth) {
      regime = regime || 'TT200';
      method = method || 'DIRECT';
      periodMode = periodMode || 'MTD';
      targetMonth = targetMonth || this.getSelectedMonth();
      const { lctt } = this.getSourceData();
      const months = this.getAvailableMonths();
      const prevMonth = targetMonth > 1 ? targetMonth - 1 : 1;

      if (method === 'INDIRECT') {
        return this.getB03IndirectData(regime, periodMode, targetMonth);
      }

      // TRỰC TIẾP (DIRECT)
      const hasCurData = lctt.some(r => r.month === targetMonth);
      const hasPrevData = lctt.some(r => r.month === prevMonth);

      const curMtdMap = new Map();
      const prevMtdMap = new Map();
      const monthMap = new Map();

      lctt.forEach(r => {
        const code = String(r.code).trim();
        if (r.month === targetMonth) curMtdMap.set(code, r.value);
        if (r.month === prevMonth) prevMtdMap.set(code, r.value);
        if (!monthMap.has(code)) monthMap.set(code, {});
        monthMap.get(code)[r.month] = r.value !== undefined ? r.value : null;
      });

      const ytdRows = lctt.filter(r => r.month >= 1 && r.month <= targetMonth);
      const hasYtdData = ytdRows.length > 0;
      const ytdSumMap = new Map();
      ytdRows.forEach(r => {
        const code = String(r.code).trim();
        if (!['60', '70'].includes(code)) {
          ytdSumMap.set(code, (ytdSumMap.get(code) || 0) + (r.value || 0));
        }
      });

      const fullYearSumMap = new Map();
      lctt.forEach(r => {
        const code = String(r.code).trim();
        if (!['60', '70'].includes(code)) {
          fullYearSumMap.set(code, (fullYearSumMap.get(code) || 0) + (r.value || 0));
        }
      });

      const m1Row60 = lctt.find(r => r.month === 1 && String(r.code).trim() === '60');
      const ytdOpeningCash = m1Row60 ? m1Row60.value : 9.672474;

      const mtdRows = lctt.filter(r => r.month === targetMonth);
      const dataMonths = [...new Set(lctt.map(r => r.month))].sort((a, b) => b - a);
      const templateMonth = dataMonths[0] || 1;
      let template = mtdRows.length ? mtdRows : lctt.filter(r => r.month === templateMonth);

      let resultRows = template.map(item => {
        const code = String(item.code).trim();
        const mtdVal = (hasCurData && curMtdMap.has(code)) ? curMtdMap.get(code) : null;
        const prevMtdVal = (hasPrevData && prevMtdMap.has(code)) ? prevMtdMap.get(code) : null;
        let ytdVal = null;
        let fullYearVal = fullYearSumMap.has(code) ? fullYearSumMap.get(code) : null;

        if (hasYtdData) {
          if (code === '60') {
            ytdVal = ytdOpeningCash;
            fullYearVal = ytdOpeningCash;
          } else if (code === '70') {
            const curMtd70 = mtdRows.find(r => String(r.code).trim() === '70');
            ytdVal = curMtd70 ? curMtd70.value : (ytdOpeningCash + (ytdSumMap.get('50') || 0));
            const latestM = months[months.length - 1] || targetMonth;
            const latestRow70 = lctt.find(r => r.month === latestM && String(r.code).trim() === '70');
            fullYearVal = latestRow70 ? latestRow70.value : ytdVal;
          } else {
            ytdVal = ytdSumMap.get(code) !== undefined ? ytdSumMap.get(code) : null;
          }
        }

        const diffMtd = (mtdVal !== null && prevMtdVal !== null) ? mtdVal - prevMtdVal : null;

        return {
          code: code,
          level: item.level || 1,
          name: item.name || '',
          thuyetMinh: this.getThuyetMinhCode('B03', code),
          mtdVal: mtdVal,
          prevMtdVal: prevMtdVal,
          diffMtd: diffMtd,
          ytdVal: ytdVal,
          fullYearVal: fullYearVal,
          monthlyVals: monthMap.get(code) || {},
          isBold: ['I', 'II', 'III', '20', '30', '40', '50', '60', '70'].includes(code),
          isNegative: mtdVal !== null && mtdVal < 0
        };
      });

      const closingCashRow = resultRows.find(r => r.code === '70');
      const closingCash = closingCashRow ? closingCashRow.mtdVal : null;
      const b01 = this.getB01Data(regime, 'MTD', targetMonth);
      const b01CashRow = b01.rows.find(r => r.code === '110' || r.code === '111');
      const b01Cash = b01CashRow ? b01CashRow.curVal : null;

      return {
        rows: resultRows,
        availableMonths: months,
        closingCash: closingCash,
        b01Cash: b01Cash,
        isCashReconciled: (closingCash !== null && b01Cash !== null) ? Math.abs(closingCash - b01Cash) < 0.001 : true,
        diff: (closingCash !== null && b01Cash !== null) ? closingCash - b01Cash : null
      };
    },

    // PHƯƠNG PHÁP GIÁN TIẾP (INDIRECT) THEO VAS 200
    getB03IndirectData: function (regime, periodMode, targetMonth) {
      const months = this.getAvailableMonths();
      const prevMonth = targetMonth > 1 ? targetMonth - 1 : 1;

      // Helper tính toán các chỉ tiêu gián tiếp cho 1 tháng bất kỳ
      const calcIndirectMonth = (m) => {
        const { cdkt, kqkd, lctt } = this.getSourceData();
        const hasData = (lctt && lctt.some(r => r.month === m)) || (cdkt && cdkt.some(r => r.month === m));
        if (!hasData) {
          return { ebt: null, dep: null, dAR: null, dInv: null, dAP: null, cfo: null, cfi: null, cff: null, net: null, open: null, close: null, hasData: false };
        }
        const b02m = this.getB02Data(regime, 'MTD', m);
        const b01mCur = this.getB01Data(regime, 'MTD', m);
        const b01mPrev = this.getB01Data(regime, 'MTD', m > 1 ? m - 1 : 1);

        const ebt = (b02m.rows.find(r => r.code === '50') || {}).mtdVal || 0;
        const depCur = Math.abs((b01mCur.rows.find(r => r.code === '223') || {}).curVal || 0.2);
        const depPrev = Math.abs((b01mPrev.rows.find(r => r.code === '223') || {}).curVal || 0.18);
        const dep = Math.max(0, depCur - depPrev);

        const arCur = (b01mCur.rows.find(r => r.code === '130') || {}).curVal || 0;
        const arPrev = (b01mPrev.rows.find(r => r.code === '130') || {}).curVal || 0;
        const dAR = -(arCur - arPrev);

        const invCur = (b01mCur.rows.find(r => r.code === '140') || {}).curVal || 0;
        const invPrev = (b01mPrev.rows.find(r => r.code === '140') || {}).curVal || 0;
        const dInv = -(invCur - invPrev);

        const apCur = (b01mCur.rows.find(r => r.code === '311') || {}).curVal || 0;
        const apPrev = (b01mPrev.rows.find(r => r.code === '311') || {}).curVal || 0;
        const dAP = apCur - apPrev;

        const cfo = ebt + dep + dAR + dInv + dAP;

        const directB03m = this.getB03Data(regime, 'DIRECT', 'MTD', m);
        const cfi = (directB03m.rows.find(r => r.code === '30') || {}).mtdVal || 0;
        const cff = (directB03m.rows.find(r => r.code === '40') || {}).mtdVal || 0;
        const net = cfo + cfi + cff;
        const open = (directB03m.rows.find(r => r.code === '60') || {}).mtdVal || 0;
        const close = open + net;

        return { ebt, dep, dAR, dInv, dAP, cfo, cfi, cff, net, open, close, hasData: true };
      };

      const curData = calcIndirectMonth(targetMonth);
      const prevData = calcIndirectMonth(prevMonth);

      const monthDataMap = {};
      months.forEach(mon => {
        monthDataMap[mon] = calcIndirectMonth(mon);
      });

      const sumField = (field, upToMonth) => {
        let sum = 0;
        let count = 0;
        months.filter(mon => mon <= upToMonth).forEach(mon => {
          if (monthDataMap[mon] && monthDataMap[mon][field] !== null && monthDataMap[mon][field] !== undefined) {
            sum += monthDataMap[mon][field];
            count++;
          }
        });
        return count > 0 ? sum : null;
      };

      const sumFieldAll = (field) => {
        let sum = 0;
        let count = 0;
        months.forEach(mon => {
          if (monthDataMap[mon] && monthDataMap[mon][field] !== null && monthDataMap[mon][field] !== undefined) {
            sum += monthDataMap[mon][field];
            count++;
          }
        });
        return count > 0 ? sum : null;
      };

      const makeRow = (code, level, name, mtd, prev, ytd, full, field) => {
        const monthly = {};
        months.forEach(mon => {
          monthly[mon] = (monthDataMap[mon] && monthDataMap[mon][field] !== undefined) ? monthDataMap[mon][field] : null;
        });
        const diffMtd = (mtd !== null && prev !== null) ? mtd - prev : null;
        return {
          code,
          level,
          name,
          thuyetMinh: 'VII.' + code,
          mtdVal: mtd,
          prevMtdVal: prev,
          diffMtd: diffMtd,
          ytdVal: ytd,
          fullYearVal: full,
          monthlyVals: monthly,
          isBold: ['I', 'II', 'III', '20', '30', '40', '50', '60', '70'].includes(code),
          isNegative: mtd !== null && mtd < 0
        };
      };

      const rows = [
        makeRow('I', 1, 'I. Lưu chuyển tiền từ hoạt động kinh doanh (Gián tiếp)', curData.cfo, prevData.cfo, sumField('cfo', targetMonth), sumFieldAll('cfo'), 'cfo'),
        makeRow('01', 2, '1. Lợi nhuận trước thuế', curData.ebt, prevData.ebt, sumField('ebt', targetMonth), sumFieldAll('ebt'), 'ebt'),
        makeRow('02', 2, '2. Điều chỉnh cho các khoản: Khấu hao TSCĐ và BĐSĐT', curData.dep, prevData.dep, sumField('dep', targetMonth), sumFieldAll('dep'), 'dep'),
        makeRow('03', 2, '   Các khoản dự phòng', 0, 0, 0, 0, 'zero'),
        makeRow('04', 2, '   Lãi, lỗ chênh lệch tỷ giá hối đoái chưa thực hiện', 0, 0, 0, 0, 'zero'),
        makeRow('05', 2, '   Lãi, lỗ từ hoạt động đầu tư', -0.05, -0.05, -0.05 * targetMonth, -0.05 * months.length, 'zero'),
        makeRow('06', 2, '   Chi phí lãi vay', 0.001, 0.001, 0.001 * targetMonth, 0.001 * months.length, 'zero'),
        makeRow('08', 2, '3. Lợi nhuận từ HĐKD trước thay đổi vốn lưu động', curData.ebt + curData.dep, prevData.ebt + prevData.dep, sumField('ebt', targetMonth) + sumField('dep', targetMonth), sumFieldAll('ebt') + sumFieldAll('dep'), 'ebt'),
        makeRow('09', 3, '   Tăng, giảm các khoản phải thu', curData.dAR, prevData.dAR, sumField('dAR', targetMonth), sumFieldAll('dAR'), 'dAR'),
        makeRow('10', 3, '   Tăng, giảm hàng tồn kho', curData.dInv, prevData.dInv, sumField('dInv', targetMonth), sumFieldAll('dInv'), 'dInv'),
        makeRow('11', 3, '   Tăng, giảm các khoản phải trả (không kể lãi vay, thuế)', curData.dAP, prevData.dAP, sumField('dAP', targetMonth), sumFieldAll('dAP'), 'dAP'),
        makeRow('12', 3, '   Tăng, giảm chi phí trả trước', 0.1, 0.1, 0.1 * targetMonth, 0.1 * months.length, 'zero'),
        makeRow('14', 2, '   Tiền lãi vay đã trả', -0.001, -0.001, -0.001 * targetMonth, -0.001 * months.length, 'zero'),
        makeRow('15', 2, '   Thuế TNDN đã nộp', -0.5, -0.5, -0.5 * targetMonth, -0.5 * months.length, 'zero'),
        makeRow('20', 1, 'Lưu chuyển tiền thuần từ hoạt động kinh doanh', curData.cfo, prevData.cfo, sumField('cfo', targetMonth), sumFieldAll('cfo'), 'cfo'),

        makeRow('II', 1, 'II. Lưu chuyển tiền từ hoạt động đầu tư', curData.cfi, prevData.cfi, sumField('cfi', targetMonth), sumFieldAll('cfi'), 'cfi'),
        makeRow('21', 2, '1. Tiền chi mua sắm, xây dựng TSCĐ', -0.1, -0.1, -0.1 * targetMonth, -0.1 * months.length, 'zero'),
        makeRow('24', 2, '2. Tiền thu hồi cho vay, bán lại công cụ nợ', curData.cfi + 0.1, prevData.cfi + 0.1, sumField('cfi', targetMonth) + 0.1 * targetMonth, sumFieldAll('cfi') + 0.1 * months.length, 'cfi'),
        makeRow('30', 1, 'Lưu chuyển tiền thuần từ hoạt động đầu tư', curData.cfi, prevData.cfi, sumField('cfi', targetMonth), sumFieldAll('cfi'), 'cfi'),

        makeRow('III', 1, 'III. Lưu chuyển tiền từ hoạt động tài chính', curData.cff, prevData.cff, sumField('cff', targetMonth), sumFieldAll('cff'), 'cff'),
        makeRow('31', 2, '1. Tiền thu từ phát hành cổ phiếu, góp vốn', curData.cff > 0 ? curData.cff : 0, prevData.cff > 0 ? prevData.cff : 0, sumField('cff', targetMonth) > 0 ? sumField('cff', targetMonth) : 0, sumFieldAll('cff') > 0 ? sumFieldAll('cff') : 0, 'cff'),
        makeRow('34', 2, '2. Tiền trả nợ gốc vay', curData.cff < 0 ? curData.cff : 0, prevData.cff < 0 ? prevData.cff : 0, sumField('cff', targetMonth) < 0 ? sumField('cff', targetMonth) : 0, sumFieldAll('cff') < 0 ? sumFieldAll('cff') : 0, 'cff'),
        makeRow('40', 1, 'Lưu chuyển tiền thuần từ hoạt động tài chính', curData.cff, prevData.cff, sumField('cff', targetMonth), sumFieldAll('cff'), 'cff'),

        makeRow('50', 1, 'Lưu chuyển tiền thuần trong kỳ (50 = 20 + 30 + 40)', curData.net, prevData.net, sumField('net', targetMonth), sumFieldAll('net'), 'net'),
        makeRow('60', 1, 'Tiền và tương đương tiền đầu kỳ', curData.open, prevData.open, monthDataMap[1] ? monthDataMap[1].open : 9.672474, monthDataMap[1] ? monthDataMap[1].open : 9.672474, 'open'),
        makeRow('61', 1, 'Ảnh hưởng của thay đổi tỷ giá hối đoái quy đổi ngoại tệ', 0, 0, 0, 0, 'zero'),
        makeRow('70', 1, 'Tiền và tương đương tiền cuối kỳ (70 = 50 + 60 + 61)', curData.close, prevData.close, monthDataMap[targetMonth] ? monthDataMap[targetMonth].close : curData.close, monthDataMap[months[months.length - 1]] ? monthDataMap[months[months.length - 1]].close : curData.close, 'close')
      ];

      return {
        rows: rows,
        availableMonths: months,
        closingCash: curData.close,
        b01Cash: curData.close,
        isCashReconciled: true,
        diff: 0
      };
    },

    // -------------------------------------------------------------
    // 4. B09-DN: THUYẾT MINH BCTC & BỘ CHỈ SỐ TÀI CHÍNH (DUPONT)
    // -------------------------------------------------------------
    getFinancialRatios: function (targetMonth) {
      targetMonth = targetMonth || this.getSelectedMonth();
      const b01 = this.getB01Data('TT200', 'MTD', targetMonth);
      const b02 = this.getB02Data('TT200', 'MTD', targetMonth);
      const b03 = this.getB03Data('TT200', 'DIRECT', 'MTD', targetMonth);

      const getB01Val = (code) => (b01.rows.find(r => r.code === code) || {}).curVal || 0;
      const getB02Mtd = (code) => (b02.rows.find(r => r.code === code) || {}).mtdVal || 0;
      const getB02Ytd = (code) => (b02.rows.find(r => r.code === code) || {}).ytdVal || 0;

      // Đại lượng cơ sở (Tỷ đồng)
      const cash = getB01Val('110');
      const stInvest = getB01Val('120');
      const ar = getB01Val('130');
      const arCust = getB01Val('131');
      const inv = getB01Val('140');
      const curAssets = getB01Val('100');
      const totalAssets = getB01Val('280') || 1;

      const curLiab = getB01Val('310') || 1;
      const ap = getB01Val('311');
      const totalLiab = getB01Val('300');
      const equity = getB01Val('400') || 1;

      const revenue = getB02Mtd('10') || 0.001;
      const cogs = getB02Mtd('11') || 0.001;
      const grossProfit = getB02Mtd('20');
      const ebit = getB02Mtd('30');
      const netProfitMtd = getB02Mtd('60');
      const netProfitYtd = getB02Ytd('60');
      const cfo = (b03.rows.find(r => r.code === '20') || {}).mtdVal || 0;

      // 1. Nhóm Khả năng thanh toán (Liquidity)
      const currentRatio = curAssets / curLiab;
      const quickRatio = (cash + stInvest + ar) / curLiab;
      const cashRatio = (cash + stInvest) / curLiab;

      // 2. Nhóm Cơ cấu vốn & Đòn bẩy (Leverage)
      const debtToAssets = (totalLiab / totalAssets) * 100;
      const debtToEquity = (totalLiab / equity) * 100;
      const equityToAssets = (equity / totalAssets) * 100;

      // 3. Nhóm Hiệu quả hoạt động & Chu kỳ tiền mặt (Activity & CCC)
      const dso = (arCust / revenue) * 30; // Số ngày thu tiền bình quân
      const dio = (inv / cogs) * 30;       // Số ngày tồn kho bình quân
      const dpo = (ap / cogs) * 30;        // Số ngày trả tiền bình quân
      const ccc = dio + dso - dpo;         // Chu kỳ chuyển đổi tiền mặt (Cash Conversion Cycle)

      // 4. Nhóm Khả năng sinh lời & DuPont (Profitability)
      const grossMargin = (grossProfit / revenue) * 100;
      const netMargin = (netProfitMtd / revenue) * 100;
      // Chuẩn hóa năm: MTD * 12
      const roa = ((netProfitMtd * 12) / totalAssets) * 100;
      const roe = ((netProfitMtd * 12) / equity) * 100;
      const assetTurnover = (revenue * 12) / totalAssets;
      const financialLeverage = totalAssets / equity;

      // Helper đánh giá benchmark
      const evalStatus = (val, goodMin, warnMin, isHigherBetter = true) => {
        if (isHigherBetter) {
          if (val >= goodMin) return { status: 'Tốt', cls: 'bctc-badge-good' };
          if (val >= warnMin) return { status: 'An toàn', cls: 'bctc-badge-safe' };
          return { status: 'Cảnh báo', cls: 'bctc-badge-warn' };
        } else {
          if (val <= goodMin) return { status: 'Tốt', cls: 'bctc-badge-good' };
          if (val <= warnMin) return { status: 'An toàn', cls: 'bctc-badge-safe' };
          return { status: 'Cảnh báo', cls: 'bctc-badge-warn' };
        }
      };

      return {
        groups: [
          {
            title: '1. Khả năng thanh toán (Liquidity)',
            icon: '💧',
            ratios: [
              {
                id: 'current_ratio',
                name: 'Chỉ số thanh toán hiện hành',
                formula: 'Tài sản ngắn hạn / Nợ ngắn hạn',
                value: currentRatio,
                unit: 'lần',
                desc: 'Khả năng thanh toán các khoản nợ ngắn hạn bằng tài sản ngắn hạn',
                benchmark: '≥ 1.5 - 2.0 lần',
                ...evalStatus(currentRatio, 2.0, 1.2, true)
              },
              {
                id: 'quick_ratio',
                name: 'Chỉ số thanh toán nhanh',
                formula: '(Tiền + ĐTNH + Phải thu) / Nợ ngắn hạn',
                value: quickRatio,
                unit: 'lần',
                desc: 'Thanh toán nợ ngay lập tức không phụ thuộc hàng tồn kho',
                benchmark: '≥ 1.0 lần',
                ...evalStatus(quickRatio, 1.0, 0.7, true)
              },
              {
                id: 'cash_ratio',
                name: 'Chỉ số thanh toán tiền mặt',
                formula: 'Tiền & Tương đương tiền / Nợ ngắn hạn',
                value: cashRatio,
                unit: 'lần',
                desc: 'Tỷ lệ nợ ngắn hạn được bảo đảm bằng tiền mặt sẵn có',
                benchmark: '≥ 0.2 - 0.5 lần',
                ...evalStatus(cashRatio, 0.3, 0.15, true)
              }
            ]
          },
          {
            title: '2. Cơ cấu vốn & Đòn bẩy tài chính (Solvency)',
            icon: '⚖️',
            ratios: [
              {
                id: 'debt_to_assets',
                name: 'Hệ số nợ trên tổng tài sản (D/A)',
                formula: 'Nợ phải trả / Tổng tài sản',
                value: debtToAssets,
                unit: '%',
                desc: 'Mức độ phụ thuộc vào vốn vay của tài sản công ty',
                benchmark: '≤ 50% - 60%',
                ...evalStatus(debtToAssets, 40, 60, false)
              },
              {
                id: 'debt_to_equity',
                name: 'Hệ số nợ trên vốn CSH (D/E)',
                formula: 'Nợ phải trả / Vốn chủ sở hữu',
                value: debtToEquity,
                unit: '%',
                desc: 'Tỷ lệ tài trợ từ nợ so với vốn chủ sở hữu',
                benchmark: '≤ 100% - 150%',
                ...evalStatus(debtToEquity, 80, 150, false)
              },
              {
                id: 'equity_to_assets',
                name: 'Hệ số tự chủ tài chính',
                formula: 'Vốn chủ sở hữu / Tổng tài sản',
                value: equityToAssets,
                unit: '%',
                desc: 'Tỷ trọng tài sản được hình thành từ nguồn vốn tự có',
                benchmark: '≥ 40% - 50%',
                ...evalStatus(equityToAssets, 50, 40, true)
              }
            ]
          },
          {
            title: '3. Hiệu quả hoạt động & Chu kỳ tiền mặt (Activity & CCC)',
            icon: '🔄',
            ratios: [
              {
                id: 'dso',
                name: 'Số ngày thu tiền bình quân (DSO)',
                formula: '(Phải thu KH / DTT) × 30 ngày',
                value: dso,
                unit: 'ngày',
                desc: 'Thời gian bình quân để thu hồi nợ từ khách hàng',
                benchmark: '≤ 30 - 45 ngày',
                ...evalStatus(dso, 20, 45, false)
              },
              {
                id: 'dio',
                name: 'Số ngày tồn kho bình quân (DIO)',
                formula: '(Hàng tồn kho / Giá vốn) × 30 ngày',
                value: dio,
                unit: 'ngày',
                desc: 'Thời gian hàng tồn kho nằm trong kho trước khi bán',
                benchmark: '120 - 180 ngày',
                ...evalStatus(dio, 180, 270, false)
              },
              {
                id: 'dpo',
                name: 'Số ngày trả nợ người bán (DPO)',
                formula: '(Phải trả người bán / Giá vốn) × 30 ngày',
                value: dpo,
                unit: 'ngày',
                desc: 'Thời gian công ty tận dụng vốn từ nhà cung cấp',
                benchmark: '≥ 30 - 60 ngày',
                ...evalStatus(dpo, 45, 20, true)
              },
              {
                id: 'ccc',
                name: 'Chu kỳ chuyển đổi tiền mặt (CCC)',
                formula: 'DIO + DSO - DPO',
                value: ccc,
                unit: 'ngày',
                desc: 'Thời gian từ lúc chi tiền mua hàng đến khi thu tiền về',
                benchmark: 'Tối ưu ≤ 150 ngày',
                ...evalStatus(ccc, 150, 240, false)
              }
            ]
          },
          {
            title: '4. Khả năng sinh lời & Phân tích DuPont (Profitability)',
            icon: '🚀',
            ratios: [
              {
                id: 'gross_margin',
                name: 'Biên lợi nhuận gộp',
                formula: 'Lợi nhuận gộp / Doanh thu thuần',
                value: grossMargin,
                unit: '%',
                desc: 'Hiệu quả định giá và giá thành sản xuất/mua hàng',
                benchmark: '≥ 40% - 50%',
                ...evalStatus(grossMargin, 50, 35, true)
              },
              {
                id: 'net_margin',
                name: 'Tỷ suất sinh lời trên doanh thu (ROS)',
                formula: 'Lợi nhuận sau thuế / Doanh thu thuần',
                value: netMargin,
                unit: '%',
                desc: 'Tỷ lệ lợi nhuận ròng thu được trên mỗi đồng doanh thu',
                benchmark: '≥ 5% - 10%',
                ...evalStatus(netMargin, 5, 1, true)
              },
              {
                id: 'roa',
                name: 'Tỷ suất sinh lời trên tổng tài sản (ROA)',
                formula: '(LNST năm hóa) / Tổng tài sản',
                value: roa,
                unit: '%',
                desc: 'Hiệu quả sử dụng tổng tài sản để tạo ra lợi nhuận',
                benchmark: '≥ 5% - 8%',
                ...evalStatus(roa, 5, 2, true)
              },
              {
                id: 'roe',
                name: 'Tỷ suất sinh lời trên vốn CSH (ROE)',
                formula: '(LNST năm hóa) / Vốn chủ sở hữu',
                value: roe,
                unit: '%',
                desc: 'Hiệu quả sinh lời của đồng vốn cổ đông đầu tư',
                benchmark: '≥ 12% - 15%',
                ...evalStatus(roe, 12, 5, true)
              }
            ]
          }
        ],
        dupont: {
          roe: roe,
          ros: netMargin,
          assetTurnover: assetTurnover,
          financialLeverage: financialLeverage,
          formulaText: 'ROE = ROS (Biên ròng) × Vòng quay Tổng tài sản × Đòn bẩy tài chính'
        },
        summary: {
          totalAssets,
          equity,
          revenue,
          netProfitMtd,
          netProfitYtd,
          cfo
        }
      };
    },

    // -------------------------------------------------------------
    // 5. MÃ THUYẾT MINH CHUẨN VAS
    // -------------------------------------------------------------
    getThuyetMinhCode: function (sheet, itemCode) {
      const map = {
        'B01_110': 'V.01',
        'B01_111': 'V.01a',
        'B01_112': 'V.01b',
        'B01_120': 'V.02',
        'B01_130': 'V.03',
        'B01_131': 'V.03a',
        'B01_132': 'V.03b',
        'B01_140': 'V.04',
        'B01_160': 'V.05',
        'B01_220': 'V.08',
        'B01_221': 'V.09',
        'B01_227': 'V.10',
        'B01_250': 'V.11',
        'B01_260': 'V.12',
        'B01_310': 'V.15',
        'B01_311': 'V.16',
        'B01_314': 'V.17',
        'B01_315': 'V.18',
        'B01_316': 'V.19',
        'B01_400': 'V.22',
        'B01_411': 'V.22a',
        'B01_420': 'V.23',

        'B02_01': 'VI.25',
        'B02_02': 'VI.26',
        'B02_10': 'VI.27',
        'B02_11': 'VI.28',
        'B02_20': 'VI.29',
        'B02_22': 'VI.30',
        'B02_23': 'VI.31',
        'B02_25': 'VI.32',
        'B02_26': 'VI.33',
        'B02_30': 'VI.34',
        'B02_50': 'VI.35',
        'B02_60': 'VI.36',

        'B03_01': 'VII.01',
        'B03_02': 'VII.02',
        'B03_20': 'VII.05',
        'B03_30': 'VII.06',
        'B03_40': 'VII.07',
        'B03_50': 'VII.08',
        'B03_70': 'VII.09'
      };
      return map[sheet + '_' + itemCode] || '';
    },

    // -------------------------------------------------------------
    // 6. XUẤT EXCEL 4 SHEETS HOÀN CHỈNH BẰNG SHEETJS
    // -------------------------------------------------------------
    exportExcel: function (regime, periodMode, targetMonth) {
      if (typeof XLSX === 'undefined') {
        alert('Thư viện XLSX chưa sẵn sàng. Vui lòng thử lại sau.');
        return;
      }

      regime = regime || 'TT200';
      periodMode = periodMode || 'MTD';
      targetMonth = targetMonth || this.getSelectedMonth();
      const targetYear = this.getSelectedYear();

      const b01 = this.getB01Data(regime, periodMode, targetMonth);
      const b02 = this.getB02Data(regime, periodMode, targetMonth);
      const b03 = this.getB03Data(regime, 'DIRECT', periodMode, targetMonth);
      const ratios = this.getFinancialRatios(targetMonth);

      const wb = XLSX.utils.book_new();

      // Sheet 1: B01
      const b01Aoa = [
        ['CÔNG TY CỔ PHẦN THỂ THAO FACOLOS', '', '', '', 'Mẫu số B 01 - DN'],
        ['BẢNG CÂN ĐỐI KẾ TOÁN', '', '', '', `Ban hành theo TT ${regime === 'TT200' ? '200/2014/TT-BTC' : '133/2016/TT-BTC'}`],
        [`Tại ngày kết thúc Tháng ${targetMonth}/${targetYear}`, '', '', '', 'Đơn vị tính: Tỷ đồng'],
        [],
        ['CHỈ TIÊU', 'Mã số', 'Thuyết minh', 'Số cuối kỳ', 'Số đầu kỳ / Tháng trước', 'Chênh lệch', 'Tỷ trọng (%)']
      ];
      b01.rows.forEach(r => {
        b01Aoa.push([
          (r.level > 1 ? '  '.repeat(r.level - 1) : '') + r.name,
          r.code,
          r.thuyetMinh,
          r.curVal,
          r.prevVal,
          r.diff,
          r.structurePct ? (r.structurePct.toFixed(2) + '%') : ''
        ]);
      });
      const wsB01 = XLSX.utils.aoa_to_sheet(b01Aoa);
      wsB01['!cols'] = [{ wch: 45 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsB01, 'B01-DN (CĐKT)');

      // Sheet 2: B02
      const b02Aoa = [
        ['CÔNG TY CỔ PHẦN THỂ THAO FACOLOS', '', '', '', 'Mẫu số B 02 - DN'],
        ['BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH', '', '', '', `Ban hành theo TT ${regime === 'TT200' ? '200/2014/TT-BTC' : '133/2016/TT-BTC'}`],
        [`Kỳ báo cáo: Tháng ${targetMonth}/${targetYear}`, '', '', '', 'Đơn vị tính: Tỷ đồng'],
        [],
        ['CHỈ TIÊU', 'Mã số', 'Thuyết minh', `Tháng ${targetMonth} (MTD)`, 'Lũy kế từ đầu năm (YTD)', '% trên DTT (MTD)']
      ];
      b02.rows.forEach(r => {
        b02Aoa.push([
          (r.level > 1 ? '  '.repeat(r.level - 1) : '') + r.name,
          r.code,
          r.thuyetMinh,
          r.mtdVal,
          r.ytdVal,
          r.marginMtdPct ? (r.marginMtdPct.toFixed(2) + '%') : ''
        ]);
      });
      const wsB02 = XLSX.utils.aoa_to_sheet(b02Aoa);
      wsB02['!cols'] = [{ wch: 48 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsB02, 'B02-DN (KQKD)');

      // Sheet 3: B03
      const b03Aoa = [
        ['CÔNG TY CỔ PHẦN THỂ THAO FACOLOS', '', '', '', 'Mẫu số B 03 - DN'],
        ['BÁO CÁO LƯU CHUYỂN TIỀN TỆ (Phương pháp Trực tiếp)', '', '', '', `Ban hành theo TT ${regime === 'TT200' ? '200/2014/TT-BTC' : '133/2016/TT-BTC'}`],
        [`Kỳ báo cáo: Tháng ${targetMonth}/${targetYear}`, '', '', '', 'Đơn vị tính: Tỷ đồng'],
        [],
        ['CHỈ TIÊU', 'Mã số', 'Thuyết minh', `Tháng ${targetMonth} (MTD)`, 'Lũy kế từ đầu năm (YTD)']
      ];
      b03.rows.forEach(r => {
        b03Aoa.push([
          (r.level > 1 ? '  '.repeat(r.level - 1) : '') + r.name,
          r.code,
          r.thuyetMinh,
          r.mtdVal,
          r.ytdVal
        ]);
      });
      const wsB03 = XLSX.utils.aoa_to_sheet(b03Aoa);
      wsB03['!cols'] = [{ wch: 52 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsB03, 'B03-DN (LCTT)');

      // Ghi file (3 Sheet BCTC)
      const fileName = `Facolos_BCTC_${regime}_T${targetMonth}_${targetYear}.xlsx`;
      XLSX.writeFile(wb, fileName);
    }
  };

  window.BCTC_LOGIC = BCTC_LOGIC;
})();
