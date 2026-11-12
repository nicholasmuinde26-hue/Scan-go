import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw, Volume2, VolumeX, CheckCircle2, AlertCircle, Upload, HelpCircle, Video } from 'lucide-react';

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

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimestamp = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerContainerId = 'scango-html5-camera-viewfinder';

  // Supermarket POS checkout beep sound synthesizer using Web Audio API
  const playCheckoutBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime); // 1200 Hz high POS chime
      osc.frequency.exponentialRampToValueAtTime(1800, audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
      // AudioContext may be restricted before user gesture
    }
  };

  // Discover and enumerate available cameras on this computer/device
  const discoverCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setAvailableCameras(devices);
        if (!selectedCameraId) {
          // Prefer back/environment camera on phones, otherwise pick the first available device
          const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
        return devices;
      } else {
        setAvailableCameras([]);
        return [];
      }
    } catch (err: any) {
      console.warn('Enumerate cameras notice:', err);
      return [];
    }
  };

  useEffect(() => {
    discoverCameras();
  }, []);

  // Start Camera Stream
  const startCamera = async (targetCameraId?: string) => {
    setIsInitializing(true);
    setCameraError(null);
    setPermissionDenied(false);

    try {
      // Clean up any running instance
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (e) {
          console.warn('Stop previous instance notice:', e);
        }
      }

      // Check device list
      let deviceIdToUse = targetCameraId || selectedCameraId;
      if (!deviceIdToUse) {
        const found = await discoverCameras();
        if (found && found.length > 0) {
          const backCam = found.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
          deviceIdToUse = backCam ? backCam.id : found[0].id;
          setSelectedCameraId(deviceIdToUse);
        }
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      });

      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.777778,
      };

      const onScanSuccessCallback = (decodedText: string) => {
        const now = Date.now();
        // Debounce same code within 2 seconds
        if (now - lastScanTimestamp.current < 2000 && lastScannedCode === decodedText) {
          return;
        }

        lastScanTimestamp.current = now;
        setLastScannedCode(decodedText);
        setScanCooldown(true);
        playCheckoutBeep();
        onScanSuccess(decodedText);

        setTimeout(() => setScanCooldown(false), 2000);
      };

      // Strategy 1: If specific camera deviceId is available, start with that deviceId
      if (deviceIdToUse) {
        try {
          await html5QrCode.start(
            deviceIdToUse,
            config,
            onScanSuccessCallback,
            () => {}
          );
          setIsCameraRunning(true);
          setIsInitializing(false);
          return;
        } catch (deviceStartErr) {
          console.warn('Direct deviceId start failed, trying generic constraints:', deviceStartErr);
        }
      }

      // Strategy 2: Fallback to { facingMode: "user" } (works on laptops & desktop webcams)
      try {
        await html5QrCode.start(
          { facingMode: 'user' },
          config,
          onScanSuccessCallback,
          () => {}
        );
        setIsCameraRunning(true);
        setIsInitializing(false);
        return;
      } catch (userFacingErr) {
        console.warn('User facing start failed, trying environment:', userFacingErr);
      }

      // Strategy 3: Fallback to { facingMode: "environment" } (mobile rear)
      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        onScanSuccessCallback,
        () => {}
      );
      setIsCameraRunning(true);
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
        setCameraError('Camera permission was blocked. Click the lock/camera icon in your address bar to allow camera access.');
      } else if (isNotFound || availableCameras.length === 0) {
        setCameraError('No webcam or camera device detected on this computer. Use "Scan from Image" below or simulate with sample barcodes.');
      } else {
        setCameraError(err?.message || 'Unable to open camera stream. The webcam may be in use by another program (e.g. Teams, Zoom).');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  // Stop Camera Stream
  const stopCamera = async () => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCameraRunning(false);
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

  // File Upload Barcode Scanner (Works 100% even if webcam is denied or unavailable!)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('hidden-file-scanner');
      const decoded = await html5QrCode.scanFile(file, true);
      playCheckoutBeep();
      setLastScannedCode(decoded);
      onScanSuccess(decoded);
    } catch (err: any) {
      alert('Could not detect a clear barcode in this photo. Please try a clearer barcode photo or enter the barcode number below.');
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
      <div className="relative w-full h-72 bg-navy-950 rounded-2xl border border-navy-700 flex items-center justify-center overflow-hidden shadow-inner">
        {/* HTML5 QR Camera Element */}
        <div id={scannerContainerId} className="w-full h-full object-cover" />

        {/* Laser Scanner animation line when running */}
        {isCameraRunning && (
          <div className="w-3/4 h-0.5 bg-red-500 shadow-lg shadow-red-500/80 animate-pulse absolute pointer-events-none z-10" />
        )}

        {/* Four Corner Brackets Overlay */}
        <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-brand-400 rounded-tl-xl pointer-events-none z-10" />
        <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-brand-400 rounded-tr-xl pointer-events-none z-10" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-brand-400 rounded-bl-xl pointer-events-none z-10" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-brand-400 rounded-br-xl pointer-events-none z-10" />

        {/* When Camera is OFF, or Permission was Denied, show clear guidance */}
        {!isCameraRunning && (
          <div className="absolute inset-0 bg-navy-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
            {permissionDenied ? (
              <div className="space-y-2 text-rose-300 max-w-sm">
                <AlertCircle className="w-9 h-9 mx-auto text-rose-400" />
                <h4 className="text-sm font-bold text-white">Camera Permission Blocked in Edge/Chrome</h4>
                <div className="text-[11px] text-slate-300 leading-relaxed text-left bg-navy-800/90 p-3 rounded-xl border border-rose-500/30 space-y-1">
                  <p className="font-semibold text-rose-300">To allow camera access in 2 clicks:</p>
                  <p>1. Click the <span className="inline-block bg-navy-700 text-white font-mono px-1 rounded border border-slate-700">ⓘ</span> icon in your address bar (left of <strong className="text-white">localhost:3000</strong>).</p>
                  <p>2. Next to <strong>Camera</strong>, change the dropdown from <em>Block</em> to <strong className="text-brand-400">Allow</strong>.</p>
                  <p>3. Click the green <strong>Retry Camera</strong> button below.</p>
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
                <p className="text-sm font-bold text-white">Live Camera Barcode Scanner</p>
                <p className="text-xs text-slate-400 max-w-xs">
                  Click below to activate device webcam, or upload an image of a barcode.
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
              {import.meta.env.DEV && <>
              <button
                onClick={() => {
                  const sampleBarcodes = ['616110001234', '616110002345', '616110003456', '616110005678'];
                  const picked = sampleBarcodes[Math.floor(Math.random() * sampleBarcodes.length)];
                  playCheckoutBeep();
                  setLastScannedCode(picked);
                  setScanCooldown(true);
                  onScanSuccess(picked);
                  setTimeout(() => setScanCooldown(false), 2000);
                }}
                className="bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/40 font-bold px-3.5 py-2.5 rounded-xl text-xs transition flex items-center space-x-1.5"
                title="Simulate instant barcode scan with POS beep"
              >
                <span>⚡ Test Scan (Beep)</span>
              </button>
              </>}
            </div>
          </div>
        )}

        {/* Scan Cooldown Success Flash Indicator */}
        {scanCooldown && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-brand-600/90 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center space-x-1.5 animate-bounce">
            <CheckCircle2 className="w-4 h-4" />
            <span>Barcode Detected: {lastScannedCode}</span>
          </div>
        )}
      </div>

      {/* Control Actions Bar */}
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs">
        <div className="flex items-center space-x-2">
          {/* Camera Selection Dropdown if multiple devices found */}
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
