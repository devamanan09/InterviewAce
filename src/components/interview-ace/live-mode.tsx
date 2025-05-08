"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AudioControls } from './audio-controls';
import { SuggestionCard } from './suggestion-card';
import { ChatLog } from './chat-log';
import { useAudioRecorder, type UseAudioRecorderResult } from '@/hooks/useAudioRecorder';
import { transcribeAudio, type SpeechRecognitionResult } from '@/services/speech-recognition';
import { suggestAnswers, type SuggestAnswersOutput } from '@/ai/flows/suggest-answers';
import { summarizeInterview, type SummarizeInterviewOutput } from '@/ai/flows/summarize-interview'; // For end-of-session summary
import type { TranscriptItem, AISuggestion, StoredInterviewSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Mic, Send, Bot, Save, RotateCcw, MessageCircle } from 'lucide-react';
import { saveSessionToLocalStorage } from '@/lib/local-storage';
import { v4 as uuidv4 } from 'uuid';

export function LiveMode() {
  const [interviewerQuestion, setInterviewerQuestion] = useState<string>('');
  const [userResponse, setUserResponse] = useState<string>(''); // For typed response if not using mic
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [currentSuggestion, setCurrentSuggestion] = useState<AISuggestion | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [sessionSummary, setSessionSummary] = useState<SummarizeInterviewOutput | null>(null);

  const audioRecorder = useAudioRecorder();
  const { toast } = useToast();
  const lastProcessedQuestionRef = useRef<string | null>(null);

  const addMessageToTranscript = useCallback((speaker: TranscriptItem['speaker'], text: string) => {
    setTranscript(prev => [...prev, { speaker, text, timestamp: Date.now() }]);
  }, []);

  const handleInterviewerQuestionSubmit = async () => {
    if (!interviewerQuestion.trim()) {
      toast({ title: "Empty Question", description: "Please enter the interviewer's question.", variant: "destructive" });
      return;
    }
    addMessageToTranscript('interviewer', interviewerQuestion);
    // Optionally, you could try to get initial suggestions based on the question alone
    // For now, we wait for user's response.
    setInterviewerQuestion(''); // Clear input after submit
    lastProcessedQuestionRef.current = transcript.filter(t => t.speaker === 'interviewer').pop()?.text || null;
  };

  const processUserResponse = async (responseText: string) => {
    if (!responseText.trim()) return;
    
    const lastQuestion = lastProcessedQuestionRef.current || transcript.filter(t => t.speaker === 'interviewer').pop()?.text;

    if (!lastQuestion) {
      toast({ title: "No Question Context", description: "Please ensure an interviewer question is logged before responding.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setCurrentSuggestion(null);
    try {
      const aiOutput: SuggestAnswersOutput = await suggestAnswers({
        interviewerQuestion: lastQuestion,
        userResponse: responseText,
      });
      const suggestion: AISuggestion = {
        suggestion: aiOutput.suggestedAnswer,
        improvementAreas: aiOutput.improvements,
      };
      setCurrentSuggestion(suggestion);
      addMessageToTranscript('ai', `Suggestion: ${suggestion.suggestion}\nImprovements: ${suggestion.improvementAreas}`);
      toast({ title: "AI Suggestion Ready", description: "Check the suggestions pane.", variant: "default" });
    } catch (error) {
      console.error("Error getting AI suggestion:", error);
      toast({ title: "AI Error", description: "Could not get AI suggestion.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleStartRecording = async () => {
    setUserResponse(''); // Clear typed response if starting mic
    await audioRecorder.startRecording();
  };

  const handleStopRecordingAndProcess = async () => {
    audioRecorder.stopRecording();
    // Processing will be triggered by useEffect watching audioRecorder.status
  };
  
  useEffect(() => {
    if (audioRecorder.status === 'stopped' && audioRecorder.audioBlob) {
      transcribeAndProcessAudio(audioRecorder.audioBlob);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioRecorder.status, audioRecorder.audioBlob]);

  const transcribeAndProcessAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      // Create a dummy MediaStream for the mock transcribeAudio function
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recognitionResult: SpeechRecognitionResult = await transcribeAudio(stream);
      stream.getTracks().forEach(track => track.stop()); // Stop the dummy stream

      const transcribedText = recognitionResult.text;
      addMessageToTranscript('user', transcribedText);
      await processUserResponse(transcribedText);
    } catch (error) {
      console.error("Error transcribing/processing audio:", error);
      toast({ title: "Transcription Error", description: "Failed to transcribe audio.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      audioRecorder.resetRecording();
    }
  };
  
  const handleUserTextResponseSubmit = async () => {
    if (!userResponse.trim()) {
      toast({ title: "Empty Response", description: "Please type your response.", variant: "destructive" });
      return;
    }
    addMessageToTranscript('user', userResponse);
    await processUserResponse(userResponse);
    setUserResponse(''); // Clear input
  };

  const handleEndSessionAndSummarize = async () => {
    if (transcript.length === 0) {
      toast({ title: "Empty Session", description: "No conversation to summarize.", variant: "default" });
      return;
    }
    setIsSummarizing(true);
    setSessionSummary(null);
    try {
      const fullTranscriptText = transcript.map(item => `${item.speaker}: ${item.text}`).join('\n');
      const summaryResult = await summarizeInterview({ transcript: fullTranscriptText });
      setSessionSummary(summaryResult);
      addMessageToTranscript('ai', `Session Summary: ${summaryResult.summary}\nOverall Feedback: ${summaryResult.areasForImprovement}`);
      toast({ title: "Session Summarized", description: "Overall feedback is available.", variant: "default" });
    } catch (error) {
      console.error("Error summarizing session:", error);
      toast({ title: "Summarization Error", description: "Failed to summarize session.", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  };
  
  const handleSaveSession = () => {
    if (transcript.length === 0) {
      toast({ title: "Cannot Save", description: "No session data to save.", variant: "destructive" });
      return;
    }
    const session: StoredInterviewSession = {
      id: uuidv4(),
      mode: 'live',
      date: new Date().toISOString(),
      transcript: transcript,
      summary: sessionSummary?.summary,
      overallFeedback: sessionSummary?.areasForImprovement,
    };
    saveSessionToLocalStorage(session);
    toast({ title: "Session Saved", description: "Your live session has been saved locally.", icon: <Save className="h-5 w-5" /> });
  };

  const handleResetSession = () => {
    setInterviewerQuestion('');
    setUserResponse('');
    setTranscript([]);
    setCurrentSuggestion(null);
    setSessionSummary(null);
    audioRecorder.resetRecording();
    lastProcessedQuestionRef.current = null;
    toast({ title: "Session Reset", description: "Live mode has been reset.", icon: <RotateCcw className="h-5 w-5" /> });
  };

  return (
    <Card className="w-full shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center"><Mic className="w-7 h-7 mr-2 text-primary" /> Live Interview Mode</CardTitle>
        <CardDescription>Get real-time AI assistance during your online interviews.</CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-6">
        {/* Left Pane: Chat and Inputs */}
        <div className="space-y-6 flex flex-col">
          <Card className="flex-grow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Conversation Log</CardTitle>
            </CardHeader>
            <CardContent>
              <ChatLog messages={transcript} height="calc(100vh - 500px)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Interviewer's Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                placeholder="Type or paste interviewer's question here..."
                value={interviewerQuestion}
                onChange={(e) => setInterviewerQuestion(e.target.value)}
                rows={3}
                className="text-base"
                disabled={isProcessing || audioRecorder.status === 'recording'}
              />
              <Button onClick={handleInterviewerQuestionSubmit} className="w-full" disabled={isProcessing || audioRecorder.status === 'recording' || !interviewerQuestion.trim()}>
                <Send className="w-4 h-4 mr-2" /> Log Question
              </Button>
            </CardContent>
          </Card>
          
          <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-lg">Your Response</CardTitle>
             </CardHeader>
             <CardContent className="space-y-3">
                 <AudioControls
                    status={audioRecorder.status}
                    onStart={handleStartRecording}
                    onStop={handleStopRecordingAndProcess}
                    error={audioRecorder.error}
                    disabled={isProcessing}
                    isProcessingAi={isProcessing}
                 />
                <div className="flex items-center space-x-2">
                    <hr className="flex-grow border-muted-foreground/50"/>
                    <span className="text-sm text-muted-foreground">OR</span>
                    <hr className="flex-grow border-muted-foreground/50"/>
                </div>
                <Textarea
                    placeholder="Type your response here if not using microphone..."
                    value={userResponse}
                    onChange={(e) => setUserResponse(e.target.value)}
                    rows={3}
                    className="text-base"
                    disabled={isProcessing || audioRecorder.status === 'recording'}
                />
                <Button onClick={handleUserTextResponseSubmit} className="w-full" disabled={isProcessing || audioRecorder.status === 'recording' || !userResponse.trim()}>
                    <Bot className="w-4 h-4 mr-2" /> Process Typed Response
                </Button>
             </CardContent>
          </Card>
        </div>

        {/* Right Pane: AI Suggestions */}
        <div className="space-y-6">
          <SuggestionCard suggestion={currentSuggestion} isLoading={isProcessing} title="Real-time AI Coach" />
          
          {isSummarizing && <div className="text-center p-4"><MessageCircle className="w-6 h-6 mx-auto mb-2 animate-pulse text-primary" />Generating session summary...</div>}
          {sessionSummary && !isSummarizing && (
            <Card className="bg-accent/10 border-accent/30">
              <CardHeader>
                <CardTitle className="text-xl flex items-center"><MessageCircle className="w-6 h-6 mr-2 text-accent" /> Session Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="font-semibold text-md">Summary:</h4>
                  <p className="text-sm p-2 bg-background/70 rounded border">{sessionSummary.summary}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-md">Overall Feedback:</h4>
                  <p className="text-sm p-2 bg-background/70 rounded border">{sessionSummary.areasForImprovement}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="mt-auto">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Session Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <Button onClick={handleEndSessionAndSummarize} variant="outline" className="w-full" disabled={isSummarizing || transcript.length === 0}>
                    <MessageCircle className="w-4 h-4 mr-2" /> End & Summarize Session
                </Button>
                <Button onClick={handleSaveSession} className="w-full" disabled={transcript.length === 0 || isSummarizing}>
                    <Save className="w-4 h-4 mr-2" /> Save Session
                </Button>
                <Button onClick={handleResetSession} variant="destructive" className="w-full">
                    <RotateCcw className="w-4 h-4 mr-2" /> Reset Session
                </Button>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
