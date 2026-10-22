import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, RefreshCw, X } from "lucide-react";

type CameraCaptureProps = {
  onCapture: (file: File) => void;
  onClose: () => void;
};

type FacingMode = "environment" | "user";

/** Opens a live camera preview and returns a JPEG File when the user captures a frame. */
export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStarting(true);
    setError("");

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access is not available in this browser. Open CardVault on localhost or use HTTPS, then try again.");
        setStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStarting(false);
      } catch (cause) {
        if (cancelled) return;
        const name = cause instanceof DOMException ? cause.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("Camera permission was denied. Allow camera access in your browser's site settings and try again.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("No compatible camera was found on this device.");
        } else if (name === "NotReadableError") {
          setError("The camera is already in use by another app. Close that app and try again.");
        } else {
          setError("Could not start the camera. Check that a camera is connected and your browser has permission.");
        }
        setStarting(false);
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [facingMode]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setError("The camera is not ready yet. Please wait a moment and try again.");
      return;
    }

    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the captured image.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
      if (!blob) throw new Error("Could not create the photo. Please try again.");
      const file = new File([blob], `business-card-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      onCapture(file);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not capture the photo. Please try again.");
    } finally {
      setCapturing(false);
    }
  }, [onCapture, onClose]);

  const switchCamera = () => setFacingMode((current) => current === "environment" ? "user" : "environment");

  return (
    <div className="camera-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-title">
        <div className="camera-header">
          <div>
            <p className="eyebrow">CARDVAULT CAMERA</p>
            <h2 id="camera-title">Take a photo</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close camera"><X size={19} /></button>
        </div>

        <div className="camera-preview-wrap">
          <video ref={videoRef} className="camera-preview" autoPlay playsInline muted aria-label="Live camera preview" />
          {starting && <div className="camera-status"><span className="button-spinner" /> Starting camera…</div>}
          {error && <div className="camera-error"><CameraOff size={25} /><p>{error}</p><small>You can still use “Choose photos” in the note editor.</small></div>}
        </div>

        <div className="camera-footer">
          <button type="button" className="button secondary" onClick={switchCamera} disabled={starting || Boolean(error)}><RefreshCw size={16} /> Switch camera</button>
          <button type="button" className="button primary" onClick={() => void capturePhoto()} disabled={starting || Boolean(error) || capturing}><Camera size={17} /> {capturing ? "Capturing…" : "Capture photo"}</button>
        </div>
        <p className="camera-tip"><Check size={14} /> The captured photo will be added to your note. Save the note to upload it.</p>
      </section>
    </div>
  );
}
