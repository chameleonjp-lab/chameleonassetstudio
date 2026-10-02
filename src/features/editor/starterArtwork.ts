import type { AssetType } from '../../core/model';

/** Original geometric samples. No external artwork, fonts or image dependencies. */
export function drawStarterArtwork(context: CanvasRenderingContext2D, type: AssetType) {
  context.save();
  context.scale(context.canvas.width / 32, context.canvas.height / 32);
  if (type === 'character') {
    context.fillStyle = '#70c488';
    context.fillRect(8, 5, 16, 15);
    context.fillRect(10, 20, 5, 8);
    context.fillRect(18, 20, 5, 8);
    context.fillStyle = '#20364b';
    context.fillRect(11, 10, 3, 3);
    context.fillRect(19, 10, 3, 3);
  } else if (type === 'item') {
    context.fillStyle = '#f4c758';
    context.beginPath();
    context.moveTo(16, 3);
    context.lineTo(27, 14);
    context.lineTo(16, 29);
    context.lineTo(5, 14);
    context.closePath();
    context.fill();
    context.fillStyle = '#fff0ba';
    context.fillRect(11, 10, 4, 6);
  } else if (type === 'tile') {
    context.fillStyle = '#a87954';
    context.fillRect(0, 8, 32, 24);
    context.fillStyle = '#70c488';
    context.fillRect(0, 0, 32, 8);
    context.fillStyle = '#765337';
    for (let y = 12; y < 32; y += 8) for (let x = 4; x < 32; x += 12) context.fillRect(x, y, 4, 3);
  } else if (type === 'effect') {
    context.fillStyle = '#f4c758';
    context.beginPath();
    context.moveTo(16, 1);
    context.lineTo(20, 12);
    context.lineTo(31, 16);
    context.lineTo(20, 20);
    context.lineTo(16, 31);
    context.lineTo(12, 20);
    context.lineTo(1, 16);
    context.lineTo(12, 12);
    context.closePath();
    context.fill();
    context.fillStyle = '#fff0ba';
    context.fillRect(13, 13, 6, 6);
  }
  context.restore();
}
