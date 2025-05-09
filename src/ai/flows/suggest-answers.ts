'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting answers during a live interview based on the interviewer's question.
 *
 * - suggestAnswers - A function that takes an interviewer question and returns an AI-powered answer suggestion and rationale.
 * - SuggestAnswersInput - The input type for the suggestAnswers function.
 * - SuggestAnswersOutput - The return type for the suggestAnswers function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestAnswersInputSchema = z.object({
  interviewerQuestion: z.string().describe('The question asked by the interviewer.'),
});
export type SuggestAnswersInput = z.infer<typeof SuggestAnswersInputSchema>;

const SuggestAnswersOutputSchema = z.object({
  suggestedAnswer: z.string().describe('An AI-suggested answer for the job seeker to use in response to the interviewer question.'),
  rationale: z.string().describe('A brief explanation of why the suggested answer is effective or key points it covers.'),
});
export type SuggestAnswersOutput = z.infer<typeof SuggestAnswersOutputSchema>;

export async function suggestAnswers(input: SuggestAnswersInput): Promise<SuggestAnswersOutput> {
  return suggestAnswersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestAnswersPrompt',
  input: {schema: SuggestAnswersInputSchema},
  output: {schema: SuggestAnswersOutputSchema},
  prompt: `You are an AI-powered interview coach. An interviewer has asked the following question. Your task is to generate a strong, concise, and effective answer that a job seeker could use in response to this question. Also, provide a brief explanation of why this answer is effective or what key points it covers.

Interviewer Question: {{{interviewerQuestion}}}

Suggested Answer for the Job Seeker:
[Provide a well-crafted answer here]

Key Points / Rationale:
[Explain briefly why the suggested answer is good or what it highlights]
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
