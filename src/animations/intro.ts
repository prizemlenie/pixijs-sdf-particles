import { Timeline } from 'animejs';
import { AnimationController } from './AnimationController';

export const createIntroAnimation = (controller: AnimationController) => {
    const { values } = controller;

    const introAnimation = new Timeline({
        autoplay: false,
        alternate: false,
        loop: false,
        frameRate: 120,
    });
    introAnimation
        .add(values, { gameTextAlpha: 1, duration: 1000, easing: 'linear' })
        .add(values, { gameTextAlpha: 0, duration: 1000, easing: 'linear' }, '+=1000');

    return introAnimation;
};
