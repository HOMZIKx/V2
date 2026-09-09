export async function resolveAiObservationFeedback(
  analysisId: string | null | undefined,
  finalOutput: unknown,
): Promise<boolean> {
  const id = analysisId?.trim();
  if (!id) return false;

  try {
    const response = await fetch(
      `/player-team/v1/ai-observations/${encodeURIComponent(id)}/feedback`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ finalOutput }),
      },
    );
    if (!response.ok) {
      console.error('AI observation feedback rejected', response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('AI observation feedback failed', error);
    return false;
  }
}
