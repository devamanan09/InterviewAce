"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ChatLog } from './chat-log';
import type { StoredInterviewSession } from '@/lib/types';
import { getSessionsFromLocalStorage, deleteSessionFromLocalStorage } from '@/lib/local-storage';
import { useToast } from '@/hooks/use-toast';
import { History, Trash2, FileText, Brain, UserVoice } from 'lucide-react'; // Assuming UserVoice or similar icon
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';

// Placeholder for UserVoice if not in lucide-react, replace with a suitable one or SVG
const UserVoiceIcon = UserCheck; // Using UserCheck as a placeholder

export function ReviewMode() {
  const [sessions, setSessions] = useState<StoredInterviewSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<StoredInterviewSession | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = () => {
    const loadedSessions = getSessionsFromLocalStorage();
    setSessions(loadedSessions);
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionFromLocalStorage(sessionId);
    loadSessions(); // Refresh the list
    setSelectedSession(null); // Deselect if it was selected
    toast({ title: "Session Deleted", description: "The interview session has been removed.", variant: "default" });
  };

  if (sessions.length === 0) {
    return (
      <Card className="w-full shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><History className="w-7 h-7 mr-2 text-primary" /> Review Past Sessions</CardTitle>
          <CardDescription>Access and review your saved interview practice and live sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-10">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No Saved Sessions Yet</p>
            <p className="text-sm text-muted-foreground">Complete a practice or live session and save it to review it here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* Sessions List */}
      <Card className="md:col-span-1 shadow-lg h-fit sticky top-24">
        <CardHeader>
          <CardTitle className="text-xl flex items-center"><History className="w-6 h-6 mr-2 text-primary" /> Saved Sessions</CardTitle>
          <CardDescription>Select a session to review.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-250px)] overflow-y-auto p-0">
          {sessions.length > 0 ? (
            <ul className="divide-y divide-border">
              {sessions.map(session => (
                <li key={session.id}>
                  <button
                    onClick={() => setSelectedSession(session)}
                    className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${selectedSession?.id === session.id ? 'bg-muted' : ''}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{session.roleDescription || `Live Session`}</span>
                       <Badge variant={session.mode === 'practice' ? 'secondary' : 'outline'} className="capitalize text-xs">
                        {session.mode}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(session.date).toLocaleDateString()} - {new Date(session.date).toLocaleTimeString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No sessions found.</p>
          )}
        </CardContent>
      </Card>

      {/* Session Details */}
      <div className="md:col-span-2">
        {selectedSession ? (
          <Card className="shadow-xl">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">
                    {selectedSession.roleDescription ? `Practice: ${selectedSession.roleDescription}` : "Live Session Review"}
                  </CardTitle>
                  <CardDescription>
                    Date: {new Date(selectedSession.date).toLocaleString()}
                    <Badge variant={selectedSession.mode === 'practice' ? 'secondary' : 'default'} className="ml-2 capitalize">
                      {selectedSession.mode} Mode
                    </Badge>
                  </CardDescription>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the session data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteSession(selectedSession.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Accordion type="multiple" defaultValue={['transcript', 'summary', 'userResponses']} className="w-full">
                <AccordionItem value="transcript">
                  <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                    <FileText className="w-5 h-5 mr-2 text-primary"/> Main Conversation Transcript
                  </AccordionTrigger>
                  <AccordionContent>
                    <ChatLog messages={selectedSession.transcript} height="300px" />
                  </AccordionContent>
                </AccordionItem>

                {selectedSession.userSpokenResponses && selectedSession.userSpokenResponses.length > 0 && (
                  <AccordionItem value="userResponses">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                      <UserVoiceIcon className="w-5 h-5 mr-2 text-secondary-foreground"/> Your Spoken Responses (Auto-Recorded)
                    </AccordionTrigger>
                    <AccordionContent>
                      <ChatLog messages={selectedSession.userSpokenResponses} height="200px" />
                    </AccordionContent>
                  </AccordionItem>
                )}
                
                {(selectedSession.summary || selectedSession.overallFeedback) && (
                  <AccordionItem value="summary">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                      <Brain className="w-5 h-5 mr-2 text-accent"/> AI Summary & Feedback
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      {selectedSession.summary && (
                        <div>
                          <h4 className="font-semibold text-md text-foreground mb-1">Session Summary:</h4>
                          <p className="text-sm p-3 bg-muted rounded-md whitespace-pre-wrap">{selectedSession.summary}</p>
                        </div>
                      )}
                      {selectedSession.overallFeedback && (
                        <div>
                          <h4 className="font-semibold text-md text-foreground mb-1">Overall Feedback / Areas for Improvement:</h4>
                          <p className="text-sm p-3 bg-muted rounded-md whitespace-pre-wrap">{selectedSession.overallFeedback}</p>
                        </div>
                      )}
                      {!selectedSession.summary && !selectedSession.overallFeedback && (
                        <p className="text-sm text-muted-foreground">No AI summary or feedback was generated for this session.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-xl h-full flex flex-col justify-center items-center">
            <CardContent className="text-center py-20">
              <History className="w-20 h-20 mx-auto text-muted-foreground mb-6" />
              <p className="text-xl font-medium text-muted-foreground">Select a session from the list to review its details.</p>
              <p className="text-sm text-muted-foreground mt-2">You can view transcripts, AI feedback, and manage your saved sessions here.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
