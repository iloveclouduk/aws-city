// A small tooltip that says what a map badge means in words ("3 of your AWS resources run here", "2 things to fix
// here"), shown while the pointer is over the badge. One tooltip per scene, reused; counter-scaled like the labels.
import Phaser from 'phaser';
import { crisp, TEXT_FONT } from './SpeechBubble';
import { CSS, FONT_SIZE, withAlpha } from './theme';

/** Over the labels and markers, under the info card. */
const TIP_DEPTH = 58_000;

const tips = new WeakMap<Phaser.Scene, Phaser.GameObjects.Text>();

function tipOf(scene: Phaser.Scene) {
  let t = tips.get(scene);
  if (!t || !t.active) {
    t = crisp(scene.add.text(0, 0, '', { fontFamily: TEXT_FONT, fontSize: FONT_SIZE.sm, color: CSS.quote, backgroundColor: withAlpha('bg', 0.94), padding: { x: 6, y: 3 }, wordWrap: { width: 220 } }))
      .setOrigin(0.5, 1)
      .setDepth(TIP_DEPTH)
      .setVisible(false);
    tips.set(scene, t);
  }
  return t;
}

/** While the pointer is over `target`, a tooltip above it reads `text()` (the target must be interactive). */
export function hoverTip(target: Phaser.GameObjects.Text, text: () => string) {
  const scene = target.scene;
  target.on('pointerover', () => {
    if (!target.visible) return;
    const t = tipOf(scene);
    const s = 1 / scene.cameras.main.zoom;
    const b = target.getBounds();
    t.setText(text()).setScale(s).setPosition(Math.round(b.centerX), Math.round(b.top - 3 * s)).setVisible(true);
  });
  const hide = () => tips.get(scene)?.setVisible(false);
  target.on('pointerout', hide);
  target.once(Phaser.GameObjects.Events.DESTROY, hide);
}
