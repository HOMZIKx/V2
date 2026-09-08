export interface ContainedImageHitTestInput {
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly localX: number;
  readonly localY: number;
}

/**
 * Returns true only when a point lands on the bitmap painted by
 * `object-fit: contain`, excluding the horizontal/vertical letterbox bands.
 */
export function isPointInsideContainedImage({
  boxWidth,
  boxHeight,
  naturalWidth,
  naturalHeight,
  localX,
  localY,
}: ContainedImageHitTestInput): boolean {
  if (
    !Number.isFinite(boxWidth) ||
    !Number.isFinite(boxHeight) ||
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    !Number.isFinite(localX) ||
    !Number.isFinite(localY) ||
    boxWidth <= 0 ||
    boxHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return false;
  }

  const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  const offsetX = (boxWidth - renderedWidth) / 2;
  const offsetY = (boxHeight - renderedHeight) / 2;
  const epsilon = 0.001;

  return (
    localX >= offsetX - epsilon &&
    localX <= offsetX + renderedWidth + epsilon &&
    localY >= offsetY - epsilon &&
    localY <= offsetY + renderedHeight + epsilon
  );
}
