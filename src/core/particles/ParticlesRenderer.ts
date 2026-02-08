import { Geometry, Mesh, RenderTexture, Renderer, Shader, Texture } from 'pixi.js';
import particleVertexShader from './shaders/rendering/vert.shader';
import particleFragmentShader from './shaders/rendering/frag.shader';

/**
 * Options for creating a particles renderer.
 */
export interface ParticlesRendererOptions {
    /** PixiJS renderer */
    renderer: Renderer;
    /** Width of target render texture */
    width: number;
    /** Height of target render texture */
    height: number;
    /** Minimum particle size in UV units */
    minSize: number;
    /** Maximum particle size in UV units */
    maxSize: number;
    /** Simulation screen resolution (for converting from simulation units) */
    simResolution: { width: number; height: number };
    minAlpha?: number;
    colorLUT: Texture;
    sdfTextures: (Texture | RenderTexture)[]; // Array of 4 SDF textures for sampling in shader
    sdfResolutionMultiplier?: number; // Multiplier for correct SDF texture sampling (considering their reduced resolution)
    orbitMultiplier?: number; // Multiplier for orbital parameter calculation
    orbitOffset?: number; // Offset for orbital parameter
    noiseTexture: Texture;
    uParticleSizeMultiplier?: number; // Multiplier for particle size calculation
}

/**
 * Class for rendering particles.
 *
 * Uses instancing for efficient rendering of a large number of particles.
 * Each particle is drawn as a quad with a white radial gradient.
 * Rendering is performed on a black background.
 *
 * @example
 * ```ts
 * const renderer = new ParticlesRenderer({
 *     renderer: pixiRenderer,
 *     width: 1024,
 *     height: 1024,
 *     minSize: 0.002,
 *     maxSize: 0.01,
 *     simResolution: { width: 1920, height: 1080 },
 * });
 *
 * // In render loop
 * renderer.draw(
 *     simulator.getMovementTexture(),
 *     simulator.getAttributesTexture(),
 *     initPhase
 * );
 *
 * // Get texture for display
 * const texture = renderer.getTexture();
 * ```
 */
export class ParticlesRenderer {
    private readonly pixiRenderer: Renderer;
    private width: number;
    private height: number;

    /** Target texture for rendering */
    private targetTexture: RenderTexture;

    /** Quad geometry for instancing */
    private quadGeometry: Geometry;

    /** Shader for rendering particles */
    public particleShader: Shader;

    /** Mesh for rendering particles */
    private particleMesh: Mesh<Geometry, Shader>;

    /** Current instance count */
    private currentInstanceCount: number = 0;

    constructor(options: ParticlesRendererOptions) {
        const {
            renderer,
            width,
            height,
            minSize,
            maxSize,
            simResolution,
            minAlpha = 0,
            colorLUT,
            sdfTextures,
            sdfResolutionMultiplier = 1,
            orbitMultiplier = 1,
            orbitOffset = 0,
            noiseTexture,
            uParticleSizeMultiplier = 1,
        } = options;

        this.pixiRenderer = renderer;
        this.width = width;
        this.height = height;

        // Create target texture for rendering
        this.targetTexture = RenderTexture.create({
            width,
            height,
            format: 'rgba16float',
            scaleMode: 'linear',
        });

        // Create quad geometry for instancing
        this.quadGeometry = new Geometry({
            attributes: {
                aPosition: {
                    // prettier-ignore
                    buffer: new Float32Array([
                        -0.5, -0.5,
                         0.5, -0.5,
                         0.5,  0.5,
                        -0.5,  0.5,
                    ]),
                    format: 'float32x2',
                },
                aUV: {
                    // prettier-ignore
                    buffer: new Float32Array([
                        0, 0,
                        1, 0,
                        1, 1,
                        0, 1,
                    ]),
                    format: 'float32x2',
                },
            },
            indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
            instanceCount: 0, // Will be updated on draw call
        });

        // Create shader for rendering particles (with placeholder textures)
        this.particleShader = Shader.from({
            gl: {
                vertex: particleVertexShader,
                fragment: particleFragmentShader,
            },
            resources: {
                uMovementTexture: this.targetTexture.source, // Placeholder, will be replaced on draw
                uAttributesTexture: this.targetTexture.source, // Placeholder, will be replaced on draw
                uColorLUT: colorLUT.source,
                uNoiseTexture: noiseTexture.source,
                uSdf0: sdfTextures[0].source,
                uSdf1: sdfTextures[1].source,
                uSdf2: sdfTextures[2].source,
                uSdf3: sdfTextures[3].source,
                params: {
                    uParticleTexSize: { value: [1, 1], type: 'vec2<f32>' },
                    uResolution: { value: [width, height], type: 'vec2<f32>' },
                    uSimResolution: { value: [simResolution.width, simResolution.height], type: 'vec2<f32>' },
                    uS: { value: simResolution.width, type: 'f32' },
                    uMinSize: { value: minSize, type: 'f32' },
                    uMaxSize: { value: maxSize, type: 'f32' },
                    uPhase: { value: 0, type: 'f32' },
                    uMinAlpha: { value: minAlpha, type: 'f32' },
                    sdfResolutionMultiplier: { value: sdfResolutionMultiplier, type: 'f32' },
                    uOrbitMultiplier: { value: orbitMultiplier, type: 'f32' },
                    uOrbitOffset: { value: orbitOffset, type: 'f32' },
                    uShakeAmplitude: { value: [0, 0, 0, 0], type: 'vec4<f32>' },
                    uTime: { value: 0, type: 'f32' },
                    uParticleSizeMultiplier: { value: uParticleSizeMultiplier, type: 'f32' },
                },
            },
        });

        // Create mesh once
        this.particleMesh = new Mesh({
            geometry: this.quadGeometry,
            shader: this.particleShader,
        });

        // Set additive blending for brightness accumulation
        this.particleMesh.blendMode = 'normal';
    }

    updateOutputSize(width: number, height: number): void {
        if (this.width === width && this.height === height) {
            return; // No change
        }

        // Update dimensions
        this.width = width;
        this.height = height;

        // Recreate target texture with new size
        this.targetTexture.destroy(true);
        this.targetTexture = RenderTexture.create({
            width,
            height,
            format: 'rgba16float',
            scaleMode: 'linear',
        });

        // Update shader uniform for resolution
        this.particleShader.resources.params.uniforms.uResolution = [width, height];
    }

    /**
     * Performs particle rendering.
     *
     * @param movementTexture - Movement texture (position + velocity) from simulator
     * @param attributesTexture - Attributes texture (initPeriod, mass, orbit, size) from simulator
     */
    draw(movementTexture: RenderTexture, attributesTexture: RenderTexture, uTime: number): void {
        // Get texture dimensions from the texture itself
        const texWidth = movementTexture.width;
        const texHeight = movementTexture.height;
        const particleCount = texWidth * texHeight;

        // Update simulation textures in shader
        this.particleShader.resources.uMovementTexture = movementTexture.source;
        this.particleShader.resources.uAttributesTexture = attributesTexture.source;

        // Update uniforms
        this.particleShader.resources.params.uniforms.uParticleTexSize = [texWidth, texHeight];
        this.particleShader.resources.params.uniforms.uTime = uTime;

        // Update instance count if changed
        if (this.currentInstanceCount !== particleCount) {
            this.quadGeometry.instanceCount = particleCount;
            this.currentInstanceCount = particleCount;
        }

        // Render with clear (black background)
        this.pixiRenderer.render({
            container: this.particleMesh,
            target: this.targetTexture,
            clear: true,
            clearColor: [0, 0, 0, 1], // Black background
        });
    }

    /**
     * Returns target texture with rendered particles.
     */
    getTexture(): RenderTexture {
        return this.targetTexture;
    }

    /**
     * Returns texture dimensions.
     */
    getSize(): { width: number; height: number } {
        return { width: this.width, height: this.height };
    }

    /**
     * Releases resources.
     */
    destroy(): void {
        this.targetTexture.destroy(true);
        this.quadGeometry.destroy();
        this.particleShader.destroy();
        this.particleMesh.destroy();
    }
}
