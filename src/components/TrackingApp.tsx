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
  Loader2
} from 'lucide-react';
import { processOrders, updateCartPosition, lookupOrder } from '@/lib/trackingActions';
import { TRAM } from '@/lib/constants';

declare global {
  interface Window {
    Html5Qrcode: any;
  }
}

export default function TrackingApp() {
  const [screen, setScreen] = useState<'setup' | 'work' | 'search'>('setup');
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

  const scannerRef = useRef<any>(null);
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
    if (type === 'ok' && audioOkRef.current) audioOkRef.current.play().catch(() => {});
    if (type === 'ng' && audioNgRef.current) audioNgRef.current.play().catch(() => {});
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

  const startCamera = async () => {
    if (!window.Html5Qrcode) return;
    
    setIsCameraOn(true);
    const html5QrCode = new window.Html5Qrcode("reader");
    scannerRef.current = html5QrCode;

    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: 250 },
        (decodedText: string) => {
          handleScan(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error(err);
      setIsCameraOn(false);
    }
  };

  const formatOrderCode = (raw: string) => {
    let code = raw.trim().toUpperCase().split('^')[0];
    
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
    const cleanText = rawText.split('^')[0];

    // Chống quét trùng mã trong 2 giây (De-bounce)
    if (cleanText === lastScannedCode.current && (now - lastScannedTime.current < 2000)) {
      return;
    }
    
    lastScannedCode.current = cleanText;
    lastScannedTime.current = now;

    if (scanModeRef.current === 'MAP_CART_TO_LOC') {
      const formatted = formatOrderCode(cleanText);
      if (isScanningCartRef.current) {
        if (/^Xe-\d+$/i.test(formatted)) {
          playSound('ok');
          setTempCartID(formatted);
          setIsScanningCart(false);
          lastScannedCode.current = ''; 
        } else {
          playSound('ng');
          alert("Vui lòng quét mã Xe (Định dạng: Xe-***)");
        }
      } else {
        if (formatted !== tempCartIDRef.current) {
          playSound('ok');
          setTempLocID(formatted);
          stopCamera();
        }
      }
    } else if (scanModeRef.current === 'WORK_LOCATION') {
      const formatted = formatOrderCode(cleanText);
      if (locationTypeRef.current === 'CART') {
        if (/^Xe-\d+$/i.test(formatted)) {
          playSound('ok');
          setVitri(formatted);
        } else {
          playSound('ng');
          alert("Ở chế độ Đóng lên xe, vị trí phải có định dạng Xe-***");
        }
      } else {
        playSound('ok');
        setVitri(formatted);
      }
    } else if (scanModeRef.current === 'WORK_ORDER') {
      const rawCodes = rawText.split('|');
      const processedCodes = rawCodes
        .map(c => formatOrderCode(c))
        .filter(c => isValidCode(c) && !scannedCodesRef.current.includes(c));
        
      if (processedCodes.length > 0) {
        playSound('ok');
        setScannedCodes(prev => [...processedCodes, ...prev]);
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
  };

  const addManualOrder = () => {
    if (!manualInput) return;
    const rawCodes = manualInput.split('|');
    const processedCodes = rawCodes
      .map(c => formatOrderCode(c))
      .filter(c => c && !scannedCodes.includes(c));
    
    if (processedCodes.length > 0) {
      setScannedCodes(prev => [...processedCodes, ...prev]);
      setManualInput('');
      playSound('ok');
    }
  };

  const handleBatchUpdate = async () => {
    setLoading(true);
    if (scanMode === 'MAP_CART_TO_LOC') {
      const res = await updateCartPosition(tempCartID, tempLocID, msnv);
      alert(res.message);
      if (res.success) {
        setScanMode('WORK_ORDER');
        setTempCartID('');
        setTempLocID('');
        setIsScanningCart(true);
      }
    } else {
      const res = await processOrders(scannedCodes, station, msnv, vitri, loaiHang, ghiChu);
      alert(`Đã xử lý ${res.length} đơn hàng.`);
      setScannedCodes([]);
      setVitri('');
      setGhiChu('');
      setScanMode('WORK_ORDER');
    }
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    
    // Áp dụng quy tắc thông minh cho ô Tra cứu
    const rawCodes = searchQuery.split('|');
    const codeToSearch = formatOrderCode(rawCodes[0]); // Ưu tiên mã đầu tiên nếu là chuỗi gộp
    
    setSearchQuery(codeToSearch); // Cập nhật lại ô input để người dùng thấy mã đã chuẩn hóa
    const result = await lookupOrder(codeToSearch);
    setSearchResult(result);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <audio ref={audioOkRef} src="https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.m4a" />
      <audio ref={audioNgRef} src="https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.m4a" />

      {/* Header */}
      <header className="bg-blue-700 text-white p-4 shadow-lg sticky top-0 z-50 flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6" />
          TRACKING PRO
        </h1>
        <div className="flex gap-1">
           <button 
             onClick={() => { stopCamera(); setScreen('search'); }}
             className="flex items-center gap-1 px-3 py-1.5 hover:bg-blue-600 rounded-lg transition-colors text-sm font-medium"
           >
             <Search className="w-4 h-4" /> Tra cứu
           </button>
           {screen !== 'setup' ? (
             <button 
               onClick={() => { stopCamera(); setScreen('setup'); }}
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
                <span className="font-bold">NHẬP XE VÀO KỆ (LEANLINE)</span>
              </button>
            )}

            {/* Step Indicator */}
            <div className={`py-2 px-4 rounded-full text-center text-sm font-bold shadow-inner ${
              scanMode === 'WORK_ORDER' ? 'bg-blue-100 text-blue-700' : 
              scanMode === 'MAP_CART_TO_LOC' ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-700'
            }`}>
              {scanMode === 'WORK_ORDER' ? 'BƯỚC 1: QUÉT ĐƠN HÀNG' : 
               scanMode === 'MAP_CART_TO_LOC' ? 'GÁN XE ➔ VỊ TRÍ KỆ' : 'BƯỚC 2: QUÉT VỊ TRÍ 📍'}
            </div>

            {/* QR Scanner UI */}
            <div className="relative overflow-hidden rounded-2xl bg-black aspect-square border-4 border-blue-200">
               {!isCameraOn && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                   <Camera className="w-12 h-12 mb-2 opacity-20" />
                   <p className="text-xs">Camera đang tắt</p>
                 </div>
               )}
               <div id="reader" className="w-full"></div>
            </div>

            <button 
              onClick={() => isCameraOn ? stopCamera() : startCamera()}
              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isCameraOn ? 'bg-red-100 text-red-600' : 'bg-blue-600 text-white'
              }`}
            >
              {isCameraOn ? <><CameraOff className="w-5 h-5" /> TẮT CAMERA</> : <><Camera className="w-5 h-5" /> BẬT CAMERA</>}
            </button>

            {/* Controls: Step 1 (Order List) */}
            {scanMode === 'WORK_ORDER' && (
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

                <div className="grid grid-cols-2 gap-2">
                   <button 
                     disabled={scannedCodes.length === 0}
                     onClick={() => { setScanMode('WORK_LOCATION'); setLocationType('NORMAL'); }}
                     className="bg-blue-600 text-white py-4 rounded-xl font-bold disabled:opacity-50"
                   >
                     ĐƠN ➔ VỊ TRÍ
                   </button>
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
                    <div className={`p-4 rounded-xl text-center font-bold ${tempCartID ? 'bg-slate-100 text-slate-400' : 'bg-amber-400 text-black'}`}>
                      {tempCartID ? `🚚 XE: ${tempCartID}` : '1. QUÉT MÃ XE 🚚'}
                    </div>
                    <div className={`p-4 rounded-xl text-center font-bold ${tempLocID ? 'bg-slate-100 text-slate-400' : !tempCartID ? 'bg-slate-100 text-slate-300' : 'bg-green-500 text-white'}`}>
                      {tempLocID ? `📍 KỆ: ${tempLocID}` : '2. QUÉT MÃ KỆ 📍'}
                    </div>
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
                  <button onClick={() => setScanMode('WORK_ORDER')} className="flex-1 bg-slate-200 py-4 rounded-xl font-bold">QUAY LẠI</button>
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
               <div className="flex gap-2 mb-4">
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
                         <span className="font-bold text-slate-700">{searchResult.info.station}</span>
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
               onClick={() => { setScreen(station ? 'work' : 'setup'); setSearchResult(null); }}
               className="w-full bg-slate-200 py-4 rounded-xl font-bold"
             >
               QUAY LẠI
             </button>
          </div>
        )}
      </main>

      {/* Floating Action Hint */}
      {screen === 'work' && isCameraOn && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur text-white px-6 py-2 rounded-full text-xs font-bold flex items-center gap-2 animate-bounce z-[60]">
          <CheckCircle2 className="w-4 h-4" /> QUÉT MÃ QR ĐỂ TỰ ĐỘNG NHẬN DIỆN
        </div>
      )}
    </div>
  );
}
