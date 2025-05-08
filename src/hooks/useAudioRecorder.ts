"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import type { AudioStatus } from '@/lib/types';

export interface UseAudioRecorderResult {
  audioBlob: Blob | null;
  audioUrl: string | null;
  status: AudioStatus;
  startRecording: () => Promise<void>;
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

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setAudioUrl(null);

    if (status === "recording") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      setStatus("recording");
      
      const recorder = new MediaRecorder(stream);
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
        // Clean up the stream tracks after stopping
        stream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      };
      
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        // @ts-ignore
        setError(`MediaRecorder error: ${event.error?.name || 'Unknown error'}`);
        setStatus("idle");
         // Clean up the stream tracks on error
        stream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      };

      recorder.start();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      if (err instanceof Error) {
        setError(`Error accessing microphone: ${err.message}. Please ensure microphone access is granted.`);
      } else {
        setError("An unknown error occurred while accessing the microphone.");
      }
      setStatus("idle");
    }
  }, [status]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === "recording") {
      mediaRecorderRef.current.stop();
      // Status will be updated by onstop handler
    }
  }, [status]);

  const resetRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setStatus("idle");
    setError(null);
    audioChunksRef.current = [];
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
  }, [audioUrl, mediaStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [mediaStream, audioUrl]);

  return { audioBlob, audioUrl, status, startRecording, stopRecording, resetRecording, error, mediaStream };
}
