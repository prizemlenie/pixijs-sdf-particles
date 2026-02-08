import { Text } from 'pixi.js';
import { GPUComputeVariable } from '../utils/GPUComputeVariable';
import { ParticlesRenderer } from '../core/particles/ParticlesRenderer';
import { createParticlesSimulationRunner } from '../core/particles/particlesSimulation';

/**
 * Animatable values that can be tweened by anime.js.
 * These values are synced to GPU uniforms on each frame.
 */
export interface AnimatableValues {
    uPhase: number;
    stiffness: number;
    massMultiplier: number;
    orbitMultiplier: number;
    globalDamping: number;
    shakeAmplitude0: number;
    shakeAmplitude1: number;
    shakeAmplitude2: number;
    shakeAmplitude3: number;
    mousePos: { x: number; y: number };
    syncMousePos: boolean;
    totalShake: number;
    gameTextAlpha: number;
}

export type SimulationRunner = ReturnType<typeof createParticlesSimulationRunner>;

/**
 * Configuration for AnimationController.
 */
export interface AnimationControllerConfig {
    simulation: SimulationRunner;
    renderer: ParticlesRenderer;
    mouseBounce: GPUComputeVariable;
    orbitMultiplier: number;
    pxToSim: (x: number, y: number) => [number, number];
    gameText: Text;
}

/**
 * Encapsulates animation state and synchronization with GPU uniforms.
 *
 * @example
 * ```typescript
 * const controller = new AnimationController({
 *     simulation,
 *     renderer,
 *     mouseBounce,
 *     orbitMultiplier: 0.035,
 *     pxToSim: ctx.pxToSim,
 * });
 *
 * // Use in anime.js timeline
 * timeline.add(controller.values, { uPhase: 1, duration: 1000 });
 *
 * // Sync on each frame
 * timeline.onRender = () => controller.sync();
 * ```
 */
export class AnimationController {
    /**
     * Animatable values object for use with anime.js.
     * Mutated by anime.js during tweens.
     */
    public readonly values: AnimatableValues;

    /**
     * Orbit multiplier, used for relative animations.
     */
    public readonly orbitMultiplier: number;

    /**
     * Coordinate conversion function.
     */
    public readonly pxToSim: (x: number, y: number) => [number, number];

    private readonly simulation: SimulationRunner;
    private readonly renderer: ParticlesRenderer;
    private readonly mouseBounce: GPUComputeVariable;
    private readonly gameText: Text;

    constructor(config: AnimationControllerConfig) {
        this.simulation = config.simulation;
        this.renderer = config.renderer;
        this.mouseBounce = config.mouseBounce;
        this.orbitMultiplier = config.orbitMultiplier;
        this.pxToSim = config.pxToSim;
        this.gameText = config.gameText;

        // Initialize values from current simulation state
        this.values = {
            uPhase: 0,
            stiffness: config.simulation.uniforms.stiffness.value,
            massMultiplier: config.simulation.uniforms.massMultiplier.value,
            orbitMultiplier: config.simulation.uniforms.orbitMultiplier.value,
            globalDamping: config.simulation.uniforms.globalDamping.value,
            shakeAmplitude0: 0,
            shakeAmplitude1: 0,
            shakeAmplitude2: 0,
            shakeAmplitude3: 0,
            mousePos: { x: 10000, y: 10000 },
            syncMousePos: true,
            totalShake: 0,
            gameTextAlpha: config.gameText.alpha,
        };
    }

    /**
     * Synchronizes animated values to GPU uniforms.
     * Should be called on every frame during animation.
     */
    sync(): void {
        const { simulation, renderer, mouseBounce, values } = this;

        // Sync simulation uniforms
        simulation.uniforms.uPhase.value = values.uPhase;
        simulation.uniforms.stiffness.value = values.stiffness;
        simulation.uniforms.massMultiplier.value = values.massMultiplier;
        simulation.uniforms.orbitMultiplier.value = values.orbitMultiplier;
        simulation.uniforms.globalDamping.value = values.globalDamping;

        // Sync renderer uniforms
        renderer.particleShader.resources.params.uniforms.uShakeAmplitude = [
            values.shakeAmplitude0 / 100 + values.totalShake / 100,
            values.shakeAmplitude1 / 100 + values.totalShake / 100,
            values.shakeAmplitude2 / 100 + values.totalShake / 100,
            values.shakeAmplitude3 / 100 + values.totalShake / 100,
        ];

        renderer.particleShader.resources.params.uniforms.uPhase = values.uPhase;

        // Sync mouse bounce uniforms
        mouseBounce.uniforms.uPhase.value = values.uPhase;
        if (values.syncMousePos) {
            mouseBounce.uniforms.uMousePos.value = [values.mousePos.x, values.mousePos.y];
        }

        // Sync game text alpha
        this.gameText.alpha = values.gameTextAlpha;
    }

    /**
     * Sets physics parameters directly (for use in .call() callbacks).
     */
    setPhysics(
        params: Partial<
            Pick<
                AnimatableValues,
                | 'globalDamping'
                | 'stiffness'
                | 'massMultiplier'
                | 'shakeAmplitude0'
                | 'shakeAmplitude1'
                | 'shakeAmplitude2'
                | 'shakeAmplitude3'
            >
        >
    ): void {
        if (params.globalDamping !== undefined) this.values.globalDamping = params.globalDamping;
        if (params.stiffness !== undefined) this.values.stiffness = params.stiffness;
        if (params.massMultiplier !== undefined) this.values.massMultiplier = params.massMultiplier;
        if (params.shakeAmplitude0 !== undefined) this.values.shakeAmplitude0 = params.shakeAmplitude0;
        if (params.shakeAmplitude1 !== undefined) this.values.shakeAmplitude1 = params.shakeAmplitude1;
        if (params.shakeAmplitude2 !== undefined) this.values.shakeAmplitude2 = params.shakeAmplitude2;
        if (params.shakeAmplitude3 !== undefined) this.values.shakeAmplitude3 = params.shakeAmplitude3;
    }
}
