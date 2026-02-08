import { Application, Assets, Sprite, WebGLRenderer, Text, TextStyle } from 'pixi.js';

import { generateTextMask } from './core/sdf/generateTextMask';
import { generateSDFTex } from './core/sdf/generateSDFTex';
import { createParticlesSimulationRunner, initParticlesSimulation } from './core/particles/particlesSimulation';
import { ParticlesRenderer } from './core/particles/ParticlesRenderer';
import { CONFIG, createAppContext } from './context';
import { createMouseBounceRunner } from './core/particles/mouseBounce';
import { AnimationController, createMainTimeline } from './animations';
import { debounce } from './utils/debounce';

const fpsCounter = document.getElementById('fps') as HTMLDivElement;

(async () => {
    const app = new Application();

    const noiseTexture = await Assets.load('/assets/perlin_color.png');
    noiseTexture.source.addressMode = 'repeat';
    const colorLUT = await Assets.load('/assets/color_lut.png');

    await app.init({ background: '#000000', resizeTo: window, preference: 'webgl' });
    document.getElementById('pixi-container')!.appendChild(app.canvas);

    const renderer = app.renderer as WebGLRenderer;

    const ctx = createAppContext(app);
    const { baseResolution, pxToSim } = ctx;

    /* INIT SDF TEXTURES */

    const {
        textures: textMasks,
        fontSize,
        letterSpacing,
    } = await generateTextMask({
        text: 'BEAT',
        resolution: {
            width: baseResolution.width * CONFIG.sdfResolutionFactor,
            height: baseResolution.height * CONFIG.sdfResolutionFactor,
        },
        textWidth: baseResolution.width * 0.8 * CONFIG.sdfResolutionFactor,
        spacingPercent: 0.15,
    });

    const sdf = textMasks.map((mask) =>
        generateSDFTex({
            texture: mask,
            renderer,
        })
    );

    /* GAME TEXT SPRITE */
    await document.fonts.ready;
    const gameText = new Text({
        text: 'GAME',
        style: new TextStyle({
            fontFamily: 'LatoThin',
            fontSize: fontSize / CONFIG.sdfResolutionFactor,
            fill: 'white',
            letterSpacing: letterSpacing / CONFIG.sdfResolutionFactor,
        }),
        alpha: 0,
    });
    gameText.alpha = 0;
    gameText.anchor.set(0.5);
    gameText.position.set(app.screen.width / 2, app.screen.height / 2);

    /* PARTICLES SIMULATION */

    const particlesData = initParticlesSimulation({
        renderer,
        particleCount: CONFIG.particlesCount,
        resolution: baseResolution,
    });

    const simulation = createParticlesSimulationRunner({
        renderer,
        massMultiplier: 0.6,
        orbitMultiplier: CONFIG.orbitMultiplier,
        sdfTextures: sdf,
        movementTexture: particlesData.movementTexture,
        attributesTexture: particlesData.attributesTexture,
        sdfResolutionMultiplier: CONFIG.sdfResolutionFactor,
        orbitOffset: 0.1,
        damping: 0.8,
        stiffness: 3.1,
        resolution: baseResolution,
        textureSize: particlesData.textureSize,
        tangentialDamping: 1.1,
        noiseTexture,
        tangentialNoiseAmplitude: 5,
    });

    const mouseBounceRunner = createMouseBounceRunner({
        renderer,
        attributesTexture: particlesData.attributesTexture,
        simulation,
    });

    const particlesRenderer = new ParticlesRenderer({
        renderer,
        width: app.screen.width,
        height: app.screen.height,
        minSize: 0.006,
        maxSize: 0.011,
        simResolution: baseResolution,
        minAlpha: 0.5,
        colorLUT,
        sdfTextures: sdf,
        sdfResolutionMultiplier: CONFIG.sdfResolutionFactor,
        orbitMultiplier: CONFIG.orbitMultiplier,
        orbitOffset: 0.7,
        noiseTexture,
        uParticleSizeMultiplier: 0.56,
    });

    particlesRenderer.draw(particlesData.movementTexture, particlesData.attributesTexture, 0);
    const particlesSprite = new Sprite(particlesRenderer.getTexture());
    particlesSprite.anchor.set(0.5);
    particlesSprite.position.set(app.screen.width / 2, app.screen.height / 2);
    app.stage.addChild(particlesSprite);
    app.stage.addChild(gameText);

    const updateResolution = debounce(() => {
        const scale = app.screen.width / baseResolution.width;
        const height = baseResolution.height * scale;
        particlesRenderer.updateOutputSize(app.screen.width, height);
        particlesSprite.texture = particlesRenderer.getTexture();
        particlesSprite.scale.set(1);
        particlesSprite.position.set(app.screen.width / 2, app.screen.height / 2);
    }, 1000);

    const updateGameTextSize = () => {
        const scale = app.screen.width / baseResolution.width;
        gameText.scale.set(scale);
        gameText.position.set(app.screen.width / 2, app.screen.height / 2);
    };

    updateGameTextSize();

    window.addEventListener('resize', () => {
        const scale = app.screen.width / particlesRenderer.getTexture().width;
        particlesSprite.scale.set(scale);
        particlesSprite.position.set(app.screen.width / 2, app.screen.height / 2);
        updateGameTextSize();
        updateResolution();
    });

    /* ANIMATIONS n INTERACTIONS */

    const animationController = new AnimationController({
        simulation,
        renderer: particlesRenderer,
        mouseBounce: mouseBounceRunner,
        orbitMultiplier: CONFIG.orbitMultiplier,
        pxToSim,
        gameText,
    });

    document.addEventListener('pointermove', (event) => {
        mouseBounceRunner.uniforms.uMousePos.value = pxToSim(event.clientX, event.clientY);
    });

    document.addEventListener('touchend', () => {
        mouseBounceRunner.uniforms.uMousePos.value = [100, 100];
    });

    createMainTimeline(animationController).play();

    let fpsSum = 0;
    let fpsCount = 0;

    setInterval(() => {
        if (fpsCount > 0) {
            fpsCounter.innerText = `FPS: ${Math.round(fpsSum / fpsCount)}`;
            fpsSum = 0;
            fpsCount = 0;
        }
    }, 1000);

    app.ticker.add((time) => {
        fpsSum += app.ticker.FPS;
        fpsCount++;
        simulation.uniforms.dt.value = time.deltaMS;
        mouseBounceRunner.uniforms.dt.value = time.deltaMS;
        mouseBounceRunner.computeChain();

        particlesRenderer.draw(
            mouseBounceRunner.getCurrentTexture(),
            particlesData.attributesTexture,
            performance.now()
        );
    });
})();
