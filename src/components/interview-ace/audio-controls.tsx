"use client";

import { Button } from '@/components/ui/button';
import { Mic, StopCircle, RotateCcw, AlertTriangle, Loader2, MonitorPlay } from 'lucide-react';
import type { AudioStatus, AudioSourceType } from '@/lib/types'; // Assuming AudioSourceType is in lib/types
import { Progress } from '@/components/ui/progress';
import { useEffect, useState } from 'react';

interface AudioControlLabels {
  start?: string;
  recording?: string;
  stop?: string;
  reset?: string;
  processingAi?: string;
}

interface AudioControlsProps {
  status: AudioStatus;
  onStart: () => void;
  onStop: () => void;
  onReset?: () => void;
  disabled?: boolean;
  error?: string | null;
  isProcessingAi?: boolean;
  sourceType?: AudioSourceType; // To select icon
  labels?: AudioControlLabels;
}

const defaultLabels: Required<AudioControlLabels> = {
  start: 'Start Recording',
  recording: 'Recording',
  stop: 'Stop',
  reset: 'Reset recording',
  processingAi: 'AI is processing...',
};

export function AudioControls({ 
  status, 
  onStart, 
  onStop, 
  onReset, 
  disabled, 
  error, 
  isProcessingAi = false,
  sourceType = 'microphone',
  labels: customLabels 
}: AudioControlsProps) {
  const [recordingTime, setRecordingTime] = useState(0);
  const labels = { ...defaultLabels, ...customLabels };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'recording') {
      setRecordingTime(0); // Reset time on new recording start
      timer = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };
  
  const effectiveDisabled = disabled || isProcessingAi;
  const StartIcon = sourceType === 'display' ? MonitorPlay : Mic;

  return (
    <div className="space-y-3 p-4 border rounded-lg shadow bg-card">
      <div className="flex items-center justify-center space-x-3">
        <Button
          onClick={onStart}
          disabled={status === 'recording' || effectiveDisabled}
          variant="outline"
          size="lg"
          className="group transition-all hover:bg-green-500/10 hover:border-green-500 hover:text-green-600 disabled:opacity-60"
          aria-label={labels.start}
        >
          <StartIcon className={`w-6 h-6 mr-2 ${status === 'recording' ? 'text-red-500 animate-pulse' : 'text-green-600 group-hover:text-green-500'}`} />
          {status === 'recording' ? `${labels.recording} (${formatTime(recordingTime)})` : labels.start}
        </Button>
        <Button
          onClick={onStop}
          disabled={status !== 'recording' || effectiveDisabled}
          variant="destructive"
          size="lg"
          className="group transition-all hover:bg-red-600/90 disabled:opacity-60"
          aria-label={labels.stop}
        >
          <StopCircle className="w-6 h-6 mr-2" />
          {labels.stop}
        </Button>
        {onReset && (
          <Button
            onClick={onReset}
            disabled={status === 'recording' || status === 'idle' || effectiveDisabled}
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary disabled:opacity-60"
            aria-label={labels.reset}
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
        )}
      </div>
      
      {status === 'recording' && (
        <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="absolute h-full bg-primary animate-pulse-width"></div>
        </div>
      )}
      
      {error && (
        <div className="flex items-center text-destructive text-sm p-2 bg-destructive/10 rounded-md">
          <AlertTriangle className="w-5 h-5 mr-2 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {isProcessingAi && status !== 'recording' && (
         <div className="flex items-center justify-center text-primary text-sm p-2 bg-primary/10 rounded-md">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          <span>{labels.processingAi}</span>
        </div>
      )}
      <style jsx>{`
        .animate-pulse-width {
          animation: pulse-width 2s infinite ease-in-out;
        }
        @keyframes pulse-width {
          0% { width: 0%; opacity: 0.7; }
          50% { width: 100%; opacity: 1; }
          100% { width: 0%; opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
