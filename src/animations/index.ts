import { Timeline } from 'animejs';
import { AnimationController } from './AnimationController';
import { createBeatAnimation } from './beatAnimation';
import { createCursorAnimation } from './cursorAnimation';
import { createAfterShakeAnimation } from './afterShake';

export { AnimationController };
export type { AnimationControllerConfig, AnimatableValues } from './AnimationController';

/**
 * Creates the main animation timeline.
 *
 * @param controller - Animation controller that owns the animatable values
 */
export const createMainTimeline = (controller: AnimationController): Timeline => {
    const { values, orbitMultiplier } = controller;

    const beatAnimation = createBeatAnimation(controller);
    const cursorAnimation = createCursorAnimation(controller);
    const afterShakeAnimation = createAfterShakeAnimation(controller);

    const timeline = new Timeline({ autoplay: false, alternate: false, loop: false, frameRate: 120 });
    timeline
        .add(values, {
            uPhase: 1,
            duration: 3500,
            easing: 'easeInOutQuad',
        })
        .add(values, { shakeAmplitude0: 0.05, duration: 2000, easing: 'easeInOutQuad' })
        .sync(beatAnimation, '+=1500')
        .sync(beatAnimation, '+=400')
        .sync(beatAnimation, '+=400')
        .add(values, { orbitMultiplier: orbitMultiplier * 8, duration: 550, easing: 'easeInOutSine' }, '+=400')
        .call(() => {
            controller.setPhysics({
                globalDamping: 0,
                stiffness: 5.1,
                massMultiplier: 0.6,
            });
        })
        .add(values, { orbitMultiplier: orbitMultiplier, duration: 250, easing: 'easeInOutSine' })
        // Start phase where mouse physics begins to work
        .add(values, { uPhase: { from: 2.8, to: 4.1 }, duration: 4500, easing: 'linear' }, '+=1000')
        .sync(cursorAnimation, '-=2000')
        .sync(afterShakeAnimation, '+=2000');

    // Sync values to GPU on each render
    timeline.onRender = () => controller.sync();

    return timeline;
};
