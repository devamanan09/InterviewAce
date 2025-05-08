"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { AudioControls } from './audio-controls';
import { SuggestionCard } from './suggestion-card';
import { ChatLog } from './chat-log';
import { useAudioRecorder, type UseAudioRecorderResult, type AudioSourceType } from '@/hooks/useAudioRecorder';
import { transcribeAudio, type SpeechRecognitionResult } from '@/services/speech-recognition';
import { suggestAnswers, type SuggestAnswersOutput } from '@/ai/flows/suggest-answers';
import { summarizeInterview, type SummarizeInterviewOutput } from '@/ai/flows/summarize-interview';
import type { TranscriptItem, AISuggestion, StoredInterviewSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Mic, Send, Bot, Save, RotateCcw, MessageCircle, MonitorPlay, Info } from 'lucide-react';
import { saveSessionToLocalStorage } from '@/lib/local-storage';
import { v4 as uuidv4 } from 'uuid';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type InterviewerInputMethod = 'manual' | 'screenAudio';

export function LiveMode() {
  const [interviewerQuestionManual, setInterviewerQuestionManual] = useState<string>('');
  const [userResponseText, setUserResponseText] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [currentSuggestion, setCurrentSuggestion] = useState<AISuggestion | null>(null);
  const [isProcessingUserResponse, setIsProcessingUserResponse] = useState<boolean>(false);
  const [isProcessingInterviewerAudio, setIsProcessingInterviewerAudio] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [sessionSummary, setSessionSummary] = useState<SummarizeInterviewOutput | null>(null);
  const [interviewerInputMethod, setInterviewerInputMethod] = useState<InterviewerInputMethod>('manual');

  const userResponseRecorder = useAudioRecorder();
  const interviewerAudioRecorder = useAudioRecorder();
  const { toast } = useToast();
  const lastProcessedQuestionRef = useRef<string | null>(null);

  const addMessageToTranscript = useCallback((speaker: TranscriptItem['speaker'], text: string) => {
    setTranscript(prev => [...prev, { speaker, text, timestamp: Date.now() }]);
    if (speaker === 'interviewer') {
      lastProcessedQuestionRef.current = text;
    }
  }, []);

  const handleManualInterviewerQuestionSubmit = async () => {
    if (!interviewerQuestionManual.trim()) {
      toast({ title: "Empty Question", description: "Please enter the interviewer's question.", variant: "destructive" });
      return;
    }
    addMessageToTranscript('interviewer', interviewerQuestionManual);
    setInterviewerQuestionManual(''); 
  };

  const processUserResponse = async (responseText: string) => {
    if (!responseText.trim()) return;
    
    const lastQuestion = lastProcessedQuestionRef.current;

    if (!lastQuestion) {
      toast({ title: "No Question Context", description: "Please ensure an interviewer question is logged before responding.", variant: "destructive" });
      return;
    }

    setIsProcessingUserResponse(true);
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
      setIsProcessingUserResponse(false);
    }
  };
  
  // For User's Response (Microphone)
  const handleStartUserRecording = async () => {
    setUserResponseText(''); 
    await userResponseRecorder.startRecording({sourceType: 'microphone'});
  };

  const handleStopUserRecordingAndProcess = async () => {
    userResponseRecorder.stopRecording();
  };
  
  useEffect(() => {
    if (userResponseRecorder.status === 'stopped' && userResponseRecorder.audioBlob) {
      transcribeAndProcessUserAudio(userResponseRecorder.audioBlob);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userResponseRecorder.status, userResponseRecorder.audioBlob]);

  const transcribeAndProcessUserAudio = async (blob: Blob) => {
    setIsProcessingUserResponse(true);
    try {
      // Use userResponseRecorder.mediaStream for the mock function if available
      const streamForMock = userResponseRecorder.mediaStream;
      if (!streamForMock && process.env.NODE_ENV === 'development') { // Mock specific logic
         console.warn("User media stream not available for mock transcription. Using blob directly (conceptual).");
      }
      const recognitionResult: SpeechRecognitionResult = streamForMock ? await transcribeAudio(streamForMock) : {text: "Mocked User Response from Blob", confidence: 0.9};

      const transcribedText = recognitionResult.text;
      addMessageToTranscript('user', transcribedText);
      await processUserResponse(transcribedText);
    } catch (error) {
      console.error("Error transcribing/processing user audio:", error);
      toast({ title: "User Transcription Error", description: "Failed to transcribe your audio.", variant: "destructive" });
    } finally {
      setIsProcessingUserResponse(false);
      userResponseRecorder.resetRecording();
    }
  };
  
  const handleUserTextResponseSubmit = async () => {
    if (!userResponseText.trim()) {
      toast({ title: "Empty Response", description: "Please type your response.", variant: "destructive" });
      return;
    }
    addMessageToTranscript('user', userResponseText);
    await processUserResponse(userResponseText);
    setUserResponseText('');
  };

  // For Interviewer's Audio (Screen Share)
  const handleStartInterviewerScreenAudio = async () => {
    await interviewerAudioRecorder.startRecording({ sourceType: 'display' });
  };

  const handleStopInterviewerScreenAudio = () => {
    interviewerAudioRecorder.stopRecording();
    // Transcription will be triggered by useEffect watching interviewerAudioRecorder.status
  };
  
  const handleResetInterviewerScreenAudio = () => {
    interviewerAudioRecorder.resetRecording(); // This also stops tracks and screen share
  };

  useEffect(() => {
    if (interviewerAudioRecorder.status === 'stopped' && interviewerAudioRecorder.audioBlob) {
      transcribeInterviewerAudio(interviewerAudioRecorder.audioBlob);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewerAudioRecorder.status, interviewerAudioRecorder.audioBlob]);

  const transcribeInterviewerAudio = async (blob: Blob) => {
    setIsProcessingInterviewerAudio(true);
    try {
       // Use interviewerAudioRecorder.mediaStream for the mock function if available
      const streamForMock = interviewerAudioRecorder.mediaStream;
      if (!streamForMock && process.env.NODE_ENV === 'development') {
        console.warn("Interviewer media stream not available for mock transcription. Using blob directly (conceptual).");
      }
      const recognitionResult: SpeechRecognitionResult = streamForMock ? await transcribeAudio(streamForMock) : {text: "Mocked Interviewer Question from Blob", confidence: 0.9};

      const transcribedText = recognitionResult.text;
      addMessageToTranscript('interviewer', transcribedText);
      toast({ title: "Interviewer Question Logged", description: "Question captured from screen audio.", variant: "default" });
    } catch (error) {
      console.error("Error transcribing interviewer audio:", error);
      toast({ title: "Interviewer Transcription Error", description: "Failed to transcribe interviewer audio.", variant: "destructive" });
    } finally {
      setIsProcessingInterviewerAudio(false);
      interviewerAudioRecorder.resetRecording(); // Also stops the screen share stream implicitly
    }
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
    setInterviewerQuestionManual('');
    setUserResponseText('');
    setTranscript([]);
    setCurrentSuggestion(null);
    setSessionSummary(null);
    userResponseRecorder.resetRecording();
    interviewerAudioRecorder.resetRecording();
    lastProcessedQuestionRef.current = null;
    toast({ title: "Session Reset", description: "Live mode has been reset.", icon: <RotateCcw className="h-5 w-5" /> });
  };

  const anyRecordingActive = userResponseRecorder.status === 'recording' || interviewerAudioRecorder.status === 'recording';
  const anyProcessingActive = isProcessingUserResponse || isProcessingInterviewerAudio || isSummarizing;

  const interviewerAudioLabels = {
    start: 'Start Listening (Screen)',
    recording: 'Listening to Screen',
    stop: 'Stop Listening',
    reset: 'Reset Screen Audio',
    processingAi: 'Processing Interviewer Audio...'
  };

  const userResponseAudioLabels = {
    start: 'Start Recording (Mic)',
    recording: 'Recording Your Response',
    stop: 'Stop Recording',
    reset: 'Reset Mic Audio',
    processingAi: 'Processing Your Response...'
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
              <ChatLog messages={transcript} height="calc(100vh - 550px)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Interviewer's Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RadioGroup 
                defaultValue="manual" 
                onValueChange={(value: InterviewerInputMethod) => {
                  setInterviewerInputMethod(value);
                  if (value === 'manual' && interviewerAudioRecorder.status === 'recording') {
                    interviewerAudioRecorder.stopRecording(); 
                    interviewerAudioRecorder.resetRecording();
                  }
                }}
                className="flex space-x-4 mb-3"
                disabled={anyRecordingActive || anyProcessingActive}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="manual" id="manual-input" />
                  <Label htmlFor="manual-input">Manual Text Input</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="screenAudio" id="screen-audio-input" />
                  <Label htmlFor="screen-audio-input">Screen/System Audio</Label>
                </div>
              </RadioGroup>

              {interviewerInputMethod === 'manual' && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Type or paste interviewer's question here..."
                    value={interviewerQuestionManual}
                    onChange={(e) => setInterviewerQuestionManual(e.target.value)}
                    rows={3}
                    className="text-base"
                    disabled={anyRecordingActive || anyProcessingActive}
                  />
                  <Button 
                    onClick={handleManualInterviewerQuestionSubmit} 
                    className="w-full" 
                    disabled={anyRecordingActive || anyProcessingActive || !interviewerQuestionManual.trim()}
                  >
                    <Send className="w-4 h-4 mr-2" /> Log Question
                  </Button>
                </div>
              )}

              {interviewerInputMethod === 'screenAudio' && (
                <div className="space-y-2">
                   <Alert variant="default" className="bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700">
                    <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <AlertTitle className="text-blue-700 dark:text-blue-300">Screen Audio Capture</AlertTitle>
                    <AlertDescription className="text-blue-600 dark:text-blue-500 text-xs">
                      This will attempt to capture audio from a screen, window, or browser tab you select.
                      Ensure you choose an option that includes audio sharing (e.g., "Share tab audio" in Chrome).
                      The video part of the screen share is not recorded or used.
                    </AlertDescription>
                  </Alert>
                  <AudioControls
                    status={interviewerAudioRecorder.status}
                    onStart={handleStartInterviewerScreenAudio}
                    onStop={handleStopInterviewerScreenAudio}
                    onReset={handleResetInterviewerScreenAudio}
                    error={interviewerAudioRecorder.error}
                    disabled={anyRecordingActive || anyProcessingActive || interviewerAudioRecorder.status === 'recording'}
                    isProcessingAi={isProcessingInterviewerAudio}
                    sourceType="display"
                    labels={interviewerAudioLabels}
                  />
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-lg">Your Response</CardTitle>
             </CardHeader>
             <CardContent className="space-y-3">
                 <AudioControls
                    status={userResponseRecorder.status}
                    onStart={handleStartUserRecording}
                    onStop={handleStopUserRecordingAndProcess}
                    onReset={userResponseRecorder.resetRecording}
                    error={userResponseRecorder.error}
                    disabled={anyRecordingActive || anyProcessingActive || userResponseRecorder.status === 'recording'}
                    isProcessingAi={isProcessingUserResponse}
                    sourceType="microphone"
                    labels={userResponseAudioLabels}
                 />
                <div className="flex items-center space-x-2">
                    <hr className="flex-grow border-muted-foreground/50"/>
                    <span className="text-sm text-muted-foreground">OR</span>
                    <hr className="flex-grow border-muted-foreground/50"/>
                </div>
                <Textarea
                    placeholder="Type your response here if not using microphone..."
                    value={userResponseText}
                    onChange={(e) => setUserResponseText(e.target.value)}
                    rows={3}
                    className="text-base"
                    disabled={anyRecordingActive || anyProcessingActive}
                />
                <Button 
                  onClick={handleUserTextResponseSubmit} 
                  className="w-full" 
                  disabled={anyRecordingActive || anyProcessingActive || !userResponseText.trim()}
                >
                    <Bot className="w-4 h-4 mr-2" /> Process Typed Response
                </Button>
             </CardContent>
          </Card>
        </div>

        {/* Right Pane: AI Suggestions */}
        <div className="space-y-6">
          <SuggestionCard suggestion={currentSuggestion} isLoading={isProcessingUserResponse} title="Real-time AI Coach" />
          
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
                <Button onClick={handleEndSessionAndSummarize} variant="outline" className="w-full" disabled={anyRecordingActive || anyProcessingActive || transcript.length === 0}>
                    <MessageCircle className="w-4 h-4 mr-2" /> End & Summarize Session
                </Button>
                <Button onClick={handleSaveSession} className="w-full" disabled={anyRecordingActive || anyProcessingActive || transcript.length === 0}>
                    <Save className="w-4 h-4 mr-2" /> Save Session
                </Button>
                <Button onClick={handleResetSession} variant="destructive" className="w-full" disabled={anyRecordingActive || anyProcessingActive}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Reset Session
                </Button>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
