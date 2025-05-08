"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { AudioControls } from './audio-controls';
import { SuggestionCard } from './suggestion-card';
import { LoadingSpinner } from './loading-spinner';
import { useAudioRecorder, type UseAudioRecorderResult } from '@/hooks/useAudioRecorder';
import { transcribeAudio, type SpeechRecognitionResult } from '@/services/speech-recognition';
import { generateQuestions, type GenerateQuestionsOutput } from '@/ai/flows/generate-questions';
import { suggestAnswers, type SuggestAnswersOutput } from '@/ai/flows/suggest-answers';
import { summarizeInterview, type SummarizeInterviewOutput } from '@/ai/flows/summarize-interview';
import type { InterviewQuestion, AISuggestion, PracticeSessionQuestion, StoredInterviewSession, TranscriptItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Wand2, Save, RotateCcw, AlertTriangle, MessageSquare, CheckCircle } from 'lucide-react';
import { saveSessionToLocalStorage } from '@/lib/local-storage';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

export function PracticeMode() {
  const [roleDescription, setRoleDescription] = useState<string>('');
  const [numQuestions, setNumQuestions] = useState<number>(3);
  const [generatedQuestions, setGeneratedQuestions] = useState<PracticeSessionQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [feedback, setFeedback] = useState<AISuggestion | null>(null);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState<boolean>(false);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [overallSummary, setOverallSummary] = useState<SummarizeInterviewOutput | null>(null);
  const [sessionTranscript, setSessionTranscript] = useState<TranscriptItem[]>([]);

  const audioRecorder = useAudioRecorder();
  const { toast } = useToast();

  const handleGenerateQuestions = async () => {
    if (!roleDescription.trim()) {
      toast({ title: "Role Description Needed", description: "Please enter a role description to generate questions.", variant: "destructive" });
      return;
    }
    setIsGeneratingQuestions(true);
    setGeneratedQuestions([]);
    setCurrentQuestionIndex(null);
    setOverallSummary(null);
    setSessionTranscript([]);
    try {
      const result: GenerateQuestionsOutput = await generateQuestions({ roleDescription, numQuestions });
      const questions = result.questions.map(q => ({ id: uuidv4(), text: q }));
      setGeneratedQuestions(questions);
      if (questions.length > 0) {
        setCurrentQuestionIndex(0);
        setSessionTranscript(prev => [...prev, { speaker: 'ai', text: `Generated questions for: ${roleDescription}`, timestamp: Date.now() }]);
        questions.forEach(q => {
          setSessionTranscript(prev => [...prev, { speaker: 'interviewer', text: q.text, timestamp: Date.now() }]);
        });
      } else {
        toast({ title: "No Questions Generated", description: "The AI didn't return any questions. Try a different role description.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error generating questions:", error);
      toast({ title: "Error", description: "Failed to generate questions. Please try again.", variant: "destructive" });
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const handleStartRecording = async () => {
    setUserAnswer('');
    setFeedback(null);
    await audioRecorder.startRecording();
  };

  const handleStopRecordingAndProcess = async () => {
    audioRecorder.stopRecording();
  };
  
  useEffect(() => {
    if (audioRecorder.status === 'stopped' && audioRecorder.audioBlob && currentQuestionIndex !== null) {
      processRecordedAnswer(audioRecorder.audioBlob);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioRecorder.status, audioRecorder.audioBlob, currentQuestionIndex]);


  const processRecordedAnswer = async (blob: Blob) => {
    if (currentQuestionIndex === null || !generatedQuestions[currentQuestionIndex]) return;
    
    setIsProcessingAnswer(true);
    try {
      // Simulate transcription if audioBlob is available
      // In a real app, you'd send blob to a transcription service.
      // For now, we use the mock `transcribeAudio` which doesn't actually use the blob.
      // We create a dummy MediaStream for the mock function.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recognitionResult: SpeechRecognitionResult = await transcribeAudio(stream);
      stream.getTracks().forEach(track => track.stop()); // Stop the dummy stream
      
      const transcribedText = recognitionResult.text;
      setUserAnswer(transcribedText);
      setSessionTranscript(prev => [...prev, { speaker: 'user', text: transcribedText, timestamp: Date.now() }]);

      const currentQ = generatedQuestions[currentQuestionIndex];
      const aiFeedback: SuggestAnswersOutput = await suggestAnswers({
        interviewerQuestion: currentQ.text,
        userResponse: transcribedText,
      });
      
      const newFeedback: AISuggestion = {
        suggestion: aiFeedback.suggestedAnswer,
        improvementAreas: aiFeedback.improvements,
      };
      setFeedback(newFeedback);
      setSessionTranscript(prev => [...prev, { speaker: 'ai', text: `Feedback: ${newFeedback.suggestion} Improvements: ${newFeedback.improvementAreas}`, timestamp: Date.now() }]);

      setGeneratedQuestions(prevQs => prevQs.map((q, idx) => 
        idx === currentQuestionIndex ? { ...q, userAnswer: transcribedText, feedback: newFeedback } : q
      ));

      toast({ title: "Answer Processed", description: "AI feedback is ready.", variant: "default" });

    } catch (error) {
      console.error("Error processing answer:", error);
      toast({ title: "Error", description: "Failed to process answer.", variant: "destructive" });
      setFeedback(null);
    } finally {
      setIsProcessingAnswer(false);
      audioRecorder.resetRecording();
    }
  };
  
  const handleNextQuestion = () => {
    if (currentQuestionIndex !== null && currentQuestionIndex < generatedQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setUserAnswer('');
      setFeedback(null);
      audioRecorder.resetRecording();
    } else if (currentQuestionIndex !== null && currentQuestionIndex === generatedQuestions.length - 1) {
      // Last question, offer to summarize
      handleSummarizeSession();
    }
  };

  const handleSummarizeSession = async () => {
    setIsSummarizing(true);
    setOverallSummary(null);
    try {
      const fullTranscript = generatedQuestions.reduce((acc, q) => {
        acc += `Interviewer: ${q.text}\n`;
        if (q.userAnswer) {
          acc += `Candidate: ${q.userAnswer}\n`;
        }
        if (q.feedback) {
          acc += `AI Coach (Suggestion): ${q.feedback.suggestion}\n`;
          if (q.feedback.improvementAreas) {
             acc += `AI Coach (Improvements): ${q.feedback.improvementAreas}\n`;
          }
        }
        acc += "\n";
        return acc;
      }, `Role: ${roleDescription}\n\n`);

      const summaryResult = await summarizeInterview({ transcript: fullTranscript });
      setOverallSummary(summaryResult);
      setSessionTranscript(prev => [...prev, { speaker: 'ai', text: `Session Summary: ${summaryResult.summary}\nAreas for Improvement: ${summaryResult.areasForImprovement}`, timestamp: Date.now() }]);
      toast({ title: "Session Summarized", description: "Overall feedback is available.", variant: "default" });
    } catch (error) {
      console.error("Error summarizing session:", error);
      toast({ title: "Error", description: "Failed to summarize session.", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  };
  
  const handleSaveSession = () => {
    if (generatedQuestions.length === 0) {
      toast({ title: "Cannot Save", description: "No practice session data to save.", variant: "destructive" });
      return;
    }
    const session: StoredInterviewSession = {
      id: uuidv4(),
      mode: 'practice',
      date: new Date().toISOString(),
      roleDescription: roleDescription,
      transcript: sessionTranscript,
      summary: overallSummary?.summary,
      overallFeedback: overallSummary?.areasForImprovement,
    };
    saveSessionToLocalStorage(session);
    toast({ title: "Session Saved", description: "Your practice session has been saved locally.", icon: <Save className="h-5 w-5" /> });
  };

  const handleResetPractice = () => {
    setRoleDescription('');
    setGeneratedQuestions([]);
    setCurrentQuestionIndex(null);
    setUserAnswer('');
    setFeedback(null);
    setOverallSummary(null);
    audioRecorder.resetRecording();
    setSessionTranscript([]);
    toast({ title: "Practice Reset", description: "Practice mode has been reset.", icon: <RotateCcw className="h-5 w-5" /> });
  };

  const currentQ = currentQuestionIndex !== null ? generatedQuestions[currentQuestionIndex] : null;

  return (
    <Card className="w-full shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center"><Wand2 className="w-7 h-7 mr-2 text-primary" /> Practice Mode</CardTitle>
        <CardDescription>Hone your interview skills with AI-generated questions and feedback.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Setup Section */}
        {!currentQ && !isGeneratingQuestions && (
          <Card className="bg-secondary/30 p-6 rounded-lg">
            <div className="space-y-4">
              <div>
                <Label htmlFor="role-description" className="text-lg font-semibold">Target Role Description</Label>
                <Textarea
                  id="role-description"
                  placeholder="e.g., Senior Software Engineer with experience in React, Node.js, and cloud platforms..."
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  rows={4}
                  className="mt-1 text-base"
                />
              </div>
              <div>
                <Label htmlFor="num-questions" className="text-md font-semibold">Number of Questions (1-10)</Label>
                <Input
                  id="num-questions"
                  type="number"
                  min="1"
                  max="10"
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                  className="mt-1 w-24 text-base"
                />
              </div>
              <Button onClick={handleGenerateQuestions} disabled={isGeneratingQuestions || !roleDescription.trim()} size="lg" className="w-full">
                {isGeneratingQuestions ? <LoadingSpinner text="Generating Questions..." /> : <><Wand2 className="w-5 h-5 mr-2" />Generate Interview Questions</>}
              </Button>
            </div>
          </Card>
        )}

        {isGeneratingQuestions && <LoadingSpinner text="AI is crafting your questions..." />}

        {/* Interview Section */}
        {currentQ && (
          <div className="space-y-6">
            <Card className="border-primary/50 shadow-md">
              <CardHeader>
                <CardTitle className="text-xl">Question {currentQuestionIndex! + 1} of {generatedQuestions.length}</CardTitle>
                 <CardDescription className="text-muted-foreground pt-1">Role: {roleDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-foreground mb-4 p-4 bg-primary/5 border border-primary/20 rounded-md">{currentQ.text}</p>
                
                <AudioControls
                  status={audioRecorder.status}
                  onStart={handleStartRecording}
                  onStop={handleStopRecordingAndProcess}
                  onReset={audioRecorder.resetRecording}
                  error={audioRecorder.error}
                  disabled={isProcessingAnswer}
                  isProcessingAi={isProcessingAnswer}
                />

                {audioRecorder.audioUrl && !isProcessingAnswer && (
                  <div className="mt-4">
                    <Label className="font-semibold">Your Recorded Answer:</Label>
                    <audio controls src={audioRecorder.audioUrl} className="w-full mt-1" />
                  </div>
                )}
                
                {userAnswer && !isProcessingAnswer && (
                  <div className="mt-4">
                    <Label className="font-semibold">Transcribed Answer:</Label>
                    <p className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">{userAnswer}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {(isProcessingAnswer || feedback) && (
              <SuggestionCard suggestion={feedback} isLoading={isProcessingAnswer} title="AI Feedback on Your Answer" />
            )}

            <div className="flex justify-between items-center mt-6">
              <Button onClick={handleNextQuestion} disabled={isProcessingAnswer || audioRecorder.status === 'recording'}>
                {currentQuestionIndex === generatedQuestions.length - 1 ? 
                  (overallSummary ? 'Practice Complete' : 'Finish & Summarize') : 
                  'Next Question'} 
                {currentQuestionIndex !== generatedQuestions.length - 1 && <CheckCircle className="w-5 h-5 ml-2"/>}
              </Button>
              {currentQuestionIndex === generatedQuestions.length - 1 && overallSummary && (
                <Button onClick={handleSaveSession} variant="outline" className="ml-2">
                  <Save className="w-5 h-5 mr-2" /> Save Session
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Overall Summary Section */}
        {isSummarizing && <LoadingSpinner text="Generating Session Summary..." />}
        {overallSummary && !isSummarizing && (
          <Card className="mt-6 bg-accent/10 border-accent/30">
            <CardHeader>
              <CardTitle className="text-xl flex items-center"><MessageSquare className="w-6 h-6 mr-2 text-accent" /> Overall Session Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h4 className="font-semibold text-md">Summary:</h4>
                <p className="text-sm p-2 bg-background/70 rounded border">{overallSummary.summary}</p>
              </div>
              <div>
                <h4 className="font-semibold text-md">Key Areas for Improvement:</h4>
                <p className="text-sm p-2 bg-background/70 rounded border">{overallSummary.areasForImprovement}</p>
              </div>
               <Button onClick={handleSaveSession} variant="outline" className="w-full mt-4">
                <Save className="w-5 h-5 mr-2" /> Save Full Session & Summary
              </Button>
            </CardContent>
          </Card>
        )}
        
        {/* Session History / All Questions Accordion */}
        {generatedQuestions.length > 0 && !isGeneratingQuestions && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Session Review</CardTitle>
              <CardDescription>Review all questions and your answers from this session.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {generatedQuestions.map((q, index) => (
                  <AccordionItem value={`item-${index}`} key={q.id}>
                    <AccordionTrigger className={`font-semibold ${index === currentQuestionIndex ? 'text-primary' : ''}`}>
                      Question {index + 1}: {q.text.substring(0,50)}{q.text.length > 50 ? "..." : ""}
                      {q.userAnswer && <CheckCircle className="w-5 h-5 ml-2 text-green-500" />}
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <p className="font-medium text-foreground"><strong>Full Question:</strong> {q.text}</p>
                      {q.userAnswer ? (
                        <div>
                          <p className="font-medium text-foreground"><strong>Your Answer:</strong></p>
                          <p className="text-sm p-2 bg-muted rounded whitespace-pre-wrap">{q.userAnswer}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No answer recorded for this question yet.</p>
                      )}
                      {q.feedback && (
                        <div className="p-3 border-l-4 border-accent bg-accent/5 rounded-r-md space-y-2">
                           <p className="font-medium text-accent"><strong>AI Suggestion:</strong></p>
                           <p className="text-sm whitespace-pre-wrap">{q.feedback.suggestion}</p>
                           {q.feedback.improvementAreas && (
                             <>
                              <p className="font-medium text-accent pt-1"><strong>Improvement Areas:</strong></p>
                              <p className="text-sm whitespace-pre-wrap">{q.feedback.improvementAreas}</p>
                             </>
                           )}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Global Actions */}
        {(generatedQuestions.length > 0 || roleDescription) && !isGeneratingQuestions && (
           <div className="mt-8 pt-6 border-t flex justify-end">
            <Button onClick={handleResetPractice} variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/50">
              <RotateCcw className="w-5 h-5 mr-2" /> Reset Practice Session
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
