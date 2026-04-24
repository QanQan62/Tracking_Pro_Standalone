'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, 
  Search, 
  Settings, 
  Truck, 
  MapPin, 
  Plus, 
  X, 
  History, 
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  FileSpreadsheet,
  Wifi,
  WifiOff
} from 'lucide-react';
import { processOrders, updateCartPosition, lookupOrder, getTrackingReport } from '@/lib/trackingActions';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getOfflineQueue, addToOfflineQueue, removeFromOfflineQueue } from '@/lib/offlineQueue';
import * as XLSX from 'xlsx';
import { TRAM } from '@/lib/constants';

declare global {
  interface Window {
    Html5Qrcode: any;
  }
}

export default function TrackingApp() {
  const [screen, setScreen] = useState<'setup' | 'work' | 'search' | 'report'>('setup');
  const [station, setStation] = useState('');
  const [msnv, setMsnv] = useState('');
  const [scannedCodes, setScannedCodes] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [scanMode, setScanMode] = useState<'WORK_ORDER' | 'WORK_LOCATION' | 'MAP_CART_TO_LOC'>('WORK_ORDER');
  const [locationType, setLocationType] = useState<'NORMAL' | 'CART'>('NORMAL');
  const [vitri, setVitri] = useState('');
  const [loaiHang, setLoaiHang] = useState('Hàng Khuôn');
  const [ghiChu, setGhiChu] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Cart mapping state
  const [tempCartID, setTempCartID] = useState('');
  const [tempLocID, setTempLocID] = useState('');
  const [isScanningCart, setIsScanningCart] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isSearchCameraOn, setIsSearchCameraOn] = useState(false);
  
  // Report state
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');

  const [isIOSInApp, setIsIOSInApp] = useState(false);
  
  // Offline Sync state
  const isOnline = useNetworkStatus();
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    setQueueCount(getOfflineQueue().length);
    if (isOnline && getOfflineQueue().length > 0) {
      processQueue();
    }
  }, [isOnline]);

  const processQueue = async () => {
    if (syncingQueue) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    setSyncingQueue(true);
    let successCount = 0;

    for (const action of queue) {
      try {
        if (action.type === 'PROCESS_ORDERS') {
          const { danhSachMa, tramMoi, msnv: reqMsnv, viTriMoi, loaiHang: reqLoaiHang, ghiChu: reqGhiChu } = action.payload;
          await processOrders(danhSachMa, tramMoi, reqMsnv, viTriMoi, reqLoaiHang, reqGhiChu);
        } else if (action.type === 'UPDATE_CART_POSITION') {
          const { maXe, viTriMoi, msnv: reqMsnv } = action.payload;
          await updateCartPosition(maXe, viTriMoi, reqMsnv);
        }
        removeFromOfflineQueue(action.id);
        successCount++;
      } catch (error) {
        console.error("Lỗi đồng bộ offline item:", action.id, error);
        break; // Stop syncing to try again later if network drops or error occurs
      }
    }

    setSyncingQueue(false);
    setQueueCount(getOfflineQueue().length);
    if (successCount > 0) {
      alert(`Đã đồng bộ thành công ${successCount} lượt dữ liệu từ chế độ ngoại tuyến.`);
    }
  };

  const scannerRef = useRef<any>(null);
  const searchScannerRef = useRef<any>(null);
  const audioOkRef = useRef<HTMLAudioElement | null>(null);
  const audioNgRef = useRef<HTMLAudioElement | null>(null);
  
  // Cooldown & De-dupe refs
  const lastScannedCode = useRef<string>('');
  const lastScannedTime = useRef<number>(0);
  
  // Refs to allow camera handleScan to see latest state without re-rendering scanner
  const scanModeRef = useRef(scanMode);
  scanModeRef.current = scanMode;
  const locationTypeRef = useRef(locationType);
  locationTypeRef.current = locationType;
  const isScanningCartRef = useRef(isScanningCart);
  isScanningCartRef.current = isScanningCart;
  const tempCartIDRef = useRef(tempCartID);
  tempCartIDRef.current = tempCartID;
  const stationRef = useRef(station);
  stationRef.current = station;
  const scannedCodesRef = useRef(scannedCodes);
  scannedCodesRef.current = scannedCodes;

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isZalo = /Zalo/i.test(ua);
    const isFB = /FBAN|FBAV/i.test(ua);
    
    if (isIOS && (isZalo || isFB)) {
      setIsIOSInApp(true);
    }

    const savedTram = localStorage.getItem('track_tram');
    const savedMsnv = localStorage.getItem('track_msnv');
    if (savedTram) setStation(savedTram);
    if (savedMsnv) setMsnv(savedMsnv);
    
    // Load Html5Qrcode script
    if (!window.Html5Qrcode) {
        const script = document.createElement('script');
        script.src = "https://unpkg.com/html5-qrcode";
        script.async = true;
        document.body.appendChild(script);
    }
  }, []);

  const playSound = (type: 'ok' | 'ng') => {
    if (type === 'ok') {
      if (audioOkRef.current) audioOkRef.current.play().catch(() => {});
      if (typeof window !== 'undefined' && window.navigator.vibrate) {
        window.navigator.vibrate(200); // Rung khi quét thành công
      }
    }
    if (type === 'ng') {
      if (audioNgRef.current) audioNgRef.current.play().catch(() => {});
      if (typeof window !== 'undefined' && window.navigator.vibrate) {
        window.navigator.vibrate([100, 50, 100]); // Rung cảnh báo lỗi
      }
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && isCameraOn) {
      try {
        await scannerRef.current.stop();
        setIsCameraOn(false);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const stopSearchCamera = async () => {
    if (searchScannerRef.current && isSearchCameraOn) {
      try {
        await searchScannerRef.current.stop();
        setIsSearchCameraOn(false);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const startCamera = async () => {
    if (!window.Html5Qrcode) return;
    
    setIsCameraOn(true);
    const html5QrCode = new window.Html5Qrcode("reader");
    scannerRef.current = html5QrCode;

    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        { 
          fps: 15, 
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.8);
            return { width: size, height: size };
          },
          aspectRatio: 1.0
        },
        async (decodedText: string) => {
          // Tạm dừng để xử lý và tránh "khựng" hoặc quét trùng quá nhanh
          html5QrCode.pause();
          await handleScan(decodedText);
          // Chờ 1.5s mới cho quét tiếp để người dùng kịp di chuyển cam
          setTimeout(() => {
            if (scannerRef.current) {
              try { scannerRef.current.resume(); } catch(e) {}
            }
          }, 1500);
        },
        () => {}
      );
    } catch (err) {
      console.error(err);
      setIsCameraOn(false);
    }
  };

  const startSearchCamera = async () => {
    if (!window.Html5Qrcode) return;
    
    setIsSearchCameraOn(true);
    const html5QrCode = new window.Html5Qrcode("search-reader");
    searchScannerRef.current = html5QrCode;

    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        { 
          fps: 15, 
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.8);
            return { width: size, height: size };
          },
          aspectRatio: 1.0
        },
        async (decodedText: string) => {
          html5QrCode.pause();
          await handleSearchScan(decodedText);
          setTimeout(() => {
            if (searchScannerRef.current) {
              try { searchScannerRef.current.resume(); } catch(e) {}
            }
          }, 1500);
        },
        () => {}
      );
    } catch (err) {
      console.error(err);
      setIsSearchCameraOn(false);
    }
  };

  const handleSearchScan = async (decodedText: string) => {
    // Tách các đơn gộp và hậu tố bằng "|"
    const parts = decodedText.trim().toUpperCase().split('|');
    const rproCodes = parts
      .map(p => formatOrderCode(p))
      .filter(c => /^RPRO-\d{6}-\d{4}$/.test(c));

    if (rproCodes.length > 0) {
      const firstCode = rproCodes[0];
      playSound('ok');
      await stopSearchCamera();
      setSearchQuery(firstCode);
      setLoading(true);
      const result = await lookupOrder(firstCode);
      setSearchResult(result);
      setLoading(false);
    } else {
      playSound('ng');
    }
  };

  const formatOrderCode = (raw: string) => {
    let code = raw.trim().toUpperCase();
    
    // Tự động chuẩn hóa tiền tố Xe-
    const upperCode = code.toUpperCase();
    if (/^XE\s*-?\s*\d+$/.test(upperCode)) {
      const numMatch = code.match(/\d+/);
      return numMatch ? `Xe-${numMatch[0]}` : code;
    }

    // Luôn bắt đầu bằng RPRO- cho đơn hàng
    if (/^\d{10}$/.test(code)) {
      return `RPRO-${code.slice(0, 6)}-${code.slice(6, 10)}`;
    }
    if (/^\d{6}-\d{4}$/.test(code)) {
      return `RPRO-${code}`;
    }
    if (/^RPRO\d{10}$/.test(code)) {
      return `RPRO-${code.slice(4, 10)}-${code.slice(10, 14)}`;
    }
    if (/^RPRO-\d{10}$/.test(code)) {
      return `RPRO-${code.slice(5, 11)}-${code.slice(11, 15)}`;
    }
    if (/^RPRO\d{6}-\d{4}$/.test(code)) {
      return `RPRO-${code.slice(4)}`;
    }
    
    return code;
  };

  const isValidCode = (code: string) => {
    // Chấp nhận RPRO-xxxxxx-xxxx hoặc Xe-xxxx
    return /^RPRO-\d{6}-\d{4}$/.test(code) || /^Xe-\d+$/i.test(code);
  };

  const handleScan = (decodedText: string) => {
    const now = Date.now();
    const rawText = decodedText.trim().toUpperCase();

    // Chống quét trùng mã trong 2 giây (De-bounce)
    if (rawText === lastScannedCode.current && (now - lastScannedTime.current < 2000)) {
      return;
    }
    
    lastScannedCode.current = rawText;
    lastScannedTime.current = now;

    // Tách bằng | để xử lý đơn gộp và các hậu tố
    const parts = rawText.split('|');

    if (scanModeRef.current === 'MAP_CART_TO_LOC') {
      if (isScanningCartRef.current) {
        // Tìm mã xe hợp lệ trong các phần tách ra
        const formattedCart = parts.map(p => formatOrderCode(p)).find(f => /^Xe-\d+$/i.test(f));
        if (formattedCart) {
          playSound('ok');
          setTempCartID(formattedCart);
          setIsScanningCart(false);
          lastScannedCode.current = ''; 
        } else {
          playSound('ng');
          alert("Vui lòng quét mã Xe (Định dạng: Xe-***)");
        }
      } else {
        // Vị trí kệ/lưu trữ lấy phần tử đầu tiên
        const formattedLoc = formatOrderCode(parts[0]);
        if (formattedLoc !== tempCartIDRef.current) {
          playSound('ok');
          setTempLocID(formattedLoc);
          stopCamera();
        }
      }
    } else if (scanModeRef.current === 'WORK_LOCATION') {
      if (locationTypeRef.current === 'CART') {
        const formattedCart = parts.map(p => formatOrderCode(p)).find(f => /^Xe-\d+$/i.test(f));
        if (formattedCart) {
          playSound('ok');
          setVitri(formattedCart);
        } else {
          playSound('ng');
          alert("Ở chế độ Đóng lên xe, vị trí phải có định dạng Xe-***");
        }
      } else {
        const formattedLoc = formatOrderCode(parts[0]);
        playSound('ok');
        setVitri(formattedLoc);
      }
    } else if (scanModeRef.current === 'WORK_ORDER') {
      const processedCodes = parts
        .map(c => formatOrderCode(c))
        .filter(c => isValidCode(c) && !scannedCodesRef.current.includes(c));
        
      if (processedCodes.length > 0) {
        playSound('ok');
        setScannedCodes(prev => [...processedCodes, ...prev]);
      } else if (parts.some(p => scannedCodesRef.current.includes(formatOrderCode(p)))) {
        // Thông báo nếu đã quét rồi để tránh hiểu lầm camera bị đứng
        console.log("Mã này đã có trong danh sách");
      } else {
        // Có thể play âm thanh lỗi nếu quét không hợp lệ (tuỳ chọn)
      }
    }
  };

  const vaoLamViec = () => {
    if (!/^\d{5}$/.test(msnv)) {
      alert("MSNV phải là 5 số!");
      return;
    }
    localStorage.setItem('track_tram', station);
    localStorage.setItem('track_msnv', msnv);
    setScreen('work');
    
    // Tự động mở chế độ quét xe cho Trạm 4
    if (station.includes("Trạm 4")) {
      setScanMode('MAP_CART_TO_LOC');
      setTempCartID('');
      setTempLocID('');
      setIsScanningCart(true);
      setTimeout(() => startCamera(), 500);
    }
  };

  const addManualOrder = () => {
    if (!manualInput) return;
    const rawCodes = manualInput.split('|');
    const processedCodes = rawCodes
      .map(c => formatOrderCode(c))
      .filter(c => isValidCode(c) && !scannedCodes.includes(c));
    
    if (processedCodes.length > 0) {
      setScannedCodes(prev => [...processedCodes, ...prev]);
      setManualInput('');
      playSound('ok');
    }
  };

  const handleBatchUpdate = async () => {
    setLoading(true);
    if (scanMode === 'MAP_CART_TO_LOC') {
      if (!isOnline) {
        addToOfflineQueue({
          type: 'UPDATE_CART_POSITION',
          payload: { maXe: tempCartID, viTriMoi: tempLocID, msnv }
        });
        setQueueCount(getOfflineQueue().length);
        alert('Đã lưu dữ liệu vào chế độ ngoại tuyến. Sẽ tự động đồng bộ khi có mạng!');
        setScanMode('WORK_ORDER');
        setTempCartID('');
        setTempLocID('');
        setIsScanningCart(true);
      } else {
        const res = await updateCartPosition(tempCartID, tempLocID, msnv);
        alert(res.message);
        if (res.success) {
          setScanMode('WORK_ORDER');
          setTempCartID('');
          setTempLocID('');
          setIsScanningCart(true);
        }
      }
    } else {
      if (!isOnline) {
        addToOfflineQueue({
          type: 'PROCESS_ORDERS',
          payload: { danhSachMa: scannedCodes, tramMoi: station, msnv, viTriMoi: vitri, loaiHang, ghiChu }
        });
        setQueueCount(getOfflineQueue().length);
        alert('Đã lưu dữ liệu vào chế độ ngoại tuyến. Sẽ tự động đồng bộ khi có mạng!');
        setScannedCodes([]);
        setVitri('');
        setGhiChu('');
        setScanMode('WORK_ORDER');
      } else {
        const res = await processOrders(scannedCodes, station, msnv, vitri, loaiHang, ghiChu);
        alert(`Đã xử lý ${res.length} đơn hàng.`);
        setScannedCodes([]);
        setVitri('');
        setGhiChu('');
        setScanMode('WORK_ORDER');
      }
    }
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!isOnline) {
      alert("Tính năng tra cứu cần có kết nối mạng!");
      return;
    }
    if (!searchQuery) return;
    setLoading(true);
    
    // Áp dụng quy tắc thông minh cho ô Tra cứu
    const rawCodes = searchQuery.split('|');
    const parts = rawCodes.map(c => formatOrderCode(c));
    const codeToSearch = parts.find(c => isValidCode(c)) || parts[0]; // Ưu tiên mã hợp lệ đầu tiên
    
    setSearchQuery(codeToSearch); // Cập nhật lại ô input để người dùng thấy mã đã chuẩn hóa
    const result = await lookupOrder(codeToSearch);
    setSearchResult(result);
    setLoading(false);
  };

  const handleFetchReport = async () => {
    if (!isOnline) {
      alert("Tính năng báo cáo cần có kết nối mạng!");
      return;
    }
    setLoading(true);
    const data = await getTrackingReport(reportFromDate, reportToDate);
    setReportData(data);
    setLoading(false);
    setScreen('report');
  };

  const downloadExcel = () => {
    if (reportData.length === 0) return;
    
    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tracking_Pro_Report");
    
    // Generate filename with date
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Tracking_Pro_Report_${dateStr}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <style jsx global>{`
        #reader__status_span, 
        #search-reader__status_span, 
        #reader__header_message, 
        #search-reader__header_message,
        #reader img[alt="Camera menu"],
        #search-reader img[alt="Camera menu"],
        #reader span, 
        #search-reader span {
          display: none !important;
        }
        #reader, #search-reader {
          border: none !important;
        }
        #reader video, #search-reader video {
          object-fit: cover !important;
        }
      `}</style>
      <audio ref={audioOkRef} src="https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.m4a" />
      <audio ref={audioNgRef} src="https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.m4a" />

      {/* iOS In-App Browser Warning */}
      {isIOSInApp && (
        <div className="fixed inset-0 bg-blue-900 z-[200] flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="bg-white/10 p-8 rounded-3xl backdrop-blur-lg border border-white/20 shadow-2xl">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <img src="https://upload.wikimedia.org/wikipedia/commons/5/52/Safari_browser_logo.svg" className="w-12 h-12" alt="Safari" />
            </div>
            <h2 className="text-2xl font-black mb-4">MỞ BẰNG SAFARI</h2>
            <p className="text-blue-100 mb-8 leading-relaxed">
              Trình duyệt của Zalo/Facebook trên iPhone không hỗ trợ Camera. <br/>
              Vui lòng bấm nút <b>(...)</b> hoặc <b>(Chế độ xem trình duyệt)</b> và chọn <b>Mở bằng Safari</b> để tiếp tục.
            </p>
            <button 
              onClick={() => setIsIOSInApp(false)}
              className="bg-white text-blue-700 px-8 py-4 rounded-2xl font-bold shadow-xl active:scale-95 transition-all w-full"
            >
              TÔI ĐÃ HIỂU
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-blue-700 text-white p-4 shadow-lg sticky top-0 z-50 flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6" />
          TRACKING PRO
        </h1>
        <div className="flex gap-1 items-center">
           {!isOnline && (
             <div className="flex items-center gap-1 bg-red-500 px-2 py-1.5 rounded-lg text-xs font-bold mr-1">
               <WifiOff className="w-3 h-3" />
             </div>
           )}
           {queueCount > 0 && (
             <button 
               onClick={processQueue} 
               disabled={!isOnline || syncingQueue}
               title="Đồng bộ dữ liệu"
               className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold mr-1 ${isOnline ? 'bg-amber-500 hover:bg-amber-400' : 'bg-slate-500'} transition-colors`}
             >
               {syncingQueue ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
               {queueCount}
             </button>
           )}
           <button 
             onClick={() => { stopCamera(); stopSearchCamera(); setScreen('search'); }}
             className="flex items-center gap-1 px-3 py-1.5 hover:bg-blue-600 rounded-lg transition-colors text-sm font-medium"
           >
             <Search className="w-4 h-4" /> Tra cứu
           </button>
           <button 
             onClick={handleFetchReport}
             className="flex items-center gap-1 px-3 py-1.5 hover:bg-blue-600 rounded-lg transition-colors text-sm font-medium"
           >
             <FileSpreadsheet className="w-4 h-4" /> Báo cáo
           </button>
           {screen !== 'setup' ? (
             <button 
               onClick={() => { stopCamera(); stopSearchCamera(); setScreen('setup'); }}
               className="flex items-center gap-1 px-3 py-1.5 hover:bg-blue-600 rounded-lg transition-colors text-sm font-medium"
             >
               <Settings className="w-4 h-4" /> Cài đặt
             </button>
           ) : (
             station && msnv && (
               <button 
                 onClick={() => setScreen('work')}
                 className="flex items-center gap-1 px-3 py-1.5 bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors text-sm font-medium"
               >
                 <ArrowRight className="w-4 h-4 rotate-180" /> Quay lại
               </button>
             )
           )}
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        {loading && (
          <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center z-[100] text-white">
            <Loader2 className="w-10 h-10 animate-spin mb-2" />
            <span className="font-semibold">Đang xử lý...</span>
          </div>
        )}

        {/* Screen: Setup */}
        {screen === 'setup' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100">
              <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Thiết lập Ca làm việc</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Chọn Trạm</label>
                  <select 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={station}
                    onChange={(e) => setStation(e.target.value)}
                  >
                    <option value="">-- Chọn trạm --</option>
                    {Object.values(TRAM).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">MSNV (5 số)</label>
                  <input 
                    type="number"
                    placeholder="Nhập 5 chữ số"
                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={msnv}
                    onChange={(e) => setMsnv(e.target.value)}
                  />
                </div>
                <button 
                  onClick={vaoLamViec}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                  BẮT ĐẦU NGAY <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Screen: Work */}
        {screen === 'work' && (
          <div className="space-y-4">
            {/* Info Bar */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex justify-between text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-slate-700">{station}</span>
              </div>
              <div className="text-slate-500">NV: <b>{msnv}</b></div>
            </div>

            {/* Special Mode: Leanline Cart Assignment */}
            {station.includes("Trạm 4") && (
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-3">
                <div className="text-xs font-bold text-slate-400 uppercase text-center tracking-wider">Quản lý vị trí xe đẩy</div>
                <button 
                  onClick={() => {
                    setScanMode('MAP_CART_TO_LOC');
                    setTempCartID('');
                    setTempLocID('');
                    setIsScanningCart(true);
                  }}
                  className="w-full bg-slate-800 text-white p-4 rounded-xl flex flex-col items-center gap-1 shadow-md active:scale-95 transition-all"
                >
                  <Truck className="w-6 h-6" />
                  <span className="font-bold uppercase text-center">NHẬP XE VÀO VỊ TRÍ (LEANLINE)</span>
                </button>
              </div>
            )}

            {/* Step Indicator */}
            {!(station.includes("Trạm 4") && scanMode === 'WORK_ORDER') && (
              <div className={`py-2 px-4 rounded-full text-center text-sm font-bold shadow-inner ${
                scanMode === 'WORK_ORDER' ? 'bg-blue-100 text-blue-700' : 
                scanMode === 'MAP_CART_TO_LOC' ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-700'
              }`}>
                {scanMode === 'WORK_ORDER' ? 'QUÉT ĐƠN HÀNG' : 
                 scanMode === 'MAP_CART_TO_LOC' ? 'GÁN XE ➔ VỊ TRÍ' : 'QUÉT VỊ TRÍ 📍'}
              </div>
            )}
            
            {/* QR Scanner UI - Hidden for Tram 4 in default mode */}
            {!(station.includes("Trạm 4") && scanMode === 'WORK_ORDER') && (
              <div 
                style={{ display: isCameraOn ? 'block' : 'none' }}
                className="relative overflow-hidden rounded-2xl bg-black shadow-inner"
              >
                 <div id="reader" className="w-full"></div>
              </div>
            )}

            {!(station.includes("Trạm 4") && scanMode === 'WORK_ORDER') && (
              <button 
                onClick={() => isCameraOn ? stopCamera() : startCamera()}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  isCameraOn ? 'bg-red-100 text-red-600' : 'bg-blue-600 text-white'
                }`}
              >
                {isCameraOn ? <><CameraOff className="w-5 h-5" /> TẮT CAMERA</> : <><Camera className="w-5 h-5" /> BẬT CAMERA</>}
              </button>
            )}

            {/* Controls: Step 1 (Order List) */}
            {scanMode === 'WORK_ORDER' && !station.includes("Trạm 4") && (
              <div className="space-y-3 animate-in fade-in duration-300">
                <div className="flex gap-2">
                  <input 
                    type="text"
                    className="flex-1 p-3 rounded-xl border border-slate-200"
                    placeholder="Nhập mã đơn..."
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addManualOrder()}
                  />
                  <button onClick={addManualOrder} className="bg-slate-200 p-3 rounded-xl"><Plus /></button>
                </div>

                <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
                  <div className="bg-slate-50 p-2 text-xs font-bold text-slate-500 border-bottom flex justify-between">
                    <span>DANH SÁCH ĐƠN ({scannedCodes.length})</span>
                    <button onClick={() => setScannedCodes([])} className="text-red-500 uppercase">Xóa hết</button>
                  </div>
                  <ul className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                    {scannedCodes.length === 0 && <li className="p-4 text-center text-slate-400 text-sm">Chưa có đơn nào</li>}
                    {scannedCodes.map((code, idx) => (
                      <li key={idx} className="p-3 flex justify-between items-center text-sm font-bold">
                        {code}
                        <button onClick={() => setScannedCodes(prev => prev.filter((_, i) => i !== idx))}><X className="w-4 h-4 text-slate-400" /></button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`grid ${station.includes("Trạm 3") ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
                   {!station.includes("Trạm 3") && (
                     <button 
                       disabled={scannedCodes.length === 0}
                       onClick={() => { setScanMode('WORK_LOCATION'); setLocationType('NORMAL'); }}
                       className="bg-blue-600 text-white py-4 rounded-xl font-bold disabled:opacity-50"
                     >
                       ĐƠN ➔ VỊ TRÍ
                     </button>
                   )}
                   <button 
                     disabled={scannedCodes.length === 0}
                     onClick={() => { setScanMode('WORK_LOCATION'); setLocationType('CART'); }}
                     className="bg-slate-800 text-white py-4 rounded-xl font-bold disabled:opacity-50"
                   >
                     ĐÓNG LÊN XE 🚚
                   </button>
                </div>
              </div>
            )}

            {/* Controls: Step 2 (Location / Mapping) */}
            {(scanMode === 'WORK_LOCATION' || scanMode === 'MAP_CART_TO_LOC') && (
              <div className="space-y-4 animate-in slide-in-from-right duration-300">
                {scanMode === 'MAP_CART_TO_LOC' ? (
                  <div className="bg-white p-4 rounded-2xl shadow-inner border-2 border-slate-800 space-y-3">
                    <div className={`p-4 rounded-xl text-center font-bold flex justify-center items-center ${tempCartID ? 'bg-slate-100 text-slate-400' : 'bg-amber-400 text-black'}`}>
                      {tempCartID ? `🚚 XE: ${tempCartID}` : '1. QUÉT MÃ XE 🚚'}
                    </div>
                    
                    {!isScanningCart ? (
                      <div className="flex gap-2">
                        <div className={`flex-1 p-4 rounded-xl text-center font-bold flex justify-center items-center ${tempLocID ? 'bg-slate-100 text-slate-400' : 'bg-green-500 text-white'}`}>
                          {tempLocID ? `📍 VỊ TRÍ: ${tempLocID}` : '2. QUÉT VỊ TRÍ 📍'}
                        </div>
                        <button 
                          onClick={() => {
                            const val = prompt("Nhập mã vị trí:");
                            if (val) setTempLocID(formatOrderCode(val));
                          }} 
                          className="bg-slate-200 px-4 rounded-xl font-bold hover:bg-slate-300 active:scale-95 transition-all"
                        >
                          TAY
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl text-center font-bold flex justify-center items-center bg-slate-100 text-slate-300">
                        2. QUÉT VỊ TRÍ 📍
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-800 text-center font-bold">
                      {locationType === 'CART' ? 'Hướng camera vào mã QR XE ĐẨY' : 'Hướng camera vào mã QR VỊ TRÍ/KỆ'}
                    </div>
                    <div className="flex gap-2">
                       <input 
                         className="flex-1 p-4 rounded-xl border border-blue-500 font-bold text-center text-xl bg-white shadow-lg"
                         placeholder="Vị trí..."
                         value={vitri}
                         readOnly
                       />
                       <button onClick={() => setVitri(prompt("Nhập vị trí:") || "")} className="bg-slate-200 px-4 rounded-xl font-bold">TAY</button>
                    </div>
                    <input 
                      className="w-full p-3 rounded-xl border border-slate-200"
                      placeholder="Ghi chú (nếu có)..."
                      value={ghiChu}
                      onChange={(e) => setGhiChu(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => {
                    stopCamera();
                    setScanMode('WORK_ORDER');
                    setTempCartID('');
                    setTempLocID('');
                  }} className="flex-1 bg-slate-200 py-4 rounded-xl font-bold">QUAY LẠI</button>
                  <button 
                    disabled={scanMode === 'MAP_CART_TO_LOC' ? (!tempCartID || !tempLocID) : !vitri}
                    onClick={handleBatchUpdate}
                    className="flex-[2] bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50"
                  >
                    🚀 GỬI DỮ LIỆU
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Screen: Search */}
        {screen === 'search' && (
          <div className="space-y-6 animate-in slide-in-from-top duration-300">
             <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100">
               <h2 className="text-center font-bold text-lg text-slate-400 mb-4 uppercase tracking-widest">Tra cứu đơn hàng</h2>
               <div className="flex gap-2 mb-3">
                 <input 
                   type="text"
                   className="flex-1 p-4 rounded-xl border border-blue-500 font-bold"
                   placeholder="Nhập mã đơn..."
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                 />
                 <button onClick={handleSearch} className="bg-blue-600 text-white px-6 rounded-xl"><Search /></button>
               </div>

               {/* Camera scanner for search */}
               <button
                 onClick={() => isSearchCameraOn ? stopSearchCamera() : startSearchCamera()}
                 className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 mb-3 transition-all ${
                   isSearchCameraOn ? 'bg-red-100 text-red-600' : 'bg-slate-700 text-white'
                 }`}
               >
                 {isSearchCameraOn ? <><CameraOff className="w-5 h-5" /> TẮT CAMERA</> : <><Camera className="w-5 h-5" /> QUÉT MÃ ĐƠN</>}
               </button>
               {/* Luôn render div#search-reader trong DOM để Html5Qrcode hoạt động */}
               <div style={{display: isSearchCameraOn ? 'block' : 'none'}} className="relative overflow-hidden rounded-2xl bg-black shadow-inner mb-3">
                 <div id="search-reader" className="w-full" />
                 <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white text-xs px-4 py-1 rounded-full font-bold">
                   Hướng camera vào mã QR đơn hàng
                 </div>
               </div>

               {searchResult ? (
                 <div className="space-y-4">
                   <div className="p-4 rounded-2xl border-2 border-blue-500 bg-blue-50 relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-2">
                       <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold uppercase">HIỆN TẠI</span>
                     </div>
                     <h3 className="text-2xl font-black text-blue-900 mb-1">{searchResult.info.orderCode}</h3>
                     <div className="flex flex-col gap-1">
                       <div className="flex items-center gap-2">
                         <MapPin className="w-4 h-4 text-blue-600" />
                         <span className="font-bold text-slate-700">{searchResult.info.tram || searchResult.info.station}</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <History className="w-4 h-4 text-blue-600" />
                         <span className="text-sm font-medium text-slate-500">{searchResult.info.tg}</span>
                       </div>
                       <div className="mt-2 bg-white rounded-lg p-3 border border-blue-200">
                         <span className="text-xs font-bold text-slate-400 block mb-1">VỊ TRÍ</span>
                         <span className="text-lg font-bold text-red-600 uppercase italic">📍 {searchResult.info.vitri}</span>
                       </div>
                     </div>
                   </div>

                   {searchResult.missing.length > 0 && (
                     <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                       <span className="text-xs font-bold text-amber-600 block mb-1">CÁC TRẠM CÒN THIẾU:</span>
                       <div className="flex flex-wrap gap-1">
                         {searchResult.missing.map((s: string) => (
                           <span key={s} className="bg-amber-200 text-amber-800 text-[10px] px-2 py-1 rounded-md font-bold">{s}</span>
                         ))}
                       </div>
                     </div>
                   )}

                   <div className="space-y-2">
                     <span className="text-xs font-bold text-slate-400 uppercase">Lịch sử di chuyển</span>
                     {searchResult.logs.map((log: any, i: number) => (
                       <div key={i} className="flex gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                         <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
                            {i < searchResult.logs.length - 1 && <div className="w-0.5 h-full bg-slate-200" />}
                         </div>
                         <div className="flex-1">
                           <div className="flex justify-between items-start">
                             <span className="text-sm font-bold text-slate-700">{log.den}</span>
                             <span className="text-[10px] text-slate-400">{log.tg}</span>
                           </div>
                           <p className="text-xs text-slate-500 leading-tight">{log.vitri}</p>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               ) : searchQuery && !loading ? (
                 <div className="text-center py-10 text-slate-400 italic">Không tìm thấy dữ liệu</div>
               ) : null}
             </div>
             
             <button 
               onClick={() => { stopSearchCamera(); setScreen(station ? 'work' : 'setup'); setSearchResult(null); }}
               className="w-full bg-slate-200 py-4 rounded-xl font-bold"
             >
               QUAY LẠI
             </button>
          </div>
        )}

        {/* Screen: Report */}
        {screen === 'report' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
            <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                    <FileSpreadsheet className="text-green-600" /> BÁO CÁO VỊ TRÍ ĐƠN
                  </h2>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex flex-1 items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <input 
                      type="date" 
                      className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-slate-700 w-full"
                      value={reportFromDate}
                      onChange={e => setReportFromDate(e.target.value)}
                    />
                    <span className="text-slate-400 font-bold">-</span>
                    <input 
                      type="date" 
                      className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-slate-700 w-full"
                      value={reportToDate}
                      onChange={e => setReportToDate(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 sm:w-auto">
                    <button 
                      onClick={handleFetchReport}
                      className="flex-1 sm:flex-none bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      Lọc
                    </button>
                    <button 
                      onClick={downloadExcel}
                      className="flex-1 sm:flex-none bg-green-600 text-white px-4 py-3 rounded-xl flex justify-center items-center gap-2 font-bold hover:bg-green-700 transition-colors shadow-sm"
                    >
                      <Download className="w-4 h-4" /> EXCEL
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-left text-sm border-collapse min-w-[1200px]">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-3 font-bold text-slate-600">STT</th>
                      <th className="p-3 font-bold text-slate-600">Mã Đơn</th>
                      <th className="p-3 font-bold text-blue-600">Trạm Hiện Tại</th>
                      <th className="p-3 font-bold text-blue-600">Trạng Thái Hiện Tại</th>
                      <th className="p-3 font-bold text-slate-600">Trạm 1 (Dán)</th>
                      <th className="p-3 font-bold text-slate-600">Trạm 2 (Cắt)</th>
                      <th className="p-3 font-bold text-slate-600">Trạm 3 (Thành hình)</th>
                      <th className="p-3 font-bold text-slate-600">Trạm 4 (Hàng khuôn)</th>
                      <th className="p-3 font-bold text-slate-600">Trạm 5 (Die-cut)</th>
                      <th className="p-3 font-bold text-slate-600">Trạm 6 (Kho)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reportData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-10 text-center text-slate-400 italic">Chưa có dữ liệu</td>
                      </tr>
                    ) : (
                      reportData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-slate-500">{row.STT}</td>
                          <td className="p-3 font-bold text-slate-800">{row["Mã Đơn"]}</td>
                          <td className="p-3 font-bold text-blue-700 bg-blue-50/50">{row["Trạm Hiện Tại"]}</td>
                          <td className="p-3 text-[11px] font-bold text-red-600 bg-blue-50/50 italic">{row["Trạng Thái Hiện Tại"]}</td>
                          <td className="p-3 text-[11px] leading-tight text-slate-600">{row["Trạm 1: Khu vực Dán"]}</td>
                          <td className="p-3 text-[11px] leading-tight text-slate-600">{row["Trạm 2: Khu vực Cắt"]}</td>
                          <td className="p-3 text-[11px] leading-tight text-slate-600">{row["Trạm 3: Khu vực Thành hình"]}</td>
                          <td className="p-3 text-[11px] leading-tight text-slate-600">{row["Trạm 4: Khu vực Hàng khuôn"]}</td>
                          <td className="p-3 text-[11px] leading-tight text-slate-600">{row["Trạm 5: Khu vực Hàng Die-cut"]}</td>
                          <td className="p-3 text-[11px] leading-tight text-slate-600">{row["Trạm 6: Kho tạm"]}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <button 
              onClick={() => setScreen(station ? 'work' : 'setup')}
              className="w-full bg-slate-200 py-4 rounded-xl font-bold hover:bg-slate-300 transition-colors mb-10"
            >
              QUAY LẠI
            </button>
          </div>
        )}
      </main>

    </div>
  );
}
