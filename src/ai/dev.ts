import { config } from 'dotenv';
config();

import '@/ai/flows/generate-questions.ts';
import '@/ai/flows/summarize-interview.ts';
import '@/ai/flows/suggest-answers.ts';