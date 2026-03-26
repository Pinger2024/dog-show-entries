import confetti from 'canvas-confetti';

/**
 * Fire a dog-themed confetti celebration!
 * Uses paw prints, bones, trophies, rosettes, and dogs as shapes.
 */
export function fireDogConfetti() {
  const duration = 1500;
  const end = Date.now() + duration;

  const dogEmojis = ['🐾', '🦴', '🏆', '🎀', '🐕'];
  const shapes = dogEmojis.map((emoji) =>
    confetti.shapeFromText({ text: emoji, scalar: 2 })
  );

  // Burst from both sides
  function frame() {
    if (Date.now() > end) return;

    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      shapes,
      scalar: 1.5,
      ticks: 120,
      gravity: 0.8,
      drift: 0.5,
    });

    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      shapes,
      scalar: 1.5,
      ticks: 120,
      gravity: 0.8,
      drift: -0.5,
    });

    requestAnimationFrame(frame);
  }

  // Initial big burst from the centre
  confetti({
    particleCount: 30,
    spread: 100,
    origin: { x: 0.5, y: 0.4 },
    shapes,
    scalar: 2,
    ticks: 150,
    gravity: 1.0,
  });

  frame();
}
