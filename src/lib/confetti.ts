import confetti from 'canvas-confetti';

/**
 * Fire a dog-themed confetti celebration!
 * Uses paw prints, bones, trophies, rosettes, and dogs as shapes.
 *
 * Goldilocks settings: 2s duration, large enough to recognise the
 * shapes, slow enough to enjoy, fast enough to not block the UI.
 */
export function fireDogConfetti() {
  const duration = 2000;
  const end = Date.now() + duration;

  const dogEmojis = ['🐾', '🦴', '🏆', '🎀', '🐕'];
  const shapes = dogEmojis.map((emoji) =>
    confetti.shapeFromText({ text: emoji, scalar: 3 })
  );

  // Burst from both sides
  function frame() {
    if (Date.now() > end) return;

    confetti({
      particleCount: 2,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.5 },
      shapes,
      scalar: 2,
      ticks: 180,
      gravity: 0.5,
      drift: 0.3,
    });

    confetti({
      particleCount: 2,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.5 },
      shapes,
      scalar: 2,
      ticks: 180,
      gravity: 0.5,
      drift: -0.3,
    });

    requestAnimationFrame(frame);
  }

  // Initial big burst from the centre
  confetti({
    particleCount: 25,
    spread: 120,
    origin: { x: 0.5, y: 0.35 },
    shapes,
    scalar: 3,
    ticks: 200,
    gravity: 0.4,
  });

  frame();
}
