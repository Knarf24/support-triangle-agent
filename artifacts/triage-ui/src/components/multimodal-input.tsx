import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Camera, Paperclip, Loader2, X } from 'lucide-react';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { useToast } from '@/hooks/use-toast';

interface MultimodalInputProps {
  onTranscript: (text: string, method: "voice" | "camera" | "upload") => void;
  disabled?: boolean;
}

export function MultimodalInput({ onTranscript, disabled }: MultimodalInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<string>("");
  const { toast } = useToast();

  // Initialize Speech Recognition
  const startRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    transcriptRef.current = "";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        transcriptRef.current += finalTranscript;
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      stopRecording();
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (transcriptRef.current.trim()) {
        onTranscript(transcriptRef.current.trim(), "voice");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Camera logic
  const openCamera = async () => {
    setIsCameraOpen(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("Camera access denied or not available.");
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
    setIsProcessing(false);
  };

  const captureImage = async () => {
    if (!videoRef.current) return;
    
    setIsProcessing(true);
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      try {
        const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
        if (text.trim()) {
          onTranscript(text.trim(), "camera");
          closeCamera();
        } else {
          toast({ title: "No text found", description: "No text found in camera frame", variant: "default" });
          setIsProcessing(false);
        }
      } catch (err) {
        console.error("OCR error:", err);
        toast({ title: "Error", description: "Failed to process image", variant: "destructive" });
        setIsProcessing(false);
      }
    }
  };

  // File Upload logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      let extractedText = "";
      if (file.type.startsWith("image/")) {
        const { data: { text } } = await Tesseract.recognize(file, 'eng');
        extractedText = text;
      } else if (file.type === "application/pdf") {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
        }
        extractedText = fullText;
      }

      if (extractedText.trim()) {
        onTranscript(extractedText.trim(), "upload");
      } else {
        toast({ title: "No text found", description: "No text found in file", variant: "default" });
      }
    } catch (err) {
      console.error("File processing error:", err);
      toast({ title: "Error", description: "Failed to process file", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || isProcessing}
        onClick={toggleRecording}
        className={`p-2 rounded-lg border transition-colors ${
          isRecording 
            ? 'bg-destructive/20 border-destructive text-destructive animate-pulse' 
            : 'bg-black/40 border-white/10 text-muted-foreground hover:text-primary hover:border-primary/50'
        }`}
        title="Record Voice"
      >
        <Mic className="w-5 h-5" />
      </button>

      <button
        type="button"
        disabled={disabled || isProcessing}
        onClick={openCamera}
        className="p-2 rounded-lg border bg-black/40 border-white/10 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
        title="Camera OCR"
      >
        <Camera className="w-5 h-5" />
      </button>

      <button
        type="button"
        disabled={disabled || isProcessing}
        onClick={() => fileInputRef.current?.click()}
        className="p-2 rounded-lg border bg-black/40 border-white/10 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors relative"
        title="Upload File"
      >
        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,application/pdf"
          onChange={handleFileUpload}
        />
      </button>

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-card border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
              <h3 className="font-mono text-sm text-primary tracking-wider uppercase">Camera Scanner</h3>
              <button onClick={closeCamera} className="text-muted-foreground hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="relative aspect-video bg-black flex items-center justify-center">
              {cameraError ? (
                <div className="text-destructive font-mono text-sm p-4 text-center">{cameraError}</div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <span className="text-primary font-mono text-xs tracking-[0.2em] animate-pulse">PROCESSING...</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-6 flex justify-center gap-4 bg-black/20">
              {!cameraError && (
                <button
                  onClick={captureImage}
                  disabled={isProcessing}
                  className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-mono text-xs font-bold tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  CAPTURE
                </button>
              )}
              <button
                onClick={closeCamera}
                className="px-6 py-2 rounded-lg border border-white/10 text-white font-mono text-xs font-bold tracking-widest hover:bg-white/5 transition-all"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
