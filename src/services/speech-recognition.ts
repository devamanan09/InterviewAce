/**
 * Represents the result of a speech recognition operation.
 */
export interface SpeechRecognitionResult {
  /**
   * The transcribed text from the audio.
   */
  text: string;
  /**
   * A confidence score for the accuracy of the transcription.
   */
  confidence: number;
}

/**
 * Asynchronously transcribes audio data from a given audio stream.
 * This is a mock implementation.
 * @param audioStream The audio stream to transcribe.
 * @returns A promise that resolves to a SpeechRecognitionResult object.
 */
export async function transcribeAudio(_audioStream: MediaStream): Promise<SpeechRecognitionResult> {
  // TODO: Implement this by calling an external speech recognition API.

  // Simulating a delay and providing a mock response
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
  
  const mockTexts = [
    "This is a sample transcription from the audio.",
    "Tell me about a time you faced a challenge.",
    "What are your strengths and weaknesses?",
    "Why are you interested in this role?",
    "Okay, that sounds interesting, can you elaborate further?"
  ];
  const randomText = mockTexts[Math.floor(Math.random() * mockTexts.length)];

  return {
    text: randomText,
    confidence: 0.85 + Math.random() * 0.1, // Simulate confidence between 0.85 and 0.95
  };
}

export interface LiveTranscriberOptions {
  onResult: (text: string, isFinal: boolean) => void;
  onError: (error: SpeechRecognitionErrorEvent | Error) => void;
  onEnd?: () => void;
  lang?: string;
}

export class LiveTranscriber {
  private recognition: SpeechRecognition | null = null;
  private isActive: boolean = false;
  private options: LiveTranscriberOptions;
  private currentTextSinceLastFinal: string = ''; // Accumulates text between final results

  constructor(options: LiveTranscriberOptions) {
    this.options = options;
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        this.options.onError(new Error("SpeechRecognition API not available."));
        return;
      }
      this.recognition = new SpeechRecognitionAPI();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = options.lang || 'en-US';

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscriptThisPass = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscriptThisPass += transcriptPart;
          } else {
            interimTranscript += transcriptPart;
          }
        }

        if (finalTranscriptThisPass) {
          const fullFinalText = this.currentTextSinceLastFinal + finalTranscriptThisPass;
          this.options.onResult(fullFinalText.trim(), true);
          this.currentTextSinceLastFinal = ''; // Reset accumulator
        } else if (interimTranscript) {
          // For interim results, we want to show the full interim phrase,
          // starting from what was accumulated since the last final result.
          this.options.onResult((this.currentTextSinceLastFinal + interimTranscript).trim(), false);
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        this.options.onError(event);
        this.isActive = false; 
      };

      this.recognition.onend = () => {
        // if (this.isActive) { // If it ended while we expected it to be active
            // console.log("Speech recognition session ended. It might restart if continuous is true and there's more speech, or if manually restarted.");
            // It might be best to let the user explicitly restart or handle restart logic in the hook if desired.
        // }
        this.options.onEnd?.();
        // Do not automatically set isActive to false here if continuous is true,
        // as it might restart on its own. Control isActive via start/stop methods.
      };
    } else {
      this.options.onError(new Error("SpeechRecognition API not supported in this browser."));
    }
  }

  public start(_streamHint?: MediaStream): void { // streamHint is mostly conceptual for WebSpeechAPI
    if (!this.recognition || this.isActive) return;
    this.currentTextSinceLastFinal = ''; 
    try {
      this.recognition.start();
      this.isActive = true;
    } catch (e) {
        this.options.onError(e as Error);
        this.isActive = false;
    }
  }

  public stop(): void {
    if (!this.recognition || !this.isActive) return;
    this.isActive = false; 
    try {
        this.recognition.stop();
    } catch(e) {
        // console.warn("Error stopping recognition:", e);
    }
  }

  public getIsActive(): boolean {
    return this.isActive;
  }
}
