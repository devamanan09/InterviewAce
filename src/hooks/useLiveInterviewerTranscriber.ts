
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
}

export function useLiveInterviewerTranscriber(
  onFinalSegmentCallback: (text: string) => void
): UseLiveInterviewerTranscriberResult {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [finalTranscriptSegment, setFinalTranscriptSegment] = useState<string | null>(null);

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
      if(text.trim()){ // only process if there's actual text
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
    } else if ('error' in err) { // SpeechRecognitionErrorEvent
        message = `Transcription error: ${err.error}`;
        if (err.error === 'no-speech') {
            message = "No speech detected. Listening will continue if active.";
            // Don't necessarily stop listening or show a breaking error for no-speech if continuous
            setError(message); // Informative error
            return; // Potentially keep listening
        } else if (err.error === 'audio-capture') {
            message = "Audio capture failed. Please check microphone/audio source permissions.";
        } else if (err.error === 'not-allowed') {
            message = "Transcription permission denied. Please allow microphone/audio access.";
        }
    }
    setError(message);
    setIsListening(false); // Stop listening on critical errors
    // console.error(message, err);
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

    if (isListening) return;

    try {
      let streamToUse: MediaStream | undefined; // Undefined initially
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
      } else { // 'microphone'
        // For microphone, Web Speech API usually picks default. We still get the stream to ensure permission is granted.
        streamToUse = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = streamToUse; // Store it for cleanup
      }
      
      // Initialize LiveTranscriber if it doesn't exist or re-initialize
      transcriberRef.current = new LiveTranscriber({
        onResult: handleTranscriptionResult,
        onError: handleTranscriptionError,
        onEnd: () => {
          // This onEnd might be called by the browser if speech stops for too long.
          // If `isListening` is still true, it implies an unexpected stop.
          if (isListening) {
            // console.log("Transcriber ended, but hook still active. May need manual restart or could be end of utterance.");
            // Potentially, we could try to restart it here if that's the desired behavior for continuous listening.
            // For now, we let it end and the user can restart if needed.
            // setIsListening(false); // Or let stopListening handle this
          }
        }
      });
      
      // The `streamToUse` is primarily for getting permissions and for potential future use if Web Speech API changes.
      // The LiveTranscriber internally uses the default mechanism of SpeechRecognition API.
      transcriberRef.current.start(streamToUse); // Pass the stream, even if conceptually used by LiveTranscriber
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
      cleanupStreams();
    }
  }, [isListening, handleTranscriptionResult, handleTranscriptionError, cleanupStreams, toast]);

  const stopListening = useCallback(() => {
    if (transcriberRef.current?.getIsActive()) {
      transcriberRef.current.stop();
    }
    cleanupStreams(); // Important to release camera/mic/screen
    setIsListening(false);
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

  return { startListening, stopListening, isListening, error, interimTranscript, finalTranscriptSegment, resetFinalTranscriptSegment };
}
