import { Timeline } from 'animejs';
import { AnimationController } from './AnimationController';

/**
 * Creates the "beat" animation effect.
 * Particles pulse outward and shake briefly.
 *
 * @param controller - Animation controller that owns the animatable values
 */
export const createBeatAnimation = (controller: AnimationController): Timeline => {
    const { values, orbitMultiplier } = controller;

    const beatAnimation = new Timeline({ autoplay: false, alternate: false, loop: false, frameRate: 120 });
    beatAnimation
        .call(() => {
            controller.setPhysics({
                globalDamping: 19,
                stiffness: 19,
                massMultiplier: 0.1,
            });
        })
        .add(values, {
            orbitMultiplier: orbitMultiplier * 2.7,
            totalShake: 5,
            duration: 250,
            easing: 'easeInOutSine',
        })
        .add(values, { orbitMultiplier: orbitMultiplier * 1.2, duration: 70, easing: 'easeInOutSine' })
        .add(values, { orbitMultiplier: orbitMultiplier * 2.7, duration: 70, easing: 'easeInOutSine' })
        .add(values, {
            orbitMultiplier: orbitMultiplier,
            totalShake: 0,
            duration: 70,
            easing: 'easeInOutSine',
        });

    return beatAnimation;
};
