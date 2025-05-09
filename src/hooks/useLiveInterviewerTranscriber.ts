
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { LiveTranscriber, type LiveTranscriberOptions } from '@/services/speech-recognition';
import type { AudioSourceType } from '@/lib/types';
import { useToast } from './use-toast';

export interface UseLiveInterviewerTranscriberResult {
  startListening: (sourceType: AudioSourceType) => Promise<void>;
  stopListening: () => void;
  isListening: boolean;
  error: string | null;
  interimTranscript: string;
  finalTranscriptSegment: string | null; 
  resetFinalTranscriptSegment: () => void;
  sourceType: AudioSourceType | null; // Added to track the current source
}

export function useLiveInterviewerTranscriber(
  onFinalSegmentCallback: (text: string) => void
): UseLiveInterviewerTranscriberResult {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [finalTranscriptSegment, setFinalTranscriptSegment] = useState<string | null>(null);
  const [currentSourceType, setCurrentSourceType] = useState<AudioSourceType | null>(null);


  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const originalDisplayStreamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleTranscriptionResult = useCallback((text: string, isFinal: boolean) => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    if (isFinal) {
      setInterimTranscript(''); 
      if(text.trim()){ 
        setFinalTranscriptSegment(text); 
        onFinalSegmentCallback(text); 
      }
    } else {
      setInterimTranscript(text);
    }
  }, [onFinalSegmentCallback]);

  const handleTranscriptionError = useCallback((err: SpeechRecognitionErrorEvent | Error) => {
    let message = 'Transcription error';
    if (err instanceof Error) {
        message = err.message;
    } else if ('error' in err) { 
        message = `Transcription error: ${err.error}`;
        if (err.error === 'no-speech') {
            message = "No speech detected. Listening will continue if active.";
            setError(message); 
            return; 
        } else if (err.error === 'audio-capture') {
            message = "Audio capture failed. Please check microphone/audio source permissions.";
        } else if (err.error === 'not-allowed') {
            message = "Transcription permission denied. Please allow microphone/audio access.";
        }
    }
    setError(message);
    setIsListening(false); 
  }, []);
  
  const cleanupStreams = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (originalDisplayStreamRef.current) {
      originalDisplayStreamRef.current.getTracks().forEach(track => track.stop());
      originalDisplayStreamRef.current = null;
    }
  }, []);

  const startListening = useCallback(async (sourceType: AudioSourceType) => {
    setError(null);
    setInterimTranscript('');
    setFinalTranscriptSegment(null);
    setCurrentSourceType(sourceType);


    if (isListening) return;

    try {
      let streamToUse: MediaStream | undefined; 
      if (sourceType === 'display') {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        originalDisplayStreamRef.current = displayStream;
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error("Screen share started, but no audio track was found. Ensure audio sharing is enabled.");
        }
        streamToUse = new MediaStream(audioTracks); 
        displayStream.getVideoTracks().forEach(track => track.stop());
        mediaStreamRef.current = streamToUse;
      } else { 
        streamToUse = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = streamToUse; 
      }
      
      transcriberRef.current = new LiveTranscriber({
        onResult: handleTranscriptionResult,
        onError: handleTranscriptionError,
        onEnd: () => {
          if (isListening) {
            // No specific action on auto-end if still 'listening', user might restart.
          }
        }
      });
      
      transcriberRef.current.start(streamToUse); 
      setIsListening(true);
      toast({ title: `Listening for Interviewer (${sourceType})`, description: "Live transcription started.", variant: "default" });

    } catch (err: any) {
      let userFriendlyMessage = `Error starting listener for ${sourceType}: ${err.message}.`;
      if (err instanceof DOMException) {
         if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
            userFriendlyMessage = `Access to ${sourceType} was denied or disallowed by policy. Check permissions.`;
         } else if (err.name === 'NotFoundError') {
            userFriendlyMessage = `Could not start ${sourceType}. No source selected/available.`;
         }
      }
      setError(userFriendlyMessage);
      setIsListening(false);
      setCurrentSourceType(null);
      cleanupStreams();
    }
  }, [isListening, handleTranscriptionResult, handleTranscriptionError, cleanupStreams, toast]);

  const stopListening = useCallback(() => {
    if (transcriberRef.current?.getIsActive()) {
      transcriberRef.current.stop();
    }
    cleanupStreams(); 
    setIsListening(false);
    setCurrentSourceType(null);
    setInterimTranscript('');
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    toast({ title: "Stopped Listening", description: "Live transcription stopped.", variant: "default" });
  }, [cleanupStreams, toast]);
  
  const resetFinalTranscriptSegment = useCallback(() => {
    setFinalTranscriptSegment(null);
  }, []);

  useEffect(() => {
    return () => {
      if (transcriberRef.current?.getIsActive()) {
        transcriberRef.current.stop();
      }
      cleanupStreams();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [cleanupStreams]);

  return { startListening, stopListening, isListening, error, interimTranscript, finalTranscriptSegment, resetFinalTranscriptSegment, sourceType: currentSourceType };
}

    