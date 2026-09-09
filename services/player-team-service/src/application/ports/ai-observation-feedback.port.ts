export type AiObservationType = 'equipment' | 'economy';
export type AiFeedbackStatus = 'accepted' | 'corrected' | 'rejected';

export type PendingAiObservation = {
  readonly id: string;
  readonly aiOutput: unknown;
  readonly characterId: string | null;
  readonly createdAtIso: string;
};

export interface AiObservationFeedbackPort {
  latestPending(
    viewerDiscordId: string,
    input: {
      readonly analysisType: AiObservationType;
      readonly workspaceId: string;
      readonly maxAgeMinutes?: number;
    },
  ): Promise<PendingAiObservation | null>;
  addFeedback(
    viewerDiscordId: string,
    observationId: string,
    input: {
      readonly status: AiFeedbackStatus;
      readonly finalOutput?: unknown;
      readonly changedFields?: readonly string[];
    },
  ): Promise<{
    readonly id: string;
    readonly status: AiFeedbackStatus;
    readonly feedbackAtIso: string;
  }>;
}
