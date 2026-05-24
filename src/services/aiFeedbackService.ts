import { pb } from '../lib/pb';
import type { MushroomIdentification } from '../lib/gemini';

export interface AIFeedbackInput {
  aiPrediction: MushroomIdentification;
  userConfidence: number; // 1-5
  sightingId?: string;
  userCorrection?: string;
}

function getConfidenceBucket(confidence: number): string {
  if (confidence >= 90) return 'high';
  if (confidence >= 80) return 'medium-high';
  if (confidence >= 60) return 'medium';
  if (confidence >= 40) return 'low';
  return 'very-low';
}

export async function submitAIFeedback(data: AIFeedbackInput): Promise<void> {
  try {
    await pb.collection('ai_feedback').create({
      ai_prediction: data.aiPrediction,
      user_confidence: data.userConfidence,
      confidence_bucket: getConfidenceBucket(data.aiPrediction.confidence),
      ai_level: data.aiPrediction.level,
      ai_status: data.aiPrediction.status,
      sighting_id: data.sightingId || null,
      user_correction: data.userCorrection || null,
    });
  } catch (err) {
    console.error('Failed to submit AI feedback:', err);
    // Silently fail — feedback is not critical path
  }
}
