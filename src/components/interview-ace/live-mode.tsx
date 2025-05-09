
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SuggestionCard } from './suggestion-card';
import { ChatLog } from './chat-log';
import { useLiveInterviewerTranscriber } from '@/hooks/useLiveInterviewerTranscriber';
import { suggestAnswers, type SuggestAnswersOutput } from '@/ai/flows/suggest-answers';
import { summarizeInterview, type SummarizeInterviewOutput } from '@/ai/flows/summarize-interview';
import type { TranscriptItem, AISuggestion, StoredInterviewSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Mic, Save, RotateCcw, MessageCircle, MonitorPlay, Info, StopCircle as StopCircleLucide, Loader2 } from 'lucide-react';
import { saveSessionToLocalStorage } from '@/lib/local-storage';
import { v4 as uuidv4 } from 'uuid';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function LiveMode() {
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [currentSuggestion, setCurrentSuggestion] = useState<AISuggestion | null>(null);
  const [isProcessingAISuggestion, setIsProcessingAISuggestion] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [sessionSummary, setSessionSummary] = useState<SummarizeInterviewOutput | null>(null);
  
  const { toast } = useToast();
  const aiTriggerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const AI_TRIGGER_PAUSE_DURATION_MS = 2500; 

  const addMessageToTranscript = useCallback((speaker: TranscriptItem['speaker'], text: string) => {
    if (!text.trim()) return; 
    const newItem = { speaker, text, timestamp: Date.now() };
    setTranscript(prev => [...prev, newItem]);
  }, []);

  const interviewerTranscriber = useLiveInterviewerTranscriber(
    (finalSegment) => {
      addMessageToTranscript('interviewer', finalSegment);
      // The useEffect for finalTranscriptSegment will trigger AI suggestion
    }
  );

  const triggerAISuggestionForInterviewerQuestion = async (questionText: string) => {
    if (!questionText.trim()) return;

    setIsProcessingAISuggestion(true); 
    setCurrentSuggestion(null);
    try {
      const aiOutput: SuggestAnswersOutput = await suggestAnswers({
        interviewerQuestion: questionText,
      });
      const suggestion: AISuggestion = {
        suggestion: aiOutput.suggestedAnswer,
        rationale: aiOutput.rationale,
      };
      setCurrentSuggestion(suggestion);
      // Add AI suggestion to transcript as well for a complete log
      addMessageToTranscript('ai', `Suggestion: ${aiOutput.suggestedAnswer}\nRationale: ${aiOutput.rationale}`);
      toast({ title: "AI Suggestion Ready", description: "Check the AI Coach panel.", variant: "default" });
    } catch (error) {
      console.error("Error getting AI suggestion for interviewer question:", error);
      toast({ title: "AI Error", description: "Could not get AI suggestion.", variant: "destructive" });
    } finally {
      setIsProcessingAISuggestion(false);
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
  }, [interviewerTranscriber.finalTranscriptSegment, addMessageToTranscript]); // Added addMessageToTranscript

  const handleEndSessionAndSummarize = async () => {
    if (transcript.length === 0) {
      toast({ title: "Empty Session", description: "No conversation to summarize.", variant: "default" });
      return;
    }
    setIsSummarizing(true);
    setSessionSummary(null);
    if (interviewerTranscriber.isListening) interviewerTranscriber.stopListening();

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
    setTranscript([]);
    setCurrentSuggestion(null);
    setSessionSummary(null);
    if (interviewerTranscriber.isListening) interviewerTranscriber.stopListening(); 
    interviewerTranscriber.resetFinalTranscriptSegment();
    if (aiTriggerTimeoutRef.current) clearTimeout(aiTriggerTimeoutRef.current);
    toast({ title: "Session Reset", description: "Live mode has been reset.", icon: <RotateCcw className="h-5 w-5" /> });
  };

  const generalProcessingActive = isProcessingAISuggestion || isSummarizing || interviewerTranscriber.isListening;

  return (
    <Card className="w-full shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center"><Mic className="w-7 h-7 mr-2 text-primary" /> Live Interview Mode</CardTitle>
        <CardDescription>Listen to the interviewer (via screen/system audio) and get real-time AI-powered answer suggestions.</CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-6">
        {/* Left Pane: Chat and Interviewer Controls */}
        <div className="space-y-6 flex flex-col">
          <Card className="flex-grow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Conversation Log</CardTitle>
              <CardDescription>Interviewer questions and AI suggestions will appear here.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChatLog messages={transcript} height="calc(100vh - 450px)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Interviewer Audio Capture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <Alert variant="default" className="bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/30">
                    <Info className="h-5 w-5 text-primary" />
                    <AlertTitle className="text-primary">Instructions</AlertTitle>
                    <AlertDescription className="text-foreground/80 text-xs">
                     Click "Start Listening" to capture the interviewer's audio from your screen or system. 
                     The transcribed question will appear in the log, and AI will generate a suggested answer.
                     <br />
                     <span className="font-semibold">Note:</span> Ensure you grant audio sharing permissions when prompted (usually for a browser tab or entire screen with audio).
                    </AlertDescription>
                  </Alert>
                  {!interviewerTranscriber.isListening ? (
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                        <Button 
                            onClick={() => interviewerTranscriber.startListening('display')} 
                            className="w-full group transition-all hover:bg-green-500/10 hover:border-green-500 hover:text-green-600"
                            variant="outline"
                            disabled={generalProcessingActive}
                            size="lg"
                        >
                            <MonitorPlay className="w-5 h-5 mr-2 text-green-600 group-hover:text-green-500" /> Start Listening (Screen/System Audio)
                        </Button>
                    </div>
                  ) : (
                    <Button 
                        onClick={interviewerTranscriber.stopListening} 
                        className="w-full" 
                        variant="destructive" 
                        disabled={isProcessingAISuggestion || isSummarizing} 
                        size="lg"
                    >
                      <StopCircleLucide className="w-5 h-5 mr-2" /> Stop Listening to Interviewer
                    </Button>
                  )}
                  {interviewerTranscriber.isListening && (
                    <div className="text-sm text-primary flex items-center p-2 bg-primary/5 rounded-md">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        <span>Listening for interviewer ({interviewerTranscriber.sourceType === 'display' ? 'Screen/System Audio' : 'Microphone'})... </span>
                        {interviewerTranscriber.interimTranscript && <span className="ml-1 italic text-muted-foreground">"{interviewerTranscriber.interimTranscript}"</span>}
                    </div>
                  )}
                  {interviewerTranscriber.error && <p className="text-sm text-destructive mt-1 p-2 bg-destructive/10 rounded-md">{interviewerTranscriber.error}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Right Pane: AI Suggestions & Session Controls */}
        <div className="space-y-6 flex flex-col">
          <SuggestionCard 
            suggestion={currentSuggestion} 
            isLoading={isProcessingAISuggestion} 
            title="Real-time AI Coach" 
          />
          
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

          <Card className="mt-auto sticky top-24"> {/* Make session controls sticky */}
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Session Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <Button 
                    onClick={handleEndSessionAndSummarize} 
                    variant="outline" 
                    className="w-full" 
                    disabled={generalProcessingActive || transcript.length === 0}
                >
                    <MessageCircle className="w-4 h-4 mr-2" /> End & Summarize Session
                </Button>
                <Button 
                    onClick={handleSaveSession} 
                    className="w-full" 
                    disabled={generalProcessingActive || transcript.length === 0}
                >
                    <Save className="w-4 h-4 mr-2" /> Save Session
                </Button>
                <Button 
                    onClick={handleResetSession} 
                    variant="destructive" 
                    className="w-full" 
                    disabled={isProcessingAISuggestion || isSummarizing} 
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
