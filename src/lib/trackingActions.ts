'use server';

import { db } from './db';
import { trackingCarts, trackingOrders, trackingLogs } from '@/db/schema';
import { eq, or } from 'drizzle-orm';

import { TRAM } from './constants';

/**
 * Trả về thời gian hiện tại theo múi giờ Việt Nam (GMT+7)
 * Định dạng: "2026-04-20T09:54:49+07:00"
 */
function getVNTime(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).replace(' ', 'T') + ':00+07:00';
}

export async function updateCartPosition(maXe: string, viTriMoi: string, msnv: string) {
  const thoiGian = getVNTime();
  let maXeNormalized = maXe.trim();
  
  // Chuẩn hóa mã xe: "Xe - 123" -> "Xe-123"
  const xeMatch = maXeNormalized.match(/^Xe\s*-?\s*(\d+)$/i);
  if (xeMatch) {
    maXeNormalized = `Xe-${xeMatch[1]}`;
  }
  
  try {
    // Tìm kiếm linh hoạt: chấp nhận Xe-***, XE-*** hoặc Xe - *** (nếu đã lỡ lưu)
    const existing = await db.select().from(trackingCarts)
      .where(or(
        eq(trackingCarts.code, maXeNormalized),
        eq(trackingCarts.code, maXeNormalized.toUpperCase()),
        eq(trackingCarts.code, maXeNormalized.replace("Xe-", "Xe - "))
      ))
      .get();

    if (existing) {
      await db.update(trackingCarts)
        .set({
          location: viTriMoi,
          updatedBy: msnv,
          updatedAt: thoiGian
        })
        .where(eq(trackingCarts.code, existing.code));
    } else {
      await db.insert(trackingCarts).values({
        code: maXeNormalized,
        location: viTriMoi,
        updatedBy: msnv,
        updatedAt: thoiGian
      });
    }

    return { success: true, message: `✅ Đã gán ${maXeNormalized} vào ${viTriMoi}` };
  } catch (error) {
    return { success: false, message: `❌ Lỗi: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function processOrders(
  danhSachMa: string[],
  tramMoi: string,
  msnv: string,
  viTriMoi: string,
  loaiHangInput?: string,
  ghiChu?: string
) {
  const thoiGian = getVNTime();
  const ketQuaXuLy = [];

  // Lưu ý: KHÔNG cập nhật tracking_carts tại đây.
  // Vị trí xe chỉ được cập nhật qua chức năng MAP_CART_TO_LOC (gán xe vào kệ cụ thể).

  for (const maDon of danhSachMa) {
    const maTrim = maDon.trim();
    if (!maTrim) continue;

    try {
      const existing = await db.select().from(trackingOrders).where(eq(trackingOrders.orderCode, maTrim)).get();

      let finalLoaiHang = existing?.category || "";
      if (tramMoi === TRAM.T1 && loaiHangInput) finalLoaiHang = loaiHangInput;

      if (!finalLoaiHang) {
        if (tramMoi === TRAM.T1 || tramMoi === TRAM.T6) finalLoaiHang = loaiHangInput || "Chưa phân loại";
        else if ([TRAM.T2, TRAM.T3, TRAM.T4].includes(tramMoi as any)) finalLoaiHang = "Hàng Khuôn";
        else if (tramMoi === TRAM.T5) finalLoaiHang = "Hàng Die-cut";
        else finalLoaiHang = "Chưa phân loại";
      }

      let locationText = viTriMoi;
      if (ghiChu) locationText += ` (Ghi chú: ${ghiChu})`;

      if (!existing) {
        await db.insert(trackingOrders).values({
          orderCode: maTrim,
          category: finalLoaiHang,
          msnv: msnv,
          station: tramMoi,
          location: locationText,
          updatedAt: thoiGian
        });

        await db.insert(trackingLogs).values({
          timestamp: thoiGian,
          orderCode: maTrim,
          action: "Khởi tạo",
          fromStation: "N/A",
          toStation: tramMoi,
          note: `${locationText} (bởi ${msnv})`
        });

        ketQuaXuLy.push({ ma: maTrim, status: "ok", msg: `Đã nhận (${finalLoaiHang})` });
      } else {
        const tramCu = existing.station;
        const viTriCu = existing.location || "";
        const viTriFinal = (tramMoi === tramCu && !viTriCu.includes(viTriMoi)) ? `${viTriCu}, ${locationText}` : locationText;
        const msgAction = (tramMoi === tramCu) ? "Cập nhật" : "Di chuyển";

        await db.update(trackingOrders)
          .set({
            category: finalLoaiHang,
            msnv: msnv,
            station: tramMoi,
            location: viTriFinal,
            updatedAt: thoiGian
          })
          .where(eq(trackingOrders.orderCode, maTrim));

        await db.insert(trackingLogs).values({
          timestamp: thoiGian,
          orderCode: maTrim,
          action: msgAction,
          fromStation: tramCu || "N/A",
          toStation: tramMoi,
          note: `${viTriFinal} (bởi ${msnv})`
        });

        ketQuaXuLy.push({ ma: maTrim, status: "ok", msg: (tramMoi === tramCu) ? "➕ Cập nhật" : `➡ ${tramMoi}` });
      }
    } catch (error) {
      ketQuaXuLy.push({ ma: maTrim, status: "error", msg: String(error) });
    }
  }

  return ketQuaXuLy;
}

export async function lookupOrder(maDonInput: string) {
  if (!maDonInput) return null;

  const tuKhoa = maDonInput.trim().toUpperCase();
  
  try {
    const info = await db.select().from(trackingOrders).where(eq(trackingOrders.orderCode, tuKhoa)).get();
    if (!info) return null;

    // LOGIC BẮC CẦU: kiểm tra nếu vị trí đơn đang là một chiếc xe
    let vitriDisplay = info.location || "";
    let tramDisplay = info.station || "";

    const xeMatch = vitriDisplay.match(/Xe\s*-?\s*(\d+)/i);
    if (xeMatch) {
      const maXeScan = `Xe-${xeMatch[1]}`;
      const cartInfo = await db.select().from(trackingCarts)
        .where(or(
          eq(trackingCarts.code, maXeScan),
          eq(trackingCarts.code, maXeScan.toUpperCase()),
          eq(trackingCarts.code, maXeScan.replace("Xe-", "Xe - "))
        ))
        .get();

      if (cartInfo && cartInfo.location) {
        const isStation = Object.values(TRAM).includes(cartInfo.location as any);
        if (!isStation) {
          // Xe đã được gán vào vị trí kệ cụ thể (A-03, B-01...) → bridge sang T4
          tramDisplay = TRAM.T4;
          vitriDisplay = `${cartInfo.location} (Đang ở trên ${maXeScan})`;
        }
        // Nếu cart.location là tên Trạm → xe chưa được đặt vào kệ → giữ nguyên thông tin gốc của đơn
      }
    }

    const logs = await db.select()
      .from(trackingLogs)
      .where(eq(trackingLogs.orderCode, tuKhoa))
      .orderBy(trackingLogs.timestamp)
      .all();

    // Hiển thị thời gian theo múi giờ Việt Nam (GMT+7)
    const formattedLogs = logs.reverse().map(l => ({
      tg: new Date(l.timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      hanhdong: l.action,
      tu: l.fromStation,
      den: l.toStation,
      vitri: l.note
    }));

    // Missing steps logic
    const flowChuan = (info.category === "Hàng Die-cut") 
      ? [TRAM.T1, TRAM.T5, TRAM.T6] 
      : [TRAM.T1, TRAM.T2, TRAM.T3, TRAM.T4, TRAM.T6];
    
    const cacTramDaQua = logs.flatMap(l => [l.fromStation, l.toStation]);
    const currentIdx = flowChuan.indexOf(tramDisplay as any);
    const missingSteps = [];
    if (currentIdx > 0) {
      for (let k = 0; k < currentIdx; k++) {
        if (!cacTramDaQua.includes(flowChuan[k])) {
          missingSteps.push(flowChuan[k]);
        }
      }
    }

    return {
      info: {
        ...info,
        tram: tramDisplay,
        vitri: vitriDisplay,
        tg: info.updatedAt ? new Date(info.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ""
      },
      logs: formattedLogs,
      missing: missingSteps
    };
  } catch (error) {
    console.error("Lookup error:", error);
    return null;
  }
}

export async function getTrackingReport(startDate?: string, endDate?: string) {
  try {
    let orders = await db.select().from(trackingOrders).all();
    
    if (startDate || endDate) {
      orders = orders.filter(o => {
        if (!o.updatedAt) return false;
        // Parse the timestamp string (e.g. 2026-04-20T09:54:49+07:00) into a comparable value
        const orderTime = new Date(o.updatedAt).getTime();
        
        let valid = true;
        if (startDate) {
          const start = new Date(`${startDate}T00:00:00+07:00`).getTime();
          if (orderTime < start) valid = false;
        }
        if (endDate) {
          const end = new Date(`${endDate}T23:59:59+07:00`).getTime();
          if (orderTime > end) valid = false;
        }
        return valid;
      });
    }

    const logs = await db.select().from(trackingLogs).orderBy(trackingLogs.timestamp).all();
    const carts = await db.select().from(trackingCarts).all();

    // Map carts for quick lookup
    const cartMap = new Map();
    carts.forEach(c => cartMap.set(c.code, c));

    // Group logs by orderCode
    const logsByOrder: Record<string, any[]> = {};
    logs.forEach(log => {
      if (!logsByOrder[log.orderCode]) {
        logsByOrder[log.orderCode] = [];
      }
      logsByOrder[log.orderCode].push(log);
    });

    const reportData = orders.map((order, index) => {
      const orderLogs = logsByOrder[order.orderCode] || [];
      
      const getStationData = (stationKey: keyof typeof TRAM) => {
        const stationName = TRAM[stationKey];
        
        // Find the latest log for this station
        const stationLog = [...orderLogs].reverse().find(l => l.toStation === stationName);
        
        if (!stationLog) {
          // Special logic for T4: if no T4 log, check if it's in a cart from T3
          if (stationKey === 'T4') {
            const t3Log = [...orderLogs].reverse().find(l => l.toStation === TRAM.T3);
            if (t3Log) {
              const xeMatch = t3Log.note?.match(/Xe\s*-?\s*(\d+)/i);
              if (xeMatch) {
                const maXe = `Xe-${xeMatch[1]}`;
                const cartInfo = cartMap.get(maXe);
                if (cartInfo && cartInfo.location && !Object.values(TRAM).includes(cartInfo.location as any)) {
                  // If cart is at a shelf (not a station), this is its T4 location
                  const time = cartInfo.updatedAt ? new Date(cartInfo.updatedAt).toLocaleString('vi-VN', { 
                    timeZone: 'Asia/Ho_Chi_Minh',
                    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
                  }) : "N/A";
                  return `${cartInfo.location} (Xe: ${maXe}) - ${time}`;
                }
              }
            }
          }
          return "";
        }
        
        const time = new Date(stationLog.timestamp).toLocaleString('vi-VN', { 
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        
        return `${stationLog.note} - ${time}`;
      };

      const t1Data = getStationData('T1');
      const t2Data = getStationData('T2');
      const t3Data = getStationData('T3');
      const t4Data = getStationData('T4');
      const t5Data = getStationData('T5');
      const t6Data = getStationData('T6');

      // Determine latest station info
      let latestStation = "";
      let latestStatus = "";
      if (t6Data) { latestStation = "Trạm 6"; latestStatus = t6Data; }
      else if (t5Data) { latestStation = "Trạm 5"; latestStatus = t5Data; }
      else if (t4Data) { latestStation = "Trạm 4"; latestStatus = t4Data; }
      else if (t3Data) { latestStation = "Trạm 3"; latestStatus = t3Data; }
      else if (t2Data) { latestStation = "Trạm 2"; latestStatus = t2Data; }
      else if (t1Data) { latestStation = "Trạm 1"; latestStatus = t1Data; }

      return {
        "STT": index + 1,
        "Mã Đơn": order.orderCode,
        "Trạm Hiện Tại": latestStation,
        "Trạng Thái Hiện Tại": latestStatus,
        "Trạm 1: Khu vực Dán": t1Data,
        "Trạm 2: Khu vực Cắt": t2Data,
        "Trạm 3: Khu vực Thành hình": t3Data,
        "Trạm 4: Khu vực Hàng khuôn": t4Data,
        "Trạm 5: Khu vực Hàng Die-cut": t5Data,
        "Trạm 6: Kho tạm": t6Data,
      };
    });

    return reportData;
  } catch (error) {
    console.error("Report error:", error);
    return [];
  }
}
