/**
 * =========================================================================
 * FACOLOS EXECUTIVE DASHBOARD - SUPABASE LIVE DATA LOADER
 * =========================================================================
 * Tự động đồng bộ 5 bảng dữ liệu từ Supabase:
 *  1. detail_bcqt      (Thực tế BCQT)
 *  2. khkd_bcqt        (Kế hoạch kinh doanh)
 *  3. phong_ban        (Chuẩn hoá mã/tên phòng ban)
 *  4. detail_sanpham   (Báo cáo sản phẩm chi tiết / tỉnh thành / kênh / SKU)
 *  5. Tinh_thanh_chuan (Từ điển chuẩn hoá tên tỉnh thành)
 *
 * Tính năng nổi bật:
 *  - Tự động phân tích & tính toán KPI, Kênh, Sản phẩm, Chi phí, Tỉnh thành (Bản đồ VN).
 *  - Giữ nguyên tính năng Upload Excel riêng cho "Phân tích và nhận xét chuyên sâu"
 *    (lưu trữ bền vững vào localStorage để không bị mất khi tải lại).
 *  - Tự động hiển thị thanh trạng thái kết nối & nút bấm Đồng bộ nhanh.
 * =========================================================================
 */

(function () {
  'use strict';

  /* ===== CẤU HÌNH SUPABASE ===== */
  const SUPABASE_URL = 'https://nxcfmoqktarcmyweowty.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_zn4FelE4oi6KzXr835EX9w_vc0HGmDR';

  const T_BCQT  = 'detail_bcqt';
  const T_KHKD  = 'khkd_bcqt';
  const T_PB    = 'phong_ban';
  const T_SP    = 'detail_sanpham';
  const T_TINH  = 'Tinh_thanh_chuan';
  const T_CDKT  = 'detail_cdkt';
  const T_KQKD  = 'detail_kqkd';
  const T_LCTT  = 'detai_lctt';

  /* ===== TIỆN ÍCH CHUYỂN ĐỔI SỐ ===== */
  function toNum(v) {
    if (v === null || v === undefined || v === '' || v === '-' || v === ' -   ') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    let s = String(v).trim().replace(/\s/g, '');
    if (!s || s === '-') return 0;
    // Xử lý định dạng VN (1.000.000,50 hoặc 1,50)
    if (s.includes('.') && s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    } else if (s.includes('.')) {
      // Kiểm tra nếu là phân cách hàng nghìn (vd: 3.541.667)
      const parts = s.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        s = s.replace(/\./g, '');
      }
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /* ===== FETCH TẤT CẢ ROWS VỚI PHÂN TRANG (VƯỢT GIỚI HẠN 1000 CỦA SUPABASE) ===== */
  async function fetchAll(table, select = '*', onProgress = null) {
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'count=exact'
    };
    let allRows = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&offset=${from}&limit=${PAGE}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Bảng ${table} [${res.status}]: ${txt}`);
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      allRows = allRows.concat(rows);
      if (onProgress) onProgress(allRows.length);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return allRows;
  }

  /* ===== CHUẨN HOÁ TÊN PHÒNG BAN ===== */
  function buildDeptMap(pbRows) {
    const map = new Map();
    (pbRows || []).forEach(r => {
      const ten = (r['Tên Phòng ban'] || r.ten_phong_ban || '').trim();
      const chuan = (r['Tên chuẩn'] || r.ten_chuan || ten).trim();
      if (ten) map.set(ten.toLowerCase(), chuan);
    });
    return map;
  }

  function normDept(name, deptMap) {
    if (!name) return 'Tổng Công ty';
    const clean = String(name).trim();
    return deptMap.get(clean.toLowerCase()) || clean;
  }

  /* ===== CHUẨN HOÁ TÊN TỈNH THÀNH ===== */
  function buildProvinceMap(tinhRows) {
    const map = new Map();
    (tinhRows || []).forEach(r => {
      const goc = (r['Tỉnh thành'] || r.tinh_thanh || '').trim();
      const chuan = (r['Tỉnh thành chuẩn'] || r.tinh_thanh_chuan || goc).trim();
      if (goc) map.set(goc.toLowerCase(), chuan);
    });
    return map;
  }

  function normProvince(rawName, addr, provMap) {
    let name = String(rawName || '').trim();
    if (!name && addr) {
      const parts = String(addr).split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) name = parts[parts.length - 1];
    }
    if (!name) return '(blank)';
    const clean = name.replace(/^Tỉnh\s+|^Thành phố\s+|^TP\.?\s+/i, '').trim();
    return provMap.get(clean.toLowerCase()) || provMap.get(name.toLowerCase()) || clean;
  }

  /* ===== CHUẨN HOÁ NHÓM VTHH SẢN PHẨM ===== */
  function normCategory(code, name) {
    const c = String(code || '').toUpperCase().trim();
    if (c === 'VOT') return 'Vợt';
    if (c === 'BONG') return 'Bóng';
    if (c === 'PHUKIEN' || c === 'PK') return 'Phụ kiện';
    if (c === 'THOITRANG' || c === 'GIAY' || c === 'AO' || c === 'QUAN') return 'Thời trang';
    if (c === 'VATTU') return 'Vật tư';
    const n = String(name || '').toLowerCase();
    if (n.includes('vợt') || n.includes('paddle')) return 'Vợt';
    if (n.includes('bóng') || n.includes('ball')) return 'Bóng';
    if (n.includes('giày') || n.includes('áo') || n.includes('quần') || n.includes('t-shirt') || n.includes('tất')) return 'Thời trang';
    if (n.includes('cuốn cán') || n.includes('balo') || n.includes('băng')) return 'Phụ kiện';
    return 'Khác';
  }

  /* ===== CHUẨN HOÁ KÊNH BÁN HÀNG ===== */
  function normChannel(chName) {
    const s = String(chName || '').toLowerCase();
    if (s.includes('quốc tế') || s.includes('international') || s.includes('global')) return 'Sỉ Quốc tế';
    if (s.includes('bán lẻ') || s.includes('shopee') || s.includes('tiktok') || s.includes('facebook') || s.includes('website') || s.includes('b2c')) return 'Bán lẻ';
    if (s.includes('partnership') || s.includes('b2b2c') || s.includes('thúc đẩy')) return 'Partnership';
    return 'Sỉ Việt Nam';
  }

  /* =========================================================================
   * BỘ TÍNH TOÁN CÁC BẢNG DỮ LIỆU BÁO CÁO
   * ========================================================================= */

  /* 1. TÍNH BẢNG KPI TỪ DETAIL_BCQT VÀ KHKD_BCQT */
  function buildKpi(bcqtRows, khkdRows) {
    const monthMap = {};
    function ensureMonth(label) {
      if (!monthMap[label]) {
        monthMap[label] = { DTT_tt: 0, DTT_kh: 0, GV_tt: 0, GV_kh: 0, LNG_tt: 0, LNG_kh: 0, CPBH_tt: 0, CPBH_kh: 0, CPQL_tt: 0, CPQL_kh: 0, EBITDA_tt: 0, EBITDA_kh: 0 };
      }
      return monthMap[label];
    }

    (bcqtRows || []).forEach(r => {
      const cap = parseInt(r['Cấp'] || r.cap || 0);
      if (cap !== 1) return;
      const pb = String(r['Phòng ban'] || r.phong_ban || '').trim().toLowerCase();
      if (pb && !pb.includes('tổng công ty') && !pb.includes('tong cong ty')) return;
      const thang = parseInt(r['Tháng'] || r.thang || 0);
      const nam = parseInt(r['Năm'] || r.nam || 2026);
      if (!thang) return;
      const label = `T${thang}/${nam}`;
      const m = ensureMonth(label);
      const tt = toNum(r['Thực tế'] || r.thuc_te);
      const ma = String(r['Mã số'] || r.ma_so || '').trim();

      if (ma === '3') m.DTT_tt += tt;
      else if (ma === '4') m.GV_tt += tt;
      else if (ma === '5') m.LNG_tt += tt;
      else if (ma === '8') m.CPBH_tt += tt;
      else if (ma === '9') m.CPQL_tt += tt;
      else if (ma === '10') m.EBITDA_tt += tt;
    });

    (khkdRows || []).forEach(r => {
      const cap = parseInt(r['Cấp'] || r.cap || 0);
      if (cap !== 1) return;
      const pb = String(r['Phòng ban'] || r.phong_ban || '').trim().toLowerCase();
      if (pb && !pb.includes('tổng công ty') && !pb.includes('tong cong ty')) return;
      const thang = parseInt(r['Tháng'] || r.thang || 0);
      const nam = parseInt(r['Năm'] || r.nam || 2026);
      if (!thang) return;
      const label = `T${thang}/${nam}`;
      // CHỈ lấy kế hoạch cho những tháng đã có dữ liệu thực tế ở detail_bcqt
      if (!monthMap[label]) return;
      const m = monthMap[label];
      const kh = toNum(r['Kế hoạch'] || r.ke_hoach);
      const ma = String(r['Mã số'] || r.ma_so || '').trim();

      if (ma === '3') m.DTT_kh += kh;
      else if (ma === '4') m.GV_kh += kh;
      else if (ma === '5') m.LNG_kh += kh;
      else if (ma === '8') m.CPBH_kh += kh;
      else if (ma === '9') m.CPQL_kh += kh;
      else if (ma === '10') m.EBITDA_kh += kh;
    });

    const kpiRows = [];
    const sortedMonths = Object.keys(monthMap).sort((a, b) => {
      const [ta, ya] = a.replace('T', '').split('/').map(Number);
      const [tb, yb] = b.replace('T', '').split('/').map(Number);
      return (ya * 12 + ta) - (yb * 12 + tb);
    });

    sortedMonths.forEach(label => {
      const m = monthMap[label];
      const add = (ct, tt, kh) => {
        kpiRows.push({
          'Tháng': label,
          'Chỉ tiêu': ct,
          'Kế hoạch (tỷ đồng)': kh,
          'Thực tế (tỷ đồng)': tt
        });
      };
      add('Doanh thu thuần', m.DTT_tt, m.DTT_kh);
      add('Giá vốn', m.GV_tt, m.GV_kh);
      add('Lợi nhuận gộp', m.LNG_tt, m.LNG_kh);
      add('CPBH', m.CPBH_tt, m.CPBH_kh);
      add('CPQL', m.CPQL_tt, m.CPQL_kh);
      const ebitda_tt = m.EBITDA_tt !== 0 ? m.EBITDA_tt : (m.LNG_tt - m.CPBH_tt - m.CPQL_tt);
      const ebitda_kh = m.EBITDA_kh !== 0 ? m.EBITDA_kh : (m.LNG_kh - m.CPBH_kh - m.CPQL_kh);
      add('EBITDA', ebitda_tt, ebitda_kh);
      add('Chi phí vận hành', m.CPBH_tt + m.CPQL_tt, m.CPBH_kh + m.CPQL_kh);
    });

    return kpiRows;
  }

  /* 2. TÍNH BẢNG KÊNH DOANH THU */
  function buildKenh(bcqtRows, khkdRows) {
    const monthMap = {};
    function ensure(label) {
      if (!monthMap[label]) monthMap[label] = {};
      return monthMap[label];
    }
    function addVal(m, ch, tt, kh) {
      if (!m[ch]) m[ch] = { tt: 0, kh: 0 };
      m[ch].tt += tt;
      m[ch].kh += kh;
    }

    (bcqtRows || []).forEach(r => {
      const pb = String(r['Phòng ban'] || r.phong_ban || '').trim().toLowerCase();
      if (pb && !pb.includes('tổng công ty')) return;
      const thang = parseInt(r['Tháng'] || r.thang || 0);
      const nam = parseInt(r['Năm'] || r.nam || 2026);
      if (!thang) return;
      const label = `T${thang}/${nam}`;
      const m = ensure(label);
      const ma = String(r['Mã số'] || r.ma_so || '').trim();
      const val = toNum(r['Thực tế'] || r.thuc_te);

      if (ma === '1.1.1' || ma === '3.1.1') addVal(m, 'Sỉ Việt Nam', val, 0);
      else if (ma === '1.1.2' || ma === '3.1.2') addVal(m, 'Sỉ Quốc tế', val, 0);
      else if (ma === '1.2' || ma === '3.2') addVal(m, 'Bán lẻ', val, 0);
      else if (ma === '1.4' || ma === '3.4') addVal(m, 'Partnership', val, 0);
    });

    (khkdRows || []).forEach(r => {
      const pb = String(r['Phòng ban'] || r.phong_ban || '').trim().toLowerCase();
      if (pb && !pb.includes('tổng công ty')) return;
      const thang = parseInt(r['Tháng'] || r.thang || 0);
      const nam = parseInt(r['Năm'] || r.nam || 2026);
      if (!thang) return;
      const label = `T${thang}/${nam}`;
      // CHỈ lấy kế hoạch cho những tháng đã có dữ liệu thực tế ở detail_bcqt
      if (!monthMap[label]) return;
      const m = monthMap[label];
      const ma = String(r['Mã số'] || r.ma_so || '').trim();
      const val = toNum(r['Kế hoạch'] || r.ke_hoach);

      if (ma === '1.1.1' || ma === '3.1.1') addVal(m, 'Sỉ Việt Nam', 0, val);
      else if (ma === '1.1.2' || ma === '3.1.2') addVal(m, 'Sỉ Quốc tế', 0, val);
      else if (ma === '1.2' || ma === '3.2') addVal(m, 'Bán lẻ', 0, val);
      else if (ma === '1.4' || ma === '3.4') addVal(m, 'Partnership', 0, val);
    });

    const channels = ['Sỉ Quốc tế', 'Sỉ Việt Nam', 'Bán lẻ', 'Partnership'];
    const kenhRows = [];
    const sortedMonths = Object.keys(monthMap).sort((a, b) => {
      const [ta, ya] = a.replace('T', '').split('/').map(Number);
      const [tb, yb] = b.replace('T', '').split('/').map(Number);
      return (ya * 12 + ta) - (yb * 12 + tb);
    });

    sortedMonths.forEach(label => {
      const m = monthMap[label];
      channels.forEach(ch => {
        const item = m[ch] || { tt: 0, kh: 0 };
        kenhRows.push({
          'Tháng': label,
          'Kênh': ch,
          'Kế hoạch (tỷ đồng)': item.kh,
          'Thực tế (tỷ đồng)': item.tt
        });
      });
    });

    return kenhRows;
  }

  /* 3. TÍNH BẢNG SẢN PHẨM & SKU CHI TIẾT TỪ DETAIL_SANPHAM (NẾU CÓ) HOẶC FALLBACK */
  function buildSanPhamFromDetail(spRows) {
    if (!spRows || !spRows.length) return { sanPham: [], sanPhamCT: [], tinhThanh: [] };

    const spMonthMap = {};     // label -> cat -> {tt, kh}
    const skuMap = {};         // label -> sku -> {soLuong, dthu, kenh, nhom}
    const tinhMap = {};        // label#tinh#kenh#nhom -> {soLuong, dthu}

    spRows.forEach(r => {
      const dateStr = String(r['Ngày hạch toán'] || r.ngay_hach_toan || '').trim();
      let m = 0, y = 2026;
      if (dateStr) {
        const parts = dateStr.split('/');
        if (parts.length >= 3) {
          m = parseInt(parts[1], 10);
          y = parseInt(parts[2], 10);
        }
      }
      if (!m || isNaN(m)) return;
      const monthLabel = `T${m}/${y}`;

      const cat = normCategory(r['NHÓM VTHH'] || r.nhom_vthh, r['Tên hàng'] || r.ten_hang);
      const ch = normChannel(r['Tên nhóm khách hàng sửa'] || r.ten_nhom_kh || '');
      const dthuVND = toNum(r['DTHU NET'] || r.dthu_net);
      const dthuTy = dthuVND / 1000000000; // Đổi sang tỷ đồng
      const sl = toNum(r['Tổng số lượng bán'] || r.tong_so_luong_ban);
      const sku = String(r['Tên hàng'] || r.ten_hang || 'Chưa phân loại').trim();

      // 1. Tổng nhóm sản phẩm
      if (!spMonthMap[monthLabel]) spMonthMap[monthLabel] = {};
      if (!spMonthMap[monthLabel][cat]) spMonthMap[monthLabel][cat] = { tt: 0, kh: 0 };
      spMonthMap[monthLabel][cat].tt += dthuTy;

      // 2. Chi tiết SKU
      if (!skuMap[monthLabel]) skuMap[monthLabel] = {};
      if (!skuMap[monthLabel][sku]) skuMap[monthLabel][sku] = { soLuong: 0, dthu: 0, kenh: ch, nhom: cat };
      skuMap[monthLabel][sku].soLuong += sl;
      skuMap[monthLabel][sku].dthu += dthuTy;

      // 3. Tỉnh thành
      const tinh = normProvince(r['Tỉnh/Thành phố'] || r.tinh_thanh_pho, r['Địa điểm giao hàng'] || r.dia_diem_giao_hang, window._globalProvinceMap || new Map());
      const kTinh = `${monthLabel}#${tinh}#${ch}#${cat}`;
      if (!tinhMap[kTinh]) tinhMap[kTinh] = { thang: monthLabel, tinh, kenh: ch, nhom: cat, soLuong: 0, dthu: 0 };
      tinhMap[kTinh].soLuong += sl;
      tinhMap[kTinh].dthu += dthuTy;
    });

    // Tạo sanPham
    const categories = ['Vợt', 'Bóng', 'Phụ kiện', 'Thời trang', 'Vật tư', 'Khác'];
    const sanPham = [];
    Object.keys(spMonthMap).sort().forEach(ml => {
      categories.forEach(cat => {
        const item = spMonthMap[ml][cat] || { tt: 0, kh: 0 };
        sanPham.push({
          'Tháng': ml,
          'Sản phẩm': cat,
          'Kế hoạch (tỷ đồng)': item.kh,
          'Thực tế (tỷ đồng)': item.tt
        });
      });
    });

    // Tạo sanPhamCT
    const sanPhamCT = [];
    Object.keys(skuMap).forEach(ml => {
      Object.keys(skuMap[ml]).forEach(sku => {
        const item = skuMap[ml][sku];
        sanPhamCT.push({
          'Tháng': ml,
          'Kênh': item.kenh,
          'Nhóm': item.nhom,
          'Sản phẩm': sku,
          'Số lượng': Math.round(item.soLuong),
          'Doanh thu (tỷ đồng)': item.dthu
        });
      });
    });

    // Tạo tinhThanh
    const tinhThanh = Object.values(tinhMap).map(it => ({
      'Tháng': it.thang,
      'Tỉnh thành': it.tinh,
      'Kênh': it.kenh,
      'Nhóm': it.nhom,
      'Sản lượng': Math.round(it.soLuong),
      'Thực tế (tỷ đồng)': it.dthu
    }));

    return { sanPham, sanPhamCT, tinhThanh };
  }

  /* 4. TÍNH BẢNG CHI PHÍ CHI TIẾT TỪ BCQT */
  function buildChiPhi(bcqtRows, khkdRows, deptMap) {
    const chiPhi = [];
    (bcqtRows || []).forEach(r => {
      const cap = parseInt(r['Cấp'] || r.cap || 0);
      if (cap < 2) return;
      const maStr = String(r['Mã số'] || r.ma_so || '').trim();
      const ma = parseFloat(maStr);
      if (isNaN(ma) || ma < 8 || ma >= 13) return;

      const thang = parseInt(r['Tháng'] || r.thang || 0);
      const nam = parseInt(r['Năm'] || r.nam || 2026);
      if (!thang) return;
      const label = `T${thang}/${nam}`;
      const pb = normDept(r['Phòng ban'] || r.phong_ban, deptMap);
      const km = String(r['Khoản mục'] || r.khoan_muc || '').trim();
      const tt = toNum(r['Thực tế'] || r.thuc_te);

      let phanLoai = 'Chi phí khác';
      if (ma >= 8 && ma < 9) phanLoai = 'Chi phí bán hàng';
      else if (ma >= 9 && ma < 10) phanLoai = 'Chi phí quản lý';

      chiPhi.push({
        'Tháng': label,
        'Phân loại': phanLoai,
        'Mã số': maStr,
        'Cấp': String(cap),
        'Khoản mục chi phí': km,
        'Phòng ban': pb,
        'Định mức (tỷ đồng)': 0,
        'Thực tế (tỷ đồng)': tt,
        '%/DTT': 0,
        'Nguyên nhân chênh lệch': ''
      });
    });
    return chiPhi;
  }

  /* 5. TỔNG HỢP BCQTDETAIL & KEHOACHKD */
  function buildBcqtDetail(bcqtRows, khkdRows, deptMap) {
    const khMap = new Map();
    (khkdRows || []).forEach(r => {
      const t = parseInt(r['Tháng'] || r.thang || 0);
      const n = parseInt(r['Năm'] || r.nam || 2026);
      const ms = String(r['Mã số'] || r.ma_so || '').trim();
      const pb = normDept(r['Phòng ban'] || r.phong_ban, deptMap);
      const key = `${t}_${n}_${ms}_${pb}`;
      khMap.set(key, toNum(r['Kế hoạch'] || r.ke_hoach));
    });

    return (bcqtRows || []).map(r => {
      const t = parseInt(r['Tháng'] || r.thang || 0);
      const n = parseInt(r['Năm'] || r.nam || 2026);
      const ms = String(r['Mã số'] || r.ma_so || '').trim();
      const pb = normDept(r['Phòng ban'] || r.phong_ban, deptMap);
      const key = `${t}_${n}_${ms}_${pb}`;
      return {
        'Tháng': `T${t}/${n}`,
        'Tháng_num': t,
        'Năm': n,
        'Mã số': ms,
        'Cấp': parseInt(r['Cấp'] || r.cap || 0),
        'Khoản mục': String(r['Khoản mục'] || r.khoan_muc || '').trim(),
        'Phòng ban': pb,
        'Thực tế (tỷ đồng)': toNum(r['Thực tế'] || r.thuc_te),
        'Kế hoạch (tỷ đồng)': khMap.get(key) || 0
      };
    });
  }

  /* 6. BẢNG THÔNG TIN BÁO CÁO */
  function buildThongTin() {
    return [
      { 'Trường thông tin': 'Tên công ty', 'Giá trị': 'Công ty Cổ phần Thể Thao Facolos' },
      { 'Trường thông tin': 'Người lập báo cáo', 'Giá trị': 'Đỗ Minh Khoa' },
      { 'Trường thông tin': 'Cập nhật tự động', 'Giá trị': 'Supabase Cloud Sync' }
    ];
  }

  /* =========================================================================
   * GIAO DIỆN THANH ĐỒNG BỘ TRÊN BÁO CÁO
   * ========================================================================= */
  function setupLiveSyncBanner() {
    // 1. Thêm animation style cho đèn báo
    if (!document.getElementById('facolosSyncStyle')) {
      const st = document.createElement('style');
      st.id = 'facolosSyncStyle';
      st.textContent = `
        @keyframes pulseDot {
          0% { transform: scale(0.9); opacity: 0.7; }
          50% { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.7; }
        }
      `;
      document.head.appendChild(st);
    }

    // 2. Gắn sự kiện vào các nút đã có sẵn trong controlbar của index.html
    const btnSync = document.getElementById('btnSyncSupabase');
    if (btnSync && !btnSync._hasListener) {
      btnSync._hasListener = true;
      btnSync.addEventListener('click', (e) => {
        e.preventDefault();
        loadDataFromSupabase(true);
      });
    }

    const btnUpload = document.getElementById('btnUploadNhanXet');
    if (btnUpload && !btnUpload._hasListener) {
      btnUpload._hasListener = true;
      btnUpload.addEventListener('click', (e) => {
        e.preventDefault();
        openExcelNhanXetPicker();
      });
    }
  }

  function setSyncStatus(type, msg) {
    const dot = document.getElementById('supabaseStatusDot') || document.getElementById('syncStatusDot');
    const txt = document.getElementById('supabaseStatusText') || document.getElementById('syncStatusTxt');
    if (!dot || !txt) return;
    txt.textContent = msg;
    dot.style.animation = (type === 'loading') ? 'pulseDot 1.2s infinite' : 'none';

    if (type === 'loading') {
      dot.style.background = '#E5C17C';
      txt.style.color = '#E5C17C';
    } else if (type === 'ok') {
      dot.style.background = '#6FCF97';
      txt.style.color = '#6FCF97';
    } else if (type === 'warn') {
      dot.style.background = '#F2994A';
      txt.style.color = '#F2994A';
    } else {
      dot.style.background = '#EB5757';
      txt.style.color = '#EB5757';
    }
  }

  /* =========================================================================
   * XỬ LÝ UPLOAD EXCEL RIÊNG CHO PHÂN TÍCH & NHẬN XÉT
   * ========================================================================= */
  function openExcelNhanXetPicker() {
    let inp = document.getElementById('nhanXetFileInput');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file';
      inp.id = 'nhanXetFileInput';
      inp.accept = '.xlsx, .xls';
      inp.style.display = 'none';
      document.body.appendChild(inp);

      inp.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;
        if (typeof XLSX === 'undefined') {
          alert('Thư viện XLSX chưa tải xong, vui lòng thử lại sau 2 giây.');
          return;
        }
        try {
          setSyncStatus('loading', 'Đang đọc file Excel nhận xét...');
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });

          // Tìm sheet nhận xét
          const nxSheet = wb.SheetNames.find(n =>
            /nhan.?xet|phantich|nhanxet|phan.?tich|chuyen.?sau/i.test(n)
          ) || wb.SheetNames[0];

          const ws = wb.Sheets[nxSheet];
          let rows = [];
          if (typeof window.readNhanXetFlexible === 'function') {
            rows = window.readNhanXetFlexible(ws);
          }
          if (!rows || !rows.length) {
            rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
          }
          if (typeof window.normalizeNhanXetRows === 'function') {
            rows = window.normalizeNhanXetRows(rows);
          }

          if (!rows.length) {
            alert(`Sheet "${nxSheet}" không có dòng dữ liệu nào.`);
            return;
          }

          // Lưu vào localStorage
          localStorage.setItem('facolos_nhanxet_data', JSON.stringify(rows));

          // Gán vào RAW và re-render
          if (window.RAW) {
            window.RAW.nhanXet = rows;
            if (typeof window.renderNhanXet === 'function') {
              window.renderNhanXet();
            } else if (typeof window.renderAll === 'function') {
              window.renderAll();
            }
          }

          setSyncStatus('ok', `✓ Đã nạp ${rows.length} mục nhận xét từ "${nxSheet}"`);
          alert(`Đã cập nhật thành công ${rows.length} mục nhận xét chuyên sâu từ sheet "${nxSheet}"!`);
        } catch (err) {
          console.error(err);
          alert('Lỗi đọc file Excel nhận xét: ' + err.message);
          setSyncStatus('warn', 'Lỗi khi đọc file nhận xét');
        }
        inp.value = '';
      });
    }
    inp.click();
  }

  /* =========================================================================
   * HÀM CHÍNH: TẢI TỪ SUPABASE & KHỞI CHẠY BÁO CÁO
   * ========================================================================= */
  async function loadDataFromSupabase(isManualRefresh = false) {
    setupLiveSyncBanner();
    setSyncStatus('loading', 'Đang kết nối Supabase...');

    try {
      // 1. Tải bảng chuẩn hoá
      const [pbRows, tinhRows] = await Promise.all([
        fetchAll(T_PB, '*').catch(() => []),
        fetchAll(T_TINH, '*').catch(() => [])
      ]);
      const deptMap = buildDeptMap(pbRows);
      window._globalProvinceMap = buildProvinceMap(tinhRows);

      // 2. Tải 2 bảng tài chính chính
      setSyncStatus('loading', 'Đang tải BCQT & Kế hoạch từ Supabase...');
      const [bcqtRows, khkdRows] = await Promise.all([
        fetchAll(T_BCQT, '*'),
        fetchAll(T_KHKD, '*')
      ]);

      // Kiểm tra RLS / Bảng trống
      if (!bcqtRows.length && !khkdRows.length) {
        setSyncStatus('warn', '⚠️ Supabase chưa có dữ liệu (Cần tắt RLS)');
        console.warn('Supabase trả về 0 dòng. Nguyên nhân: Row Level Security (RLS) đang bật trên các bảng Supabase mà chưa tắt hoặc chưa tạo Policy.');
        if (isManualRefresh) {
          alert('Kết nối tới Supabase thành công nhưng không lấy được dòng nào!\n\nLý do: Tính năng bảo mật Row Level Security (RLS) đang khóa quyền đọc công khai.\n\nCách xử lý nhanh trong Supabase SQL Editor:\nALTER TABLE detail_bcqt DISABLE ROW LEVEL SECURITY;\nALTER TABLE khkd_bcqt DISABLE ROW LEVEL SECURITY;\nALTER TABLE phong_ban DISABLE ROW LEVEL SECURITY;\nALTER TABLE detail_sanpham DISABLE ROW LEVEL SECURITY;\nALTER TABLE "Tinh_thanh_chuan" DISABLE ROW LEVEL SECURITY;');
        }
        return;
      }

      setSyncStatus('loading', 'Đang tính toán các chỉ số tài chính...');
      const kpi = buildKpi(bcqtRows, khkdRows);
      const kenh = buildKenh(bcqtRows, khkdRows);
      const chiPhi = buildChiPhi(bcqtRows, khkdRows, deptMap);
      const bcqtDetail = buildBcqtDetail(bcqtRows, khkdRows, deptMap);

      // 3. Tải 3 bảng Báo cáo tài chính (CĐKT, KQHĐKD, LCTT)
      let cdkt = (window.DEFAULT_BCTC && window.DEFAULT_BCTC.cdkt) ? window.DEFAULT_BCTC.cdkt : [];
      let kqkd = (window.DEFAULT_BCTC && window.DEFAULT_BCTC.kqkd) ? window.DEFAULT_BCTC.kqkd : [];
      let lctt = (window.DEFAULT_BCTC && window.DEFAULT_BCTC.lctt) ? window.DEFAULT_BCTC.lctt : [];

      try {
        const [cdktRes, kqkdRes, lcttRes] = await Promise.all([
          fetchAll(T_CDKT, '*').catch(e => { console.warn('Bảng detail_cdkt:', e); return []; }),
          fetchAll(T_KQKD, '*').catch(e => { console.warn('Bảng detail_kqkd:', e); return []; }),
          fetchAll(T_LCTT, '*').catch(async () => {
            return fetchAll('detail_lctt', '*').catch(() => []);
          })
        ]);

        function normBctc(rows) {
          if (!rows || !rows.length) return null;
          return rows.map(r => ({
            month: parseInt(r['Tháng'] || r.thang || r.Thang || 0),
            year: parseInt(r['Năm'] || r.nam || r.Nam || 2026),
            code: String(r['Mã số'] || r.ma_so || r.MaSo || '').trim(),
            level: parseInt(r['Cấp'] || r.cap || r.Cap || 1),
            name: String(r['Khoản mục'] || r.khoan_muc || r.KhoanMuc || '').trim(),
            dept: String(r['Phòng ban'] || r.phong_ban || r.PhongBan || 'Tổng Công ty').trim(),
            value: toNum(r['Thực tế'] || r.thuc_te || r.ThucTe || 0)
          })).filter(r => r.name);
        }

        const normCdkt = normBctc(cdktRes);
        const normKqkd = normBctc(kqkdRes);
        const normLctt = normBctc(lcttRes);

        if (normCdkt && normCdkt.length) cdkt = normCdkt;
        if (normKqkd && normKqkd.length) kqkd = normKqkd;
        if (normLctt && normLctt.length) lctt = normLctt;
      } catch (eBctc) {
        console.warn('Lỗi tải BCTC từ Supabase, sử dụng dữ liệu mặc định:', eBctc);
      }

      // 4. Lấy Nhận xét chuyên sâu từ localStorage (đã lưu từ Excel) hoặc RAW cũ
      let nhanXet = [];
      try {
        const storedNX = localStorage.getItem('facolos_nhanxet_data');
        if (storedNX) nhanXet = JSON.parse(storedNX);
      } catch (e) {}
      if (!nhanXet.length && window.RAW && window.RAW.nhanXet && window.RAW.nhanXet.length) {
        nhanXet = window.RAW.nhanXet;
      }
      if (typeof window.normalizeNhanXetRows === 'function' && nhanXet && nhanXet.length) {
        nhanXet = window.normalizeNhanXetRows(nhanXet);
      }

      // 5. Chuẩn bị dữ liệu sản phẩm / tỉnh thành ban đầu từ cache hoặc fallback
      let sanPham = (window.RAW && window.RAW.sanPham) ? window.RAW.sanPham : [];
      let sanPhamCT = (window.RAW && window.RAW.sanPhamCT) ? window.RAW.sanPhamCT : [];
      let tinhThanh = (window.RAW && window.RAW.tinhThanh) ? window.RAW.tinhThanh : [];

      // 6. Đóng gói data khởi chạy ngay lập tức (không để người dùng chờ 186k dòng)
      const finalData = {
        thongTin: buildThongTin(),
        kpi,
        kenh,
        sanPham,
        chiPhi,
        sanPhamCT,
        tinhThanh,
        bcqtDetail,
        nhanXet,
        cdkt,
        kqkd,
        lctt,
        bcqt: bcqtDetail.filter(r => (r['Phòng ban'] || '').includes('Tổng Công ty')),
        keHoachKD: khkdRows.map(r => ({
          'Tháng': `T${r['Tháng'] || r.thang}/${r['Năm'] || r.nam || 2026}`,
          'Mã số': String(r['Mã số'] || r.ma_so || '').trim(),
          'Cấp': r['Cấp'] || r.cap || '',
          'Khoản mục': r['Khoản mục'] || r.khoan_muc || '',
          'Phòng ban': normDept(r['Phòng ban'] || r.phong_ban, deptMap),
          'Kế hoạch (tỷ đồng)': toNum(r['Kế hoạch'] || r.ke_hoach)
        }))
      };

      // Khởi chạy Dashboard & BCTC tức thì
      if (typeof window.startApp === 'function') {
        window.startApp(finalData);
      } else {
        window.RAW = finalData;
        if (typeof window.renderAll === 'function') window.renderAll();
      }

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      setSyncStatus('ok', `✓ Đã kết nối Supabase (${bcqtRows.length} dòng BCQT lúc ${timeStr})`);

      if (isManualRefresh) {
        alert(`Đồng bộ dữ liệu Supabase thành công lúc ${timeStr}!`);
      }

      // 7. Tải ngầm chi tiết sản phẩm & tỉnh thành (186k dòng) không làm chậm giao diện chính
      (async function syncSanPhamBackground() {
        try {
          const spColumns = 'Ngày hạch toán,Tên hàng,Tổng số lượng bán,DTHU NET,Doanh số bán,Tên nhóm khách hàng sửa,Tỉnh thành phố_chuẩn,NHÓM VTHH';
          const spRows = await fetchAll(T_SP, spColumns).catch(() => fetchAll(T_SP, '*'));
          if (spRows && spRows.length) {
            const resSP = buildSanPhamFromDetail(spRows);
            if (resSP.sanPham && resSP.sanPham.length) finalData.sanPham = resSP.sanPham;
            if (resSP.sanPhamCT && resSP.sanPhamCT.length) finalData.sanPhamCT = resSP.sanPhamCT;
            if (resSP.tinhThanh && resSP.tinhThanh.length) finalData.tinhThanh = resSP.tinhThanh;
            if (window.RAW) {
              window.RAW.sanPham = finalData.sanPham;
              window.RAW.sanPhamCT = finalData.sanPhamCT;
              window.RAW.tinhThanh = finalData.tinhThanh;
            }
            if (typeof activeTab !== 'undefined' && activeTab === 'doanhthu' && typeof renderChannelProduct === 'function') {
              renderChannelProduct();
            }
          }
        } catch (eSP) {
          console.warn('Đồng bộ ngầm detail_sanpham:', eSP);
        }
      })();
    } catch (err) {
      console.error('Lỗi khi nạp dữ liệu từ Supabase:', err);
      setSyncStatus('warn', `⚠️ Lỗi kết nối Supabase: ${err.message}`);
    }
  }

  function initLoader() {
    setupLiveSyncBanner();
    setTimeout(() => loadDataFromSupabase(false), 100);
  }

  /* Khởi chạy khi tài liệu tải xong */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoader);
  } else {
    initLoader();
  }

  // Xuất ra global để người dùng có thể gọi thủ công nếu cần
  window.loadDataFromSupabase = loadDataFromSupabase;
  window.openExcelNhanXetPicker = openExcelNhanXetPicker;
})();
