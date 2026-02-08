import { utils, Timeline, animate } from 'animejs';
import { AnimationController } from './AnimationController';

/**
 * Creates the cursor intro animation.
 * Shows a fake cursor moving across the screen to demonstrate mouse interaction.
 *
 * @param controller - Animation controller that owns the animatable values
 */
export const createCursorAnimation = (controller: AnimationController): Timeline => {
    const { values, pxToSim } = controller;

    const [$bg] = utils.$('#cursor-bg');
    const [$container] = utils.$('#cursor-container');
    const [$img] = utils.$('#cursor-img');

    const bgTimeline = new Timeline({ autoplay: false, alternate: false, loop: 2, loopDelay: 100 });
    bgTimeline
        .add($bg, { scale: { to: 0.7, from: 0 }, opacity: 1, duration: 400, easing: 'easeOutSine' })
        .add($bg, { borderWidth: 0, width: 160, height: 160, duration: 200, easing: 'easeOutSine' }, '-=200')
        .call(() => {
            $bg.style.opacity = '0';
            $bg.style.borderWidth = '80px';
            $bg.style.width = '0';
            $bg.style.height = '0';
        });

    const cursorAnimation = new Timeline({ autoplay: false, alternate: false, loop: false });
    cursorAnimation
        // Устанавливаем начальную позицию контейнера перед началом анимации
        .call(() => {
            const startX = window.innerWidth - 200;
            const startY = window.innerHeight - 200;
            utils.set($container, { translateX: startX, translateY: startY });
        })
        .sync(bgTimeline)
        .add($img, { opacity: 1, duration: 500, easing: 'easeOutSine' }, '-=700')
        // Инициализация координат и запуск анимации движения непосредственно перед началом
        .call(() => {
            const startX = window.innerWidth - 200;
            const startY = window.innerHeight - 200;

            const simulationStartMousePos = pxToSim(startX, startY);
            const simulationEndMousePos = pxToSim(100, 100);

            // Устанавливаем начальные значения
            utils.set($container, { translateX: startX, translateY: startY });
            values.mousePos.x = simulationStartMousePos[0];
            values.mousePos.y = simulationStartMousePos[1];

            // Запускаем анимации движения
            animate($container, {
                translateX: { from: startX, to: 100 },
                translateY: { from: startY, to: 100 },
                duration: 3000,
                easing: 'easeOutSine',
            });

            animate(values.mousePos, {
                x: { from: simulationStartMousePos[0], to: simulationEndMousePos[0] },
                y: { from: simulationStartMousePos[1], to: simulationEndMousePos[1] },
                duration: 3000,
                easing: 'easeOutSine',
            });
        }, '+=200')
        .call(() => {
            values.syncMousePos = false;
        }, '+=3000')
        .add($container, {
            opacity: 0,
            duration: 500,
            easing: 'easeOutSine',
        });

    return cursorAnimation;
};
