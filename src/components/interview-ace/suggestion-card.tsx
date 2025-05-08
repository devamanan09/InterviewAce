import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lightbulb, CheckCircle, AlertCircle } from 'lucide-react';
import type { AISuggestion } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

interface SuggestionCardProps {
  suggestion: AISuggestion | null;
  isLoading: boolean;
  title?: string;
}

export function SuggestionCard({ suggestion, isLoading, title = "AI Suggestions" }: SuggestionCardProps) {
  return (
    <Card className="w-full shadow-lg border-accent/50 bg-accent/5">
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-2">
          <Lightbulb className="w-6 h-6 text-accent" />
          <CardTitle className="text-lg text-accent">{title}</CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          {isLoading ? "Generating insights..." : "Here's what AI suggests:"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center h-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        )}
        {!isLoading && !suggestion && (
          <p className="text-sm text-muted-foreground">No suggestions available at the moment. Speak or type to get AI feedback.</p>
        )}
        {!isLoading && suggestion && (
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-md mb-1 text-foreground">Suggested Approach:</h4>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap p-3 bg-background/50 rounded-md border border-border">
                {suggestion.suggestion || "No specific suggestion provided."}
              </p>
            </div>
            {suggestion.improvementAreas && (
              <div>
                <h4 className="font-semibold text-md mb-1 text-foreground">Areas for Improvement:</h4>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap p-3 bg-background/50 rounded-md border border-border">
                  {suggestion.improvementAreas}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
