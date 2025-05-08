"use client";

import { useState, useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PracticeMode } from '@/components/interview-ace/practice-mode';
import { LiveMode } from '@/components/interview-ace/live-mode';
import { ReviewMode } from '@/components/interview-ace/review-mode';
import { Dumbbell, Mic, History, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Mode = "practice" | "live" | "review";

export default function InterviewAcePage() {
  const [currentMode, setCurrentMode] = useState<Mode>("practice");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <LoadingPlaceholder />;
  }
  
  return (
    <div className="flex flex-col items-center w-full space-y-8">
      <Alert className="w-full max-w-4xl bg-primary/5 border-primary/20">
        <Info className="h-5 w-5 text-primary" />
        <AlertTitle className="font-semibold text-primary">Welcome to InterviewAce!</AlertTitle>
        <AlertDescription className="text-foreground/80">
          Enhance your interview skills with AI-powered practice, real-time assistance, and insightful reviews. Select a mode below to get started.
          <br />
          <small className="text-xs text-muted-foreground">Note: System audio capture for interviewer's voice is not fully supported in web browsers. For Live Mode, ensure interviewer's audio is audible via your microphone or type their questions manually.</small>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="practice" className="w-full max-w-4xl" onValueChange={(value) => setCurrentMode(value as Mode)}>
        <TabsList className="grid w-full grid-cols-3 bg-secondary/50 p-1.5 rounded-lg shadow-inner">
          <TabsTrigger value="practice" className="py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
            <Dumbbell className="w-5 h-5 mr-2" /> Practice Mode
          </TabsTrigger>
          <TabsTrigger value="live" className="py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
            <Mic className="w-5 h-5 mr-2" /> Live Mode
          </TabsTrigger>
          <TabsTrigger value="review" className="py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
            <History className="w-5 h-5 mr-2" /> Review Sessions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="practice" className="mt-6">
          <PracticeMode />
        </TabsContent>
        <TabsContent value="live" className="mt-6">
          <LiveMode />
        </TabsContent>
        <TabsContent value="review" className="mt-6">
          <ReviewMode />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="flex flex-col items-center w-full space-y-8 animate-pulse">
      <div className="w-full max-w-4xl h-24 bg-muted rounded-lg"></div>
      <div className="w-full max-w-4xl h-12 bg-muted rounded-lg"></div>
      <div className="w-full max-w-4xl h-96 bg-muted rounded-lg mt-6"></div>
    </div>
  );
}
