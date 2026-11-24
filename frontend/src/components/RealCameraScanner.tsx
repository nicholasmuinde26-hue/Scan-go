import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, RefreshCw, Volume2, VolumeX, CheckCircle2, AlertCircle, Upload, Video, Zap, ZapOff, Sparkles } from 'lucide-react';

interface RealCameraScannerProps {
  onScanSuccess: (barcode: string) => void;
  isScanningActive?: boolean;
}

export const RealCameraScanner: React.FC<RealCameraScannerProps> = ({
  onScanSuccess,
  isScanningActive = true,
}) => {
  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scanCooldown, setScanCooldown] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hardwareDetectorActive, setHardwareDetectorActive] = useState(false);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimestamp = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stopNativeDetectorRef = useRef<(() => void) | null>(null);
  const scannerContainerId = 'scango-html5-camera-viewfinder';

  // Supermarket POS checkout beep sound synthesizer using Web Audio API
  const playCheckoutBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const audioCtx = new AudioCtxClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, audioCtx.currentTime); // 1400 Hz crisp POS chime
      osc.frequency.exponentialRampToValueAtTime(1900, audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch {
      // AudioContext may be restricted before user gesture
    }
  }, [soundEnabled]);

  // Handle successful scan with debouncing
  const handleDecodedBarcode = useCallback((decodedText: string) => {
    const cleaned = decodedText.trim();
    if (!cleaned) return;

    const now = Date.now();
    // Debounce duplicate scans within 1.8 seconds
    if (now - lastScanTimestamp.current < 1800 && lastScannedCode === cleaned) {
      return;
    }

    lastScanTimestamp.current = now;
    setLastScannedCode(cleaned);
    setScanCooldown(true);
    playCheckoutBeep();
    onScanSuccess(cleaned);

    setTimeout(() => setScanCooldown(false), 1800);
  }, [lastScannedCode, onScanSuccess, playCheckoutBeep]);

  // Discover and enumerate available cameras on this computer/device
  const discoverCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setAvailableCameras(devices);
        if (!selectedCameraId) {
          const backCam = devices.find(d =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('environment') ||
            d.label.toLowerCase().includes('rear')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
        return devices;
      }
      return [];
    } catch (err: any) {
      console.warn('Enumerate cameras notice:', err);
      return [];
    }
  };

  useEffect(() => {
    discoverCameras();
  }, []);

  // Native BarcodeDetector hardware-accelerated processing loop (Runs on modern Chromium/Edge)
  const startNativeBarcodeDetectorLoop = useCallback(() => {
    if (!('BarcodeDetector' in window)) {
      setHardwareDetectorActive(false);
      return () => {};
    }

    try {
      const formats = [
        'ean_13',
        'ean_8',
        'upc_a',
        'upc_e',
        'code_128',
        'code_39',
        'code_93',
        'itf',
        'codabar',
        'qr_code',
        'data_matrix',
      ];
      const detector = new (window as any).BarcodeDetector({ formats });
      setHardwareDetectorActive(true);
      let active = true;

      const detectFrame = async () => {
        if (!active) return;
        const video = document.querySelector<HTMLVideoElement>(`#${scannerContainerId} video`);
        if (video && video.readyState >= 2 && !video.paused) {
          try {
            const detected = await detector.detect(video);
            if (detected && detected.length > 0 && detected[0].rawValue) {
              handleDecodedBarcode(detected[0].rawValue);
            }
          } catch {
            // Frame busy or decoding pass skipped
          }
        }
        if (active) {
          requestAnimationFrame(detectFrame);
        }
      };

      requestAnimationFrame(detectFrame);
      return () => {
        active = false;
        setHardwareDetectorActive(false);
      };
    } catch (e) {
      console.warn('Native BarcodeDetector loop init notice:', e);
      setHardwareDetectorActive(false);
      return () => {};
    }
  }, [handleDecodedBarcode]);

  // Start Camera Stream
  const startCamera = async (targetCameraId?: string) => {
    setIsInitializing(true);
    setCameraError(null);
    setPermissionDenied(false);

    try {
      if (stopNativeDetectorRef.current) {
        stopNativeDetectorRef.current();
        stopNativeDetectorRef.current = null;
      }

      // Clean up previous instance
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (e) {
          console.warn('Stop previous instance notice:', e);
        }
      }

      let deviceIdToUse = targetCameraId || selectedCameraId;
      if (!deviceIdToUse) {
        const found = await discoverCameras();
        if (found && found.length > 0) {
          const backCam = found.find(d =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('environment') ||
            d.label.toLowerCase().includes('rear')
          );
          deviceIdToUse = backCam ? backCam.id : found[0].id;
          setSelectedCameraId(deviceIdToUse);
        }
      }

      // Initialize Html5Qrcode with all barcode formats & hardware detector enabled
      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });

      html5QrCodeRef.current = html5QrCode;

      // Scanning Configuration: high frame rate, wide scan box covering 90% of viewfinder
      const config = {
        fps: 24, // Higher fps for swift barcode catch
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
          width: Math.floor(Math.min(viewfinderWidth * 0.92, 480)),
          height: Math.floor(Math.min(viewfinderHeight * 0.82, 320)),
        }),
        aspectRatio: 1.777778,
        videoConstraints: {
          width: { min: 640, ideal: 1920 },
          height: { min: 480, ideal: 1080 },
          facingMode: { ideal: 'environment' },
          focusMode: { ideal: 'continuous' } as any,
          advanced: [{ focusMode: 'continuous' }] as any,
        },
      };

      const successCallback = (decodedText: string) => {
        handleDecodedBarcode(decodedText);
      };

      // Strategy 1: Direct deviceId
      if (deviceIdToUse) {
        try {
          await html5QrCode.start(
            deviceIdToUse,
            config,
            successCallback,
            () => {}
          );
          setIsCameraRunning(true);
          setIsInitializing(false);

          // Check torch capability
          try {
            const capabilities = html5QrCode.getRunningTrackCameraCapabilities();
            setHasTorch(Boolean(capabilities?.torchFeature()?.isSupported()));
          } catch {
            setHasTorch(false);
          }

          // Attach native hardware detector
          stopNativeDetectorRef.current = startNativeBarcodeDetectorLoop();
          return;
        } catch (deviceStartErr) {
          console.warn('Direct deviceId start failed, trying generic constraints:', deviceStartErr);
        }
      }

      // Strategy 2: Environment camera (Back camera / phones)
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          successCallback,
          () => {}
        );
        setIsCameraRunning(true);
        setIsInitializing(false);
        stopNativeDetectorRef.current = startNativeBarcodeDetectorLoop();
        return;
      } catch (envErr) {
        console.warn('Environment facing start failed, trying user camera:', envErr);
      }

      // Strategy 3: User camera (Laptop / desktop webcams)
      await html5QrCode.start(
        { facingMode: 'user' },
        config,
        successCallback,
        () => {}
      );
      setIsCameraRunning(true);
      stopNativeDetectorRef.current = startNativeBarcodeDetectorLoop();
    } catch (err: any) {
      console.warn('Final camera access result:', err);
      setIsCameraRunning(false);

      const errString = (err?.message || err?.name || String(err)).toLowerCase();
      const isDenied =
        err?.name === 'NotAllowedError' ||
        errString.includes('permission') ||
        errString.includes('dismissed') ||
        errString.includes('denied');

      const isNotFound =
        err?.name === 'NotFoundError' ||
        errString.includes('not found') ||
        errString.includes('no camera') ||
        errString.includes('devices not found');

      setPermissionDenied(isDenied);

      if (isDenied) {
        setCameraError('Camera permission was blocked. Click the lock/camera icon in your browser address bar to allow camera access.');
      } else if (isNotFound || availableCameras.length === 0) {
        setCameraError('No camera detected. You can type/paste barcodes manually on the left or use "Scan from Image".');
      } else {
        setCameraError(err?.message || 'Unable to open camera stream. The webcam may be in use by another program (Teams, Zoom).');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  // Stop Camera Stream
  const stopCamera = async () => {
    if (stopNativeDetectorRef.current) {
      stopNativeDetectorRef.current();
      stopNativeDetectorRef.current = null;
    }
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCameraRunning(false);
      setTorchOn(false);
    }
  };

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !hasTorch) return;
    try {
      const caps = html5QrCodeRef.current.getRunningTrackCameraCapabilities();
      const torchFeature = caps?.torchFeature();
      if (torchFeature?.isSupported()) {
        const nextState = !torchOn;
        await torchFeature.apply(nextState);
        setTorchOn(nextState);
      }
    } catch (err) {
      console.warn('Torch toggle notice:', err);
    }
  };

  // Switch camera when user selects a different camera from dropdown
  const handleCameraChange = async (newCameraId: string) => {
    setSelectedCameraId(newCameraId);
    if (isCameraRunning) {
      await stopCamera();
      await startCamera(newCameraId);
    }
  };

  // File Upload Barcode Scanner
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('hidden-file-scanner', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      const decoded = await html5QrCode.scanFile(file, true);
      handleDecodedBarcode(decoded);
    } catch {
      alert('Could not detect a clear barcode in this photo. Please hold the barcode closer with good lighting or enter the numbers manually.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="space-y-3">
      {/* Hidden container for file-based barcode decoding */}
      <div id="hidden-file-scanner" className="hidden" />

      {/* Viewfinder Video Container */}
      <div className="relative w-full h-72 sm:h-80 bg-navy-950 rounded-2xl border border-navy-700 flex items-center justify-center overflow-hidden shadow-inner">
        {/* HTML5 QR Camera Element */}
        <div id={scannerContainerId} className="w-full h-full object-cover" />

        {/* Laser Scanner animation line when running */}
        {isCameraRunning && (
          <div className="w-[85%] h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_rgba(239,68,68,0.9)] animate-pulse absolute pointer-events-none z-10" />
        )}

        {/* Four Corner Brackets Overlay */}
        <div className="absolute top-4 left-4 w-9 h-9 border-t-4 border-l-4 border-brand-400 rounded-tl-xl pointer-events-none z-10 shadow-sm" />
        <div className="absolute top-4 right-4 w-9 h-9 border-t-4 border-r-4 border-brand-400 rounded-tr-xl pointer-events-none z-10 shadow-sm" />
        <div className="absolute bottom-4 left-4 w-9 h-9 border-b-4 border-l-4 border-brand-400 rounded-bl-xl pointer-events-none z-10 shadow-sm" />
        <div className="absolute bottom-4 right-4 w-9 h-9 border-b-4 border-r-4 border-brand-400 rounded-br-xl pointer-events-none z-10 shadow-sm" />

        {/* Real-time Guidance Tip for laptop & phone webcams */}
        {isCameraRunning && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-navy-950/85 backdrop-blur-md border border-slate-700/60 text-slate-200 px-3 py-1 rounded-full text-[11px] font-semibold text-center pointer-events-none shadow-md whitespace-nowrap">
            💡 Hold barcode 15–25 cm (6–10 in) away and keep steady
          </div>
        )}

        {/* Hardware Acceleration Indicator */}
        {isCameraRunning && hardwareDetectorActive && (
          <div className="absolute top-3 left-3 z-20 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>AI Hardware Vision</span>
          </div>
        )}

        {/* When Camera is OFF, or Permission was Denied, show clear guidance */}
        {!isCameraRunning && (
          <div className="absolute inset-0 bg-navy-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
            {permissionDenied ? (
              <div className="space-y-2 text-rose-300 max-w-sm">
                <AlertCircle className="w-9 h-9 mx-auto text-rose-400" />
                <h4 className="text-sm font-bold text-white">Camera Permission Blocked</h4>
                <div className="text-[11px] text-slate-300 leading-relaxed text-left bg-navy-800/90 p-3 rounded-xl border border-rose-500/30 space-y-1">
                  <p className="font-semibold text-rose-300">To allow camera access:</p>
                  <p>1. Click the lock/info icon in your browser address bar.</p>
                  <p>2. Set <strong>Camera</strong> to <strong className="text-brand-400">Allow</strong>.</p>
                  <p>3. Click <strong>Retry Camera</strong> below.</p>
                </div>
              </div>
            ) : cameraError ? (
              <div className="space-y-2 text-rose-400 max-w-sm">
                <AlertCircle className="w-8 h-8 mx-auto" />
                <p className="text-xs font-semibold">{cameraError}</p>
              </div>
            ) : (
              <div className="space-y-1 text-slate-300">
                <Camera className="w-9 h-9 mx-auto text-brand-400" />
                <p className="text-sm font-bold text-white">Live Barcode Scanner</p>
                <p className="text-xs text-slate-400 max-w-xs">
                  Supports EAN-13, UPC, Code-128, ITF cartons &amp; QR codes.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-center pt-1">
              <button
                disabled={isInitializing}
                onClick={() => startCamera()}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-md shadow-brand-600/30 flex items-center space-x-2"
              >
                {isInitializing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>{cameraError ? 'Retry Camera' : 'Start Camera'}</span>
                  </>
                )}
              </button>

              {/* Upload Barcode Image Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center space-x-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Scan from Image</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Development-only scan helper */}
              {import.meta.env.DEV && (
                <button
                  onClick={() => {
                    const sampleBarcodes = ['616110001234', '616110002345', '616110003456', '616110005678', '6001087377158'];
                    const picked = sampleBarcodes[Math.floor(Math.random() * sampleBarcodes.length)];
                    handleDecodedBarcode(picked);
                  }}
                  className="bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/40 font-bold px-3.5 py-2.5 rounded-xl text-xs transition flex items-center space-x-1.5"
                  title="Simulate instant barcode scan with POS beep"
                >
                  <span>⚡ Test Scan (Beep)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scan Cooldown Success Flash Indicator */}
        {scanCooldown && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-emerald-600/95 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl flex items-center space-x-1.5 animate-bounce border border-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Barcode Scanned: {lastScannedCode}</span>
          </div>
        )}
      </div>

      {/* Control Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs">
        <div className="flex items-center space-x-2">
          {/* Camera Selection Dropdown */}
          {availableCameras.length > 1 ? (
            <div className="flex items-center space-x-1 text-slate-600">
              <Video className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedCameraId}
                onChange={(e) => handleCameraChange(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 py-1 px-1.5 focus:outline-none focus:border-brand-500"
              >
                {availableCameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.label || `Camera ${cam.id.slice(0, 5)}...`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-slate-500 text-[11px] flex items-center space-x-1">
              <Video className="w-3.5 h-3.5 text-brand-600" />
              <span>{isCameraRunning ? 'Camera Live' : 'Scanner Ready'}</span>
            </span>
          )}

          {isCameraRunning && (
            <button
              onClick={stopCamera}
              className="text-rose-600 hover:text-rose-700 font-bold text-[11px] bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg transition"
            >
              Turn Off
            </button>
          )}

          {/* Torch toggle if available */}
          {isCameraRunning && hasTorch && (
            <button
              onClick={toggleTorch}
              className={`flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                torchOn
                  ? 'bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {torchOn ? <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> : <ZapOff className="w-3.5 h-3.5" />}
              <span>{torchOn ? 'Flash ON' : 'Flash'}</span>
            </button>
          )}
        </div>

        {/* Sound Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center space-x-1 text-[11px] font-medium px-2 py-1 rounded-lg transition ${
            soundEnabled
              ? 'text-brand-700 bg-brand-50 hover:bg-brand-100'
              : 'text-slate-400 bg-slate-100 hover:bg-slate-200'
          }`}
          title="Toggle supermarket POS beep sound"
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span>POS Beep: {soundEnabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  );
};
