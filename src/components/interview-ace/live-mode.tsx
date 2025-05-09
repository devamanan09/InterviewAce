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
import { useAudioRecorder, type AudioSourceType } from '@/hooks/useAudioRecorder';
import { useLiveInterviewerTranscriber } from '@/hooks/useLiveInterviewerTranscriber';
import { transcribeAudio, type SpeechRecognitionResult } from '@/services/speech-recognition';
import { suggestAnswers, type SuggestAnswersOutput } from '@/ai/flows/suggest-answers';
import { summarizeInterview, type SummarizeInterviewOutput } from '@/ai/flows/summarize-interview';
import type { TranscriptItem, AISuggestion, StoredInterviewSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Mic, Send, Bot, Save, RotateCcw, MessageCircle, MonitorPlay, Info, StopCircle as StopCircleLucide, Loader2, UserCheck } from 'lucide-react';
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
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [sessionSummary, setSessionSummary] = useState<SummarizeInterviewOutput | null>(null);
  const [interviewerInputMethod, setInterviewerInputMethod] = useState<InterviewerInputMethod>('manual');

  // For manual user responses
  const userResponseRecorder = useAudioRecorder();
  // For automatic user mic recording during screen share
  const autoUserMicRecorder = useAudioRecorder();
  const [userAutoSpeechLog, setUserAutoSpeechLog] = useState<TranscriptItem[]>([]);
  const [isProcessingAutoUserSpeech, setIsProcessingAutoUserSpeech] = useState<boolean>(false);


  const { toast } = useToast();
  const lastProcessedQuestionRef = useRef<string | null>(null);
  const aiTriggerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const AI_TRIGGER_PAUSE_DURATION_MS = 2500; 


  const addMessageToTranscript = useCallback((speaker: TranscriptItem['speaker'], text: string, targetLog: 'main' | 'userAuto' = 'main') => {
    if (!text.trim()) return; 
    const newItem = { speaker, text, timestamp: Date.now() };
    if (targetLog === 'main') {
      setTranscript(prev => [...prev, newItem]);
      if (speaker === 'interviewer') {
        lastProcessedQuestionRef.current = text;
      }
    } else if (targetLog === 'userAuto') {
      setUserAutoSpeechLog(prev => [...prev, newItem]);
    }
  }, []);

  const interviewerTranscriber = useLiveInterviewerTranscriber(
    (finalSegment) => {
      addMessageToTranscript('interviewer', finalSegment, 'main');
    }
  );

  useEffect(() => {
    setUserResponseText(''); 
    userResponseRecorder.resetRecording();
    // If screen audio was active and input method changes, stop auto user mic recording.
    if (interviewerInputMethod !== 'screenAudio' && autoUserMicRecorder.status === 'recording') {
        autoUserMicRecorder.stopRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewerInputMethod, interviewerTranscriber.isListening, userResponseRecorder, autoUserMicRecorder]);


  const handleManualInterviewerQuestionSubmit = async () => {
    if (!interviewerQuestionManual.trim()) {
      toast({ title: "Empty Question", description: "Please enter the interviewer's question.", variant: "destructive" });
      return;
    }
    addMessageToTranscript('interviewer', interviewerQuestionManual, 'main');
    await triggerAISuggestionForInterviewerQuestion(interviewerQuestionManual);
    setInterviewerQuestionManual(''); 
  };
  
  const triggerAISuggestionForInterviewerQuestion = async (questionText: string) => {
    if (!questionText.trim()) return;

    setIsProcessingUserResponse(true); 
    setCurrentSuggestion(null);
    try {
      const aiOutput: SuggestAnswersOutput = await suggestAnswers({
        interviewerQuestion: questionText,
        userResponse: "", 
      });
      const suggestion: AISuggestion = {
        suggestion: aiOutput.suggestedAnswer,
        improvementAreas: aiOutput.improvements,
      };
      setCurrentSuggestion(suggestion);
      toast({ title: "AI Suggestion Ready", description: "Check the AI Coach panel.", variant: "default" });
    } catch (error) {
      console.error("Error getting AI suggestion for interviewer question:", error);
      toast({ title: "AI Error", description: "Could not get AI suggestion.", variant: "destructive" });
    } finally {
      setIsProcessingUserResponse(false);
    }
  };

  useEffect(() => {
    if (interviewerTranscriber.finalTranscriptSegment && interviewerTranscriber.finalTranscriptSegment.trim()) {
      if (aiTriggerTimeoutRef.current) {
        clearTimeout(aiTriggerTimeoutRef.current);
      }
      const segmentToProcess = interviewerTranscriber.finalTranscriptSegment; 
      aiTriggerTimeoutRef.current = setTimeout(() => {
        if (segmentToProcess) { 
          triggerAISuggestionForInterviewerQuestion(segmentToProcess);
        }
      }, AI_TRIGGER_PAUSE_DURATION_MS);
    }
    return () => {
      if (aiTriggerTimeoutRef.current) {
        clearTimeout(aiTriggerTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewerTranscriber.finalTranscriptSegment]); 


  // For User's Manual Response (Microphone)
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
      const streamForMock = userResponseRecorder.mediaStream;
      const recognitionResult: SpeechRecognitionResult = streamForMock 
        ? await transcribeAudio(streamForMock) 
        : {text: "Mocked User Response from Blob", confidence: 0.9}; 

      const transcribedText = recognitionResult.text;
      addMessageToTranscript('user', transcribedText, 'main');
      
      const lastQuestion = lastProcessedQuestionRef.current;
      if (lastQuestion) {
        const aiFeedback: SuggestAnswersOutput = await suggestAnswers({
          interviewerQuestion: lastQuestion,
          userResponse: transcribedText,
        });
        const feedbackSuggestion: AISuggestion = {
          suggestion: aiFeedback.suggestedAnswer,
          improvementAreas: aiFeedback.improvements,
        };
        setCurrentSuggestion(feedbackSuggestion); 
        toast({ title: "Feedback on Your Answer", description: "AI Coach updated.", variant: "default" });
      } else {
         toast({ title: "User Response Logged", description: "No prior interviewer question for full AI feedback context.", variant: "default" });
      }

    } catch (error) {
      console.error("Error transcribing/processing user audio:", error);
      toast({ title: "User Transcription Error", description: "Failed to process your audio.", variant: "destructive" });
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
    const lastQuestion = lastProcessedQuestionRef.current;
    if (!lastQuestion) {
      toast({ title: "No Interviewer Question", description: "Please log or wait for an interviewer question first.", variant: "destructive" });
      return;
    }
    addMessageToTranscript('user', userResponseText, 'main');
    
    setIsProcessingUserResponse(true);
    try {
      const aiFeedback: SuggestAnswersOutput = await suggestAnswers({
        interviewerQuestion: lastQuestion,
        userResponse: userResponseText,
      });
      const feedbackSuggestion: AISuggestion = {
        suggestion: aiFeedback.suggestedAnswer,
        improvementAreas: aiFeedback.improvements,
      };
      setCurrentSuggestion(feedbackSuggestion);
      toast({ title: "Feedback on Your Typed Answer", description: "AI Coach updated.", variant: "default" });
    } catch (error) {
        console.error("Error getting AI feedback for typed response:", error);
        toast({ title: "AI Error", description: "Could not get feedback for your response.", variant: "destructive" });
    } finally {
        setIsProcessingUserResponse(false);
    }
    setUserResponseText('');
  };

  // Auto user mic recording during screen share
  useEffect(() => {
    if (interviewerTranscriber.isListening && interviewerInputMethod === 'screenAudio') {
        if (autoUserMicRecorder.status === 'idle') {
            autoUserMicRecorder.startRecording({ sourceType: 'microphone' });
        }
    } else {
        if (autoUserMicRecorder.status === 'recording') {
            autoUserMicRecorder.stopRecording();
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewerTranscriber.isListening, interviewerInputMethod]);

  useEffect(() => {
    if (autoUserMicRecorder.status === 'stopped' && autoUserMicRecorder.audioBlob) {
      const processAutoUserSpeech = async (blob: Blob) => {
        setIsProcessingAutoUserSpeech(true);
        try {
          const streamForMock = autoUserMicRecorder.mediaStream;
          const result: SpeechRecognitionResult = streamForMock 
            ? await transcribeAudio(streamForMock) 
            : { text: "Mocked auto user speech", confidence: 0.85 };
          
          if (result.text.trim()) {
            addMessageToTranscript('user', result.text, 'userAuto');
          }
        } catch (e) {
          console.error("Error transcribing auto user speech:", e);
          // Potentially show an error in the auto user speech log area
        } finally {
          setIsProcessingAutoUserSpeech(false);
          autoUserMicRecorder.resetRecording(); 
          // If screen sharing is still active, it should restart in the other useEffect
            if (interviewerTranscriber.isListening && interviewerInputMethod === 'screenAudio') {
                autoUserMicRecorder.startRecording({ sourceType: 'microphone' });
            }
        }
      };
      processAutoUserSpeech(autoUserMicRecorder.audioBlob);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUserMicRecorder.status, autoUserMicRecorder.audioBlob, addMessageToTranscript]);


  const handleEndSessionAndSummarize = async () => {
    if (transcript.length === 0) {
      toast({ title: "Empty Session", description: "No conversation to summarize.", variant: "default" });
      return;
    }
    setIsSummarizing(true);
    setSessionSummary(null);
    if (interviewerTranscriber.isListening) interviewerTranscriber.stopListening(); // This will also stop autoUserMicRecorder via useEffect
    if (userResponseRecorder.status === 'recording') userResponseRecorder.stopRecording();

    try {
      const fullTranscriptText = transcript.map(item => `${item.speaker}: ${item.text}`).join('\n');
      // Optionally include userAutoSpeechLog in the summary if relevant
      const summaryResult = await summarizeInterview({ transcript: fullTranscriptText });
      setSessionSummary(summaryResult);
      addMessageToTranscript('ai', `Session Summary: ${summaryResult.summary}\nOverall Feedback: ${summaryResult.areasForImprovement}`, 'main');
      toast({ title: "Session Summarized", description: "Overall feedback is available.", variant: "default" });
    } catch (error) {
      console.error("Error summarizing session:", error);
      toast({ title: "Summarization Error", description: "Failed to summarize session.", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  };
  
  const handleSaveSession = () => {
    if (transcript.length === 0 && userAutoSpeechLog.length === 0) {
      toast({ title: "Cannot Save", description: "No session data to save.", variant: "destructive" });
      return;
    }
    const session: StoredInterviewSession = {
      id: uuidv4(),
      mode: 'live',
      date: new Date().toISOString(),
      transcript: transcript,
      userSpokenResponses: userAutoSpeechLog, // Save the new log
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
    setUserAutoSpeechLog([]);
    setCurrentSuggestion(null);
    setSessionSummary(null);
    userResponseRecorder.resetRecording();
    if (interviewerTranscriber.isListening) interviewerTranscriber.stopListening(); // Will also stop autoUserMicRecorder
    else autoUserMicRecorder.resetRecording(); // Ensure it's reset if not stopped by interviewer stop
    interviewerTranscriber.resetFinalTranscriptSegment();
    lastProcessedQuestionRef.current = null;
    if (aiTriggerTimeoutRef.current) clearTimeout(aiTriggerTimeoutRef.current);
    toast({ title: "Session Reset", description: "Live mode has been reset.", icon: <RotateCcw className="h-5 w-5" /> });
  };

  const isScreenShareActive = interviewerInputMethod === 'screenAudio' && interviewerTranscriber.isListening;
  const anyUserRecordingActive = userResponseRecorder.status === 'recording'; // Manual user recording
  const generalProcessingActive = isProcessingUserResponse || isSummarizing || isProcessingAutoUserSpeech;
  const manualResponseDisabled = isScreenShareActive || anyUserRecordingActive || generalProcessingActive;


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
              <CardTitle className="text-lg">Conversation Log (Interviewer & AI)</CardTitle>
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
                onValueChange={(value: string) => {
                  setInterviewerInputMethod(value as InterviewerInputMethod);
                   if (interviewerTranscriber.isListening) {
                    interviewerTranscriber.stopListening(); // This will also stop autoUserMicRecorder
                   }
                }}
                className="flex space-x-4 mb-3"
                disabled={isScreenShareActive || anyUserRecordingActive || generalProcessingActive}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="manual" id="manual-input" />
                  <Label htmlFor="manual-input">Manual Text Input</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="screenAudio" id="screen-audio-input" />
                  <Label htmlFor="screen-audio-input">Live Mic/Screen Audio</Label>
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
                    disabled={isScreenShareActive || anyUserRecordingActive || generalProcessingActive}
                  />
                  <Button 
                    onClick={handleManualInterviewerQuestionSubmit} 
                    className="w-full" 
                    disabled={isScreenShareActive || anyUserRecordingActive || generalProcessingActive || !interviewerQuestionManual.trim()}
                  >
                    <Send className="w-4 h-4 mr-2" /> Log Question & Get Suggestion
                  </Button>
                </div>
              )}

              {interviewerInputMethod === 'screenAudio' && (
                <div className="space-y-2">
                   <Alert variant="default" className="bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700">
                    <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <AlertTitle className="text-blue-700 dark:text-blue-300">Live Audio Capture (Interviewer)</AlertTitle>
                    <AlertDescription className="text-blue-600 dark:text-blue-500 text-xs">
                     Start listening to capture interviewer's audio. If 'Screen' is chosen, your microphone will also be recorded for post-interview review (shown in a separate log).
                     <br />
                     <span className="font-semibold">Note:</span> Ensure audio sharing permissions for screen capture.
                    </AlertDescription>
                  </Alert>
                  {!interviewerTranscriber.isListening ? (
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                        <Button 
                            onClick={() => interviewerTranscriber.startListening('microphone')} 
                            className="w-full group transition-all hover:bg-green-500/10 hover:border-green-500 hover:text-green-600"
                            variant="outline"
                            disabled={anyUserRecordingActive || generalProcessingActive || interviewerTranscriber.isListening}
                        >
                            <Mic className="w-5 h-5 mr-2 text-green-600 group-hover:text-green-500" /> Start Interviewer (Mic)
                        </Button>
                        <Button 
                            onClick={() => interviewerTranscriber.startListening('display')} 
                            className="w-full group transition-all hover:bg-green-500/10 hover:border-green-500 hover:text-green-600"
                            variant="outline"
                            disabled={anyUserRecordingActive || generalProcessingActive || interviewerTranscriber.isListening}
                        >
                            <MonitorPlay className="w-5 h-5 mr-2 text-green-600 group-hover:text-green-500" /> Start Interviewer (Screen)
                        </Button>
                    </div>
                  ) : (
                    <Button 
                        onClick={interviewerTranscriber.stopListening} 
                        className="w-full" 
                        variant="destructive" 
                        disabled={generalProcessingActive && !interviewerTranscriber.isListening}
                    >
                      <StopCircleLucide className="w-5 h-5 mr-2" /> Stop Listening to Interviewer
                    </Button>
                  )}
                  {interviewerTranscriber.isListening && (
                    <div className="text-sm text-primary flex items-center p-2 bg-primary/5 rounded-md">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        <span>Listening for interviewer ({interviewerTranscriber.isListening ? 'Active' : 'Inactive'})... </span>
                        {interviewerTranscriber.interimTranscript && <span className="ml-1 italic text-muted-foreground">"{interviewerTranscriber.interimTranscript}"</span>}
                    </div>
                  )}
                  {interviewerTranscriber.error && <p className="text-sm text-destructive mt-1 p-2 bg-destructive/10 rounded-md">{interviewerTranscriber.error}</p>}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-lg">Your Manual Response</CardTitle>
                {isScreenShareActive && (
                    <CardDescription className="text-xs text-amber-600 dark:text-amber-400">Manual input disabled. Your mic is auto-recorded during screen share (see 'Your Spoken Responses' log).</CardDescription>
                )}
             </CardHeader>
             <CardContent className="space-y-3">
                 <AudioControls
                    status={userResponseRecorder.status}
                    onStart={handleStartUserRecording}
                    onStop={handleStopUserRecordingAndProcess}
                    onReset={userResponseRecorder.resetRecording}
                    error={userResponseRecorder.error}
                    disabled={manualResponseDisabled}
                    isProcessingAi={isProcessingUserResponse && userResponseRecorder.status !== 'recording'}
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
                    disabled={manualResponseDisabled}
                />
                <Button 
                  onClick={handleUserTextResponseSubmit} 
                  className="w-full" 
                  disabled={manualResponseDisabled || !userResponseText.trim()}
                >
                    <Bot className="w-4 h-4 mr-2" /> Process Typed Response & Get Feedback
                </Button>
             </CardContent>
          </Card>
        </div>

        {/* Right Pane: AI Suggestions & Auto User Log */}
        <div className="space-y-6">
          <SuggestionCard 
            suggestion={currentSuggestion} 
            isLoading={isProcessingUserResponse && !anyUserRecordingActive && interviewerInputMethod === 'manual' ? false : isProcessingUserResponse } 
            title="Real-time AI Coach" 
          />

          {isScreenShareActive && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <UserCheck className="w-5 h-5 mr-2 text-secondary-foreground" /> Your Spoken Responses
                </CardTitle>
                <CardDescription className="text-xs">
                  {autoUserMicRecorder.status === 'recording' ? "Your microphone is being recorded..." : "Transcript of your automatically recorded speech during screen share."}
                  {isProcessingAutoUserSpeech && <Loader2 className="inline w-4 h-4 ml-2 animate-spin" />}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChatLog messages={userAutoSpeechLog} height="150px" />
                 {autoUserMicRecorder.error && <p className="text-sm text-destructive mt-1 p-2 bg-destructive/10 rounded-md">{autoUserMicRecorder.error}</p>}
              </CardContent>
            </Card>
          )}
          
          {isSummarizing && <div className="text-center p-4"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-primary" />Generating session summary...</div>}
          {sessionSummary && !isSummarizing && (
            <Card className="bg-accent/10 border-accent/30">
              <CardHeader>
                <CardTitle className="text-xl flex items-center"><MessageCircle className="w-6 h-6 mr-2 text-accent" /> Session Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="font-semibold text-md">Summary:</h4>
                  <p className="text-sm p-2 bg-background/70 rounded border whitespace-pre-wrap">{sessionSummary.summary}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-md">Overall Feedback:</h4>
                  <p className="text-sm p-2 bg-background/70 rounded border whitespace-pre-wrap">{sessionSummary.areasForImprovement}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="mt-auto">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Session Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <Button 
                    onClick={handleEndSessionAndSummarize} 
                    variant="outline" 
                    className="w-full" 
                    disabled={isScreenShareActive || anyUserRecordingActive || generalProcessingActive || transcript.length === 0}
                >
                    <MessageCircle className="w-4 h-4 mr-2" /> End & Summarize Session
                </Button>
                <Button 
                    onClick={handleSaveSession} 
                    className="w-full" 
                    disabled={isScreenShareActive || anyUserRecordingActive || generalProcessingActive || (transcript.length === 0 && userAutoSpeechLog.length === 0)}
                >
                    <Save className="w-4 h-4 mr-2" /> Save Session
                </Button>
                <Button 
                    onClick={handleResetSession} 
                    variant="destructive" 
                    className="w-full" 
                    disabled={generalProcessingActive && (isScreenShareActive || anyUserRecordingActive)} // Allow reset if idle
                >
                    <RotateCcw className="w-4 h-4 mr-2" /> Reset Session
                </Button>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
