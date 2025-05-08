// 'use server'
'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting answers and improvements during a live interview.
 *
 * - suggestAnswers - A function that takes interviewer question and user response, and returns AI-powered answer suggestions and improvements.
 * - SuggestAnswersInput - The input type for the suggestAnswers function.
 * - SuggestAnswersOutput - The return type for the suggestAnswers function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestAnswersInputSchema = z.object({
  interviewerQuestion: z.string().describe('The question asked by the interviewer.'),
  userResponse: z.string().describe('The user\'s response to the interviewer question.'),
});
export type SuggestAnswersInput = z.infer<typeof SuggestAnswersInputSchema>;

const SuggestAnswersOutputSchema = z.object({
  suggestedAnswer: z.string().describe('An AI-suggested answer to the interviewer question.'),
  improvements: z.string().describe('Suggestions for improving the user\'s response.'),
});
export type SuggestAnswersOutput = z.infer<typeof SuggestAnswersOutputSchema>;

export async function suggestAnswers(input: SuggestAnswersInput): Promise<SuggestAnswersOutput> {
  return suggestAnswersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestAnswersPrompt',
  input: {schema: SuggestAnswersInputSchema},
  output: {schema: SuggestAnswersOutputSchema},
  prompt: `You are an AI-powered interview coach. Your task is to provide helpful suggestions to the user during a live interview.

  Based on the interviewer's question and the user's response, generate a suggested answer and provide specific improvements to the user's response.

  Interviewer Question: {{{interviewerQuestion}}}
  User Response: {{{userResponse}}}

  Suggested Answer:
  Improvements:
  `,
});

const suggestAnswersFlow = ai.defineFlow(
  {
    name: 'suggestAnswersFlow',
    inputSchema: SuggestAnswersInputSchema,
    outputSchema: SuggestAnswersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
