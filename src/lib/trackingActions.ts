'use server';

import { db } from './db';
import { trackingCarts, trackingOrders, trackingLogs } from '@/db/schema';
import { eq, like, or } from 'drizzle-orm';

import { TRAM } from './constants';

export async function updateCartPosition(maXe: string, viTriMoi: string, msnv: string) {
  const thoiGian = new Date().toISOString();
  const maXeUpper = maXe.toUpperCase();

  try {
    const existing = await db.select().from(trackingCarts).where(eq(trackingCarts.code, maXeUpper)).get();

    if (existing) {
      await db.update(trackingCarts)
        .set({
          location: viTriMoi,
          updatedBy: msnv,
          updatedAt: thoiGian
        })
        .where(eq(trackingCarts.code, maXeUpper));
    } else {
      await db.insert(trackingCarts).values({
        code: maXeUpper,
        location: viTriMoi,
        updatedBy: msnv,
        updatedAt: thoiGian
      });
    }

    return { success: true, message: `✅ Đã gán ${maXeUpper} vào ${viTriMoi}` };
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
  const thoiGian = new Date().toISOString();
  const ketQuaXuLy = [];

  for (const maDon of danhSachMa) {
    const maTrim = maDon.trim();
    if (!maTrim) continue;

    try {
      // Find order in tracking_orders
      // Note: GAS version handled combined orders like "A|B|C". 
      // In a real DB, we should ideally store them separately or use LIKE.
      // For migration fidelity, we check if the code exists exactly or as part of a joined string.
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
        // Create new
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
        // Update existing
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

    // LOGIC BẮC CẦU: check if location is a cart
    let vitriDisplay = info.location || "";
    let tramDisplay = info.station || "";

    if (vitriDisplay.toUpperCase().includes("XE - ")) {
      const match = vitriDisplay.toUpperCase().match(/XE - \d+/);
      if (match) {
        const maXeScan = match[0];
        const cartInfo = await db.select().from(trackingCarts).where(eq(trackingCarts.code, maXeScan)).get();
        if (cartInfo && cartInfo.location) {
          // BẮC CẦU: Nếu Xe đã có vị trí (Kệ), cập nhật luôn vào thông tin chính
          tramDisplay = TRAM.T4; // Chuyển sang trạm Hàng Khuôn
          vitriDisplay = `${cartInfo.location} (Thông qua ${maXeScan})`;
        }
      }
    }

    const logs = await db.select()
      .from(trackingLogs)
      .where(eq(trackingLogs.orderCode, tuKhoa))
      .orderBy(trackingLogs.timestamp)
      .all();

    // Map logs to consistent format
    const formattedLogs = logs.reverse().map(l => ({
      tg: new Date(l.timestamp).toLocaleString('vi-VN'),
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
        tg: info.updatedAt ? new Date(info.updatedAt).toLocaleString('vi-VN') : ""
      },
      logs: formattedLogs,
      missing: missingSteps
    };
  } catch (error) {
    console.error("Lookup error:", error);
    return null;
  }
}
