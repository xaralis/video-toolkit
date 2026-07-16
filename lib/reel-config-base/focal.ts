// Maps optional focalX/focalY (0..1, undefined = center) to a CSS
// object-position string for use with objectFit:'cover'. Lets an off-center
// subject (e.g. a right-third-framed speaker) stay in frame under a 9:16 crop.
export function focalObjectPosition(focalX?: number, focalY?: number): string {
  const x = focalX ?? 0.5;
  const y = focalY ?? 0.5;
  return `${x * 100}% ${y * 100}%`;
}
