"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import type { AudioStatus } from '@/lib/types';

export type AudioSourceType = 'microphone' | 'display';

export interface UseAudioRecorderOptions {
  sourceType?: AudioSourceType;
}
export interface UseAudioRecorderResult {
  audioBlob: Blob | null;
  audioUrl: string | null;
  status: AudioStatus;
  startRecording: (options?: UseAudioRecorderOptions) => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
  error: string | null;
  mediaStream: MediaStream | null;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // To store the original stream from getDisplayMedia if we create an audio-only one
  const originalDisplayStreamRef = useRef<MediaStream | null>(null);


  const startRecording = useCallback(async (options?: UseAudioRecorderOptions) => {
    setError(null);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);

    if (status === "recording") return;

    const currentSourceType = options?.sourceType || 'microphone';

    try {
      let streamToRecord: MediaStream;
      
      if (currentSourceType === 'display') {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
          audio: true, 
          video: true // Often required to trigger the screen sharing picker that includes audio
        });
        originalDisplayStreamRef.current = displayStream; // Save for full cleanup

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          setError("Screen share started, but no audio track was found. Please ensure you share audio (e.g., from a browser tab or system audio).");
          setStatus("idle");
          displayStream.getTracks().forEach(track => track.stop()); // Stop all tracks from display media
          originalDisplayStreamRef.current = null;
          return;
        }
        // Create a new stream with only the audio tracks for recording
        streamToRecord = new MediaStream(audioTracks);
        // Stop video tracks from original display stream as they are not needed for audio recording
        displayStream.getVideoTracks().forEach(track => track.stop());
      } else { // 'microphone'
        streamToRecord = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      setMediaStream(streamToRecord); // This is the stream used by MediaRecorder & potentially by consumers
      setStatus("recording");
      
      const recorder = new MediaRecorder(streamToRecord); // Use the (potentially audio-only) stream
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setStatus("stopped");
        // DO NOT stop tracks here. Let resetRecording handle it.
        // This keeps mediaStream available for consumers if needed immediately after stop.
      };
      
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        // @ts-ignore
        setError(`MediaRecorder error: ${event.error?.name || 'Unknown error'}`);
        setStatus("idle");
        // Stream cleanup will be handled by resetRecording or unmount
      };

      recorder.start();
    } catch (err) {
      let isPermissionsPolicyError = false;
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        if (err.message.toLowerCase().includes('disallowed by permissions policy') || err.message.toLowerCase().includes('permission denied by system')) {
          isPermissionsPolicyError = true;
        }
      }

      if (isPermissionsPolicyError) {
        console.warn(`Screen capture permission issue for ${currentSourceType}. This is often an environment or browser configuration issue. Error details:`, err.message);
      } else {
        console.error(`Error accessing ${currentSourceType}:`, err);
      }
      
      if (err instanceof DOMException) {
        let userFriendlyMessage = `Error accessing ${currentSourceType}: ${err.message}.`;
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          if (err.message.toLowerCase().includes('disallowed by permissions policy') || err.message.toLowerCase().includes('permission denied by system')) {
            userFriendlyMessage = `Access to screen capture (display-capture) is disallowed. This might be due to browser settings, system permissions (e.g., on macOS, screen recording permission for the browser), or if the app is in an iframe without 'allow="display-capture"'. Please check your browser/system permissions and ensure the feature is enabled.`;
          } else { // General permission denied by user
            userFriendlyMessage = `Access to ${currentSourceType} was denied. Please grant permission when prompted.`;
          }
        } else if (err.name === 'NotFoundError') {
          userFriendlyMessage = `Could not start ${currentSourceType}. No source selected or available, or required hardware is missing.`;
        } else if (err.name === 'AbortError') {
            userFriendlyMessage = `The ${currentSourceType} request was aborted, likely by the user dismissing the picker.`;
        }
        setError(userFriendlyMessage);
      } else if (err instanceof Error) { // Fallback for other generic errors
        setError(`Error accessing ${currentSourceType}: ${err.message}.`);
      }
      else {
        setError(`An unknown error occurred while accessing the ${currentSourceType}.`);
      }
      setStatus("idle");
      // Clean up any partial streams if they were created
      if (originalDisplayStreamRef.current) {
        originalDisplayStreamRef.current.getTracks().forEach(track => track.stop());
        originalDisplayStreamRef.current = null;
      }
      // Check if mediaStream was set and is different from originalDisplayStreamRef before trying to stop its tracks
      // This check avoids errors if setMediaStream(null) was called before this cleanup
      const currentMediaStreamState = mediaStreamRef.current; // Use a ref to get the latest mediaStream state for cleanup
      if (currentMediaStreamState && currentMediaStreamState !== originalDisplayStreamRef.current) {
        currentMediaStreamState.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }
    }
  }, [status, audioUrl]);

  // Use a ref for mediaStream to access its latest value in the catch block's cleanup
  const mediaStreamRef = useRef(mediaStream);
  useEffect(() => {
    mediaStreamRef.current = mediaStream;
  }, [mediaStream]);


  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      // Status will be updated by onstop handler
    }
  }, []);

  const resetRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); // ensure recording is stopped before resetting
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    // Stop tracks of the stream used for recording
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      setMediaStream(null); // This will also update mediaStreamRef.current via useEffect
    }
    // If there was an original display stream, ensure all its tracks are stopped too
    if (originalDisplayStreamRef.current) {
      originalDisplayStreamRef.current.getTracks().forEach(track => track.stop());
      originalDisplayStreamRef.current = null;
    }

    setAudioBlob(null);
    setAudioUrl(null);
    setStatus("idle");
    setError(null);
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
  }, [audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) { // Use ref for cleanup
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (originalDisplayStreamRef.current) {
        originalDisplayStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]); // audioUrl is a dependency for its own cleanup

  return { audioBlob, audioUrl, status, startRecording, stopRecording, resetRecording, error, mediaStream };
}