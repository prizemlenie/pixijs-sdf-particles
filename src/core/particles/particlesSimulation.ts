import { RenderTexture, Texture, WebGLRenderer } from 'pixi.js';
import { createFullscreenShader, renderToRT } from '../../utils/renderToRt';
import { GPUComputeVariable } from '../../utils/GPUComputeVariable';
import initMovementShader from './shaders/simulation/initMovement.shader';
import initAttributesShader from './shaders/simulation/initAttributes.shader';
import simulationFragmentShader from './shaders/simulation/simulation.shader';
import { getFloatTextureFormat } from '../../utils/floatTextureFormat';

/**
 * Options for particle simulation initialization.
 */
export interface ParticlesSimulationOptions {
    /** PixiJS renderer */
    renderer: WebGLRenderer;
    /** Number of particles */
    particleCount: number;
    /** Screen resolution (for coordinate conversion) */
    resolution: { width: number; height: number };
}

/**
 * Result of particle simulation initialization.
 */
export interface ParticlesSimulationResult {
    /** Movement texture: position (xy) + velocity (zw) */
    movementTexture: RenderTexture;
    /** Attributes texture: start time (r), end time (g), orbit (b), mass (a) */
    attributesTexture: RenderTexture;
    /** Texture size for storing particles */
    textureSize: { width: number; height: number };
    /** Number of particles */
    particleCount: number;
    /** Releases resources */
    destroy: () => void;
}

/**
 * Calculates optimal texture dimensions for given particle count.
 *
 * Aims for a square power-of-two texture for optimal GPU performance.
 */
export function calculateOptimalTextureSize(particleCount: number): { width: number; height: number } {
    // Find minimum power of two whose square >= particleCount
    const minSide = Math.ceil(Math.sqrt(particleCount));
    const size = Math.pow(2, Math.ceil(Math.log2(minSide)));

    return { width: size, height: size };
}

/**
 * Creates GPU particle simulator.
 *
 * Stores particle state in two textures:
 * 1. Movement texture: position (xy) + velocity (zw) in simulation units
 * 2. Attributes texture: initialization start time (r), initialization end time (g), orbit (b), mass (a)
 *
 * All values in attributes texture are normalized to range 0..1
 */
export function initParticlesSimulation(options: ParticlesSimulationOptions): ParticlesSimulationResult {
    const { renderer, particleCount, resolution } = options;
    const textureSize = calculateOptimalTextureSize(particleCount);
    const { width, height } = textureSize;

    // Create textures
    const movementTexture = RenderTexture.create({
        width,
        height,
        format: getFloatTextureFormat(renderer),
        scaleMode: 'nearest',
    });

    const attributesTexture = RenderTexture.create({
        width,
        height,
        format: getFloatTextureFormat(renderer),
        scaleMode: 'nearest',
    });

    // Initialize movement texture
    const movementShader = createFullscreenShader({
        fragment: initMovementShader,
        resources: {
            uniforms: {
                uSimResolution: { value: [resolution.width, resolution.height], type: 'vec2<f32>' },
                uS: { value: resolution.width, type: 'f32' },
                uTexSize: { value: [width, height], type: 'vec2<f32>' },
            },
        },
    });

    renderToRT({
        renderer,
        target: movementTexture,
        shader: movementShader,
        clear: true,
    });

    movementShader.destroy();

    // Initialize attributes texture
    const attributesShader = createFullscreenShader({
        fragment: initAttributesShader,
        resources: {
            uniforms: {
                uTexSize: { value: [width, height], type: 'vec2<f32>' },
                uTotalParticles: { value: width * height, type: 'f32' },
            },
        },
    });

    renderToRT({
        renderer,
        target: attributesTexture,
        shader: attributesShader,
        clear: true,
    });

    attributesShader.destroy();

    const destroy = () => {
        movementTexture.destroy(true);
        attributesTexture.destroy(true);
    };

    return {
        movementTexture,
        attributesTexture,
        textureSize,
        particleCount,
        destroy,
    };
}

/**
 * Options for creating particle simulation runner.
 */
export interface ParticlesSimulationRunnerOptions {
    /** PixiJS renderer */
    renderer: WebGLRenderer;
    /** Particle mass multiplier */
    massMultiplier: number;
    /** Orbit distance multiplier */
    orbitMultiplier: number;
    /** Array of 4 SDF textures (gradient.xy, distance.z) */
    sdfTextures: Texture[];
    /** Movement texture */
    movementTexture: RenderTexture;
    /** Attributes texture */
    attributesTexture: RenderTexture;
    /** SDF texture resolution multiplier (SDF resolution to simulation resolution ratio) */
    sdfResolutionMultiplier: number;
    /** Orbit offset */
    orbitOffset: number;
    /** Screen resolution */
    resolution: { width: number; height: number };
    /** Particle texture size */
    textureSize: { width: number; height: number };
    /** Spring stiffness (default 50.0) */
    stiffness?: number;
    /** Damping coefficient (default 10.0) */
    damping?: number;
    /** Global damping (default 1.0) */
    globalDamping?: number;
    tangentialDamping?: number;
    noiseTexture: Texture;
    tangentialNoiseAmplitude?: number;
}

/**
 * Creates GPUComputeVariable for particle simulation with SDF-based spring-damper physics.
 *
 * Particles are attracted to their orbits (SDF-distances) using spring force.
 * Damping acts along the SDF gradient.
 * Forces are applied only to particles whose initialization end time <= initPhase.
 *
 * @example
 * ```typescript
 * const simulation = createParticlesSimulationRunner({
 *     renderer,
 *     massMultiplier: 1.0,
 *     orbitMultiplier: 0.1,
 *     sdfTextures: [sdf0, sdf1, sdf2, sdf3],
 *     movementTexture: simulator.getMovementTexture()!,
 *     attributesTexture: simulator.getAttributesTexture()!,
 *     sdfResolutionMultiplier: 0.5,
 *     orbitOffset: 0.0,
 *     resolution: { width: 1920, height: 1080 },
 *     textureSize: simulator.textureSize,
 * });
 *
 * // Every frame:
 * simulation.uniforms.dt.value = deltaTimeMs;
 * simulation.uniforms.initPhase.value = currentPhase;
 * simulation.compute();
 *
 * // Get texture for rendering:
 * const texture = simulation.getCurrentTexture();
 * ```
 */
export function createParticlesSimulationRunner(options: ParticlesSimulationRunnerOptions) {
    const {
        renderer,
        massMultiplier,
        orbitMultiplier,
        sdfTextures,
        movementTexture,
        attributesTexture,
        sdfResolutionMultiplier,
        orbitOffset,
        textureSize,
        stiffness = 2.5,
        damping = 1.5,
        globalDamping = 0.0,
        tangentialDamping = 0.1,
        noiseTexture,
        tangentialNoiseAmplitude = 0.1,
        resolution,
    } = options;

    const simulation = new GPUComputeVariable({
        renderer,
        name: 'uParticlesState',
        width: textureSize.width,
        height: textureSize.height,
        format: getFloatTextureFormat(renderer),
        scaleMode: 'nearest',
        fragmentShader: simulationFragmentShader,
        uniforms: {
            dt: { value: 0, type: 'f32' },
            uPhase: { value: 0, type: 'f32' },
            stiffness: { value: stiffness, type: 'f32' },
            damping: { value: damping, type: 'f32' },
            globalDamping: { value: globalDamping, type: 'f32' },
            massMultiplier: { value: massMultiplier, type: 'f32' },
            orbitMultiplier: { value: orbitMultiplier, type: 'f32' },
            orbitOffset: { value: orbitOffset, type: 'f32' },
            sdfResolutionMultiplier: { value: sdfResolutionMultiplier, type: 'f32' },
            uSimResolution: { value: [resolution.width, resolution.height], type: 'vec2<f32>' },
            uS: { value: resolution.width, type: 'f32' },
            uTexSize: { value: [textureSize.width, textureSize.height], type: 'vec2<f32>' },
            uTangentialDamping: { value: tangentialDamping, type: 'f32' },
            tangentialNoiseAmplitude: { value: tangentialNoiseAmplitude, type: 'f32' },
        },
        samplers: {
            uNoise: noiseTexture,
            uAttributes: attributesTexture,
            uSdf0: sdfTextures[0],
            uSdf1: sdfTextures[1],
            uSdf2: sdfTextures[2],
            uSdf3: sdfTextures[3],
        },
    });

    // Copy initial state from movementTexture
    simulation.setInitialTexture(movementTexture);

    // Set dependency on itself for ping-pong
    simulation.setDependencies([simulation]);

    // Initialize
    simulation.init();

    return simulation;
}
