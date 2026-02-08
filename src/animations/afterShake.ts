import { Timeline } from 'animejs';
import { AnimationController } from './AnimationController';

export const createAfterShakeAnimation = (controller: AnimationController) => {
    const { values } = controller;

    const afterShakeAnimation = new Timeline({
        autoplay: false,
        alternate: false,
        loop: true,
        frameRate: 120,
        loopDelay: 5000,
    });
    afterShakeAnimation
        .add(values, { shakeAmplitude0: 5, duration: 1000, easing: 'easeInOutSine' })
        .add(values, { shakeAmplitude0: 0, duration: 1000, easing: 'easeInOutSine' })
        .add(values, { shakeAmplitude2: 5, duration: 500, easing: 'easeInOutSine' }, '+=2500')
        .add(values, { shakeAmplitude2: 0, duration: 500, easing: 'easeInOutSine' })
        .add(values, { shakeAmplitude1: 5, duration: 500, easing: 'easeInOutSine' }, '-=300')
        .add(values, { shakeAmplitude1: 0, duration: 500, easing: 'easeInOutSine' })
        .add(values, { shakeAmplitude3: 5, duration: 800, easing: 'easeInOutSine' }, '+=4500')
        .add(values, { shakeAmplitude3: 0, duration: 800, easing: 'easeInOutSine' });

    return afterShakeAnimation;
};
