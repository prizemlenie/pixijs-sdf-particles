import {
    Geometry,
    Mesh,
    RenderTexture,
    Shader,
    Texture,
    TextureSource,
    WebGLRenderer,
    type SCALE_MODE,
    type TEXTURE_FORMATS,
    type UniformData,
    type WRAP_MODE,
} from 'pixi.js';

import { fullscreenTriangleGeometry, fullscreenVertexShader } from './renderToRt';

/**
 * Mapping from PixiJS uniform types to GLSL types.
 */
const PIXI_TO_GLSL_TYPE: Record<string, string> = {
    f32: 'float',
    i32: 'int',
    'vec2<f32>': 'vec2',
    'vec3<f32>': 'vec3',
    'vec4<f32>': 'vec4',
    'vec2<i32>': 'ivec2',
    'vec3<i32>': 'ivec3',
    'vec4<i32>': 'ivec4',
    'mat2x2<f32>': 'mat2',
    'mat3x3<f32>': 'mat3',
    'mat4x4<f32>': 'mat4',
    'mat3x2<f32>': 'mat3x2',
    'mat4x2<f32>': 'mat4x2',
    'mat2x3<f32>': 'mat2x3',
    'mat4x3<f32>': 'mat4x3',
    'mat2x4<f32>': 'mat2x4',
    'mat3x4<f32>': 'mat3x4',
};

/**
 * Custom uniforms object for a compute variable.
 */
export type ComputeUniforms = Record<string, UniformData>;

/**
 * Static texture samplers (name -> texture).
 */
export type ComputeSamplers = Record<string, Texture | RenderTexture | TextureSource>;

/**
 * Options for creating a GPUComputeVariable.
 */
export interface GPUComputeVariableOptions<
    TUniforms extends ComputeUniforms = ComputeUniforms,
    TSamplers extends ComputeSamplers = ComputeSamplers,
> {
    /** PixiJS WebGL renderer */
    renderer: WebGLRenderer;
    /** Width of the computation texture */
    width: number;
    /** Height of the computation texture */
    height: number;
    /** Texture format (default: 'rgba32float') */
    format?: TEXTURE_FORMATS;
    /** Texture scale mode (default: 'nearest') */
    scaleMode?: SCALE_MODE;
    /** Texture address/wrap mode (default: 'clamp-to-edge') */
    addressMode?: WRAP_MODE;
    /** Variable name (used as sampler uniform name in dependent shaders) */
    name: string;
    /** Fragment shader source */
    fragmentShader: string;
    /** Custom uniforms (structure defined at construction time for type safety) */
    uniforms?: TUniforms;
    /** Static texture samplers (name -> texture). Can be rebound at runtime via samplers property. */
    samplers?: TSamplers;
    /**
     * Use an existing RenderTexture as the initial texture.
     * The texture will NOT be destroyed when this variable is destroyed.
     * Must match width, height, and format of this variable.
     */
    initialTexture?: RenderTexture;
}

/**
 * Self-contained GPU compute variable with ping-pong textures.
 *
 * @example
 * ```typescript
 * // --- Fragment shader (uniforms are auto-injected) ---
 * const positionShader = `
 *     precision highp float;
 *     in vec2 vUV;
 *     out vec4 fragColor;
 *
 *     void main() {
 *         // Auto-injected: resolution, texturePosition, textureVelocity, uDt
 *         vec4 pos = texture(texturePosition, vUV);
 *         vec4 vel = texture(textureVelocity, vUV);
 *         pos.xy += vel.xy * uDt;
 *         fragColor = pos;
 *     }
 * `;
 *
 * // --- Create variables with typed uniforms and static samplers ---
 * const posVar = new GPUComputeVariable({
 *     renderer,
 *     sizeX: 1024,
 *     sizeY: 1024,
 *     format: 'rgba32float',
 *     name: 'texturePosition',
 *     fragmentShader: positionShader,
 *     uniforms: {
 *         uDt: { value: 0.016, type: 'f32' },
 *     },
 *     samplers: {
 *         uNoise: noiseTexture,      // Static texture
 *         uVelocityField: velField,  // Another static texture
 *     },
 * });
 *
 * const velVar = new GPUComputeVariable({
 *     renderer,
 *     sizeX: 1024,
 *     sizeY: 1024,
 *     format: 'rgba32float',
 *     name: 'textureVelocity',
 *     fragmentShader: velocityShader,
 *     uniforms: {
 *         uDt: { value: 0.016, type: 'f32' },
 *     },
 * });
 *
 * // Fill initial data
 * posVar.fillTexture(positionData);  // Float32Array
 * velVar.fillTexture(velocityData);
 *
 * // Set dependencies
 * posVar.setDependencies([posVar, velVar]);
 * velVar.setDependencies([posVar, velVar]);
 *
 * // Initialize (compile shaders)
 * posVar.init();
 * velVar.init();
 *
 * // --- Each frame (type-safe uniform access) ---
 * posVar.uniforms.uDt.value = dt;
 * velVar.uniforms.uDt.value = dt;
 *
 * velVar.compute();
 * posVar.compute();
 *
 * // Use output texture
 * sprite.texture = posVar.getCurrentTexture();
 *
 * // --- Cleanup ---
 * velVar.destroy();
 * posVar.destroy();
 * ```
 */
export class GPUComputeVariable<
    TUniforms extends ComputeUniforms = ComputeUniforms,
    TSamplers extends ComputeSamplers = ComputeSamplers,
> {
    /** Variable name (used as sampler uniform name) */
    public readonly name: string;
    /** Computation width */
    public readonly width: number;
    /** Computation height */
    public readonly height: number;
    /** Texture format */
    public readonly format: TEXTURE_FORMATS;
    /** Texture scale mode */
    public readonly scaleMode: SCALE_MODE;
    /** Texture address/wrap mode */
    public readonly addressMode: WRAP_MODE;
    /** Custom uniforms (type-safe access to values) */
    public readonly uniforms: TUniforms;
    /** Static texture samplers (type-safe, can rebind textures at runtime) */
    public readonly samplers: TSamplers;

    /** PixiJS WebGL renderer */
    private renderer: WebGLRenderer;
    /** Fragment shader source */
    private fragmentShader: string;
    /** Ping texture */
    private pingTexture!: RenderTexture;
    /** Pong texture */
    private pongTexture!: RenderTexture;
    /** Current index: 0 = ping is current, 1 = pong is current */
    private currentIndex: number = 0;
    /** Dependencies (variables this one reads from) */
    private dependencies: GPUComputeVariable<ComputeUniforms>[] = [];
    /** Dependents (variables that read from this one) */
    private dependents: Set<GPUComputeVariable<ComputeUniforms>> = new Set();
    /** Compiled shader */
    private shader: Shader | null = null;
    /** Cached mesh for rendering */
    private mesh: Mesh<Geometry, Shader> | null = null;
    /** Whether this variable has custom uniforms */
    private hasUniforms: boolean = false;
    /** Cached reference to shader's params.uniforms for fast access */
    private paramsUniforms: Record<string, unknown> | null = null;
    /** Cached uniform keys array for fast iteration */
    private uniformKeys: string[] = [];
    /** Whether this variable has static samplers */
    private hasSamplers: boolean = false;
    /** Cached sampler keys array for fast iteration */
    private samplerKeys: string[] = [];
    /** Whether init() has been called */
    private initialized: boolean = false;
    /** Whether destroy() has been called */
    private destroyed: boolean = false;
    /** Whether textures have been destroyed */
    private texturesDestroyed: boolean = false;
    /** Whether this variable needs ping-pong (depends on itself) */
    private needsPingPong: boolean = true;
    /** Whether the ping texture is externally owned (should not be destroyed) */
    private externalPingTexture: boolean = false;

    constructor(options: GPUComputeVariableOptions<TUniforms, TSamplers>) {
        const {
            renderer,
            width,
            height,
            format = 'rgba32float',
            scaleMode = 'nearest',
            addressMode = 'clamp-to-edge',
            name,
            fragmentShader,
            uniforms,
            samplers,
        } = options;

        this.renderer = renderer;
        this.width = width;
        this.height = height;
        this.format = format;
        this.scaleMode = scaleMode;
        this.addressMode = addressMode;
        this.name = name;
        this.fragmentShader = fragmentShader;
        this.uniforms = (uniforms ?? {}) as TUniforms;
        this.samplers = (samplers ?? {}) as TSamplers;
        this.hasUniforms = uniforms !== undefined && Object.keys(uniforms).length > 0;
        this.uniformKeys = uniforms ? Object.keys(uniforms) : [];
        this.hasSamplers = samplers !== undefined && Object.keys(samplers).length > 0;
        this.samplerKeys = samplers ? Object.keys(samplers) : [];

        // Handle initial texture if provided
        if (options.initialTexture) {
            this.setInitialTexture(options.initialTexture);
        }
    }

    /**
     * Fills the texture with data from a Float32Array.
     * Must be called before init().
     * @param data - Float32Array with RGBA data (length should be sizeX * sizeY * 4)
     */
    fillTexture(data: Float32Array): void {
        if (data.length !== this.width * this.height * 4) {
            throw new Error(
                `GPUComputeVariable "${this.name}": Data length (${data.length}) does not match expected size (${this.width * this.height * 4})`
            );
        }

        if (this.initialized) {
            throw new Error(`GPUComputeVariable "${this.name}": Cannot fill texture after init().`);
        }

        // Create textures if not yet created
        this.ensureTextures();

        // Fill ping texture with initial data
        this.pingTexture.source.resource.data = data;
        this.pingTexture.source.update();

        // Copy to pong texture only if ping-pong is needed
        if (this.needsPingPong) {
            this.copyTexture(this.pingTexture, this.pongTexture);
        }
    }

    /**
     * Copies a source texture into this variable's texture.
     * Must be called before init().
     * @param source - Source texture to copy from
     */
    fillTextureFrom(source: Texture | RenderTexture): void {
        if (this.initialized) {
            throw new Error(`GPUComputeVariable "${this.name}": Cannot fill texture after init().`);
        }

        // Create textures if not yet created
        this.ensureTextures();

        // Copy source to ping texture
        this.copyTexture(source, this.pingTexture);

        // Copy to pong texture only if ping-pong is needed
        if (this.needsPingPong) {
            this.copyTexture(this.pingTexture, this.pongTexture);
        }
    }

    /**
     * Sets an existing RenderTexture as the initial texture for this variable.
     * The texture will NOT be destroyed when this variable is destroyed (you retain ownership).
     * Must be called before init().
     * @param texture - Existing RenderTexture to use. Must match width and height of this variable.
     * @throws Error if dimensions don't match or if called after init()
     */
    setInitialTexture(texture: RenderTexture): void {
        if (this.initialized) {
            throw new Error(`GPUComputeVariable "${this.name}": Cannot set initial texture after init().`);
        }

        if (texture.width !== this.width || texture.height !== this.height) {
            throw new Error(
                `GPUComputeVariable "${this.name}": Initial texture dimensions (${texture.width}x${texture.height}) ` +
                    `do not match variable dimensions (${this.width}x${this.height})`
            );
        }

        // Use the provided texture as ping texture
        this.pingTexture = texture;
        this.externalPingTexture = true;

        // Pong texture will be created later in ensureTextures if needed
    }

    /**
     * Sets the dependencies for this variable.
     * Dependencies define which other variables' textures will be available as samplers in the shader.
     * @param dependencies - Array of variables this variable depends on (can include itself)
     */
    setDependencies(dependencies: GPUComputeVariable<ComputeUniforms>[]): void {
        // Remove this from old dependencies' dependents
        for (const dep of this.dependencies) {
            dep.dependents.delete(this);
        }

        // Set new dependencies
        this.dependencies = dependencies;

        // Add this to new dependencies' dependents
        for (const dep of dependencies) {
            dep.dependents.add(this);
        }
    }

    /**
     * Initializes the variable, creating shader and mesh.
     * @throws Error if already initialized
     */
    init(): void {
        if (this.initialized) {
            throw new Error(`GPUComputeVariable "${this.name}": Already initialized.`);
        }

        // Determine if ping-pong is needed (self-dependency)
        this.needsPingPong = this.dependencies.includes(this as GPUComputeVariable<ComputeUniforms>);

        // Create textures if not yet created (fillTexture wasn't called)
        this.ensureTextures();

        this.createShader();
        this.initialized = true;
    }

    /**
     * Runs the computation: updates dependency textures, renders to target, swaps ping-pong.
     * @remarks Automatically calls init() if not already initialized.
     */
    compute(): void {
        if (!this.initialized) {
            this.init();
        }

        const shader = this.shader!;
        const deps = this.dependencies;
        const depsLen = deps.length;

        // Update dependency texture sources to current textures
        for (let i = 0; i < depsLen; i++) {
            const dep = deps[i];
            shader.resources[dep.name] = dep.getCurrentTexture().source;
        }

        // Update static samplers if variable has them (allows runtime rebinding)
        if (this.hasSamplers) {
            const samplers = this.samplers;
            const keys = this.samplerKeys;
            const keysLen = keys.length;
            for (let i = 0; i < keysLen; i++) {
                const key = keys[i];
                shader.resources[key] = samplers[key].source;
            }
        }

        // Update custom uniforms if variable has them
        if (this.hasUniforms) {
            const paramsUniforms = this.paramsUniforms!;
            const uniforms = this.uniforms;
            const keys = this.uniformKeys;
            const keysLen = keys.length;
            for (let i = 0; i < keysLen; i++) {
                const key = keys[i];
                paramsUniforms[key] = uniforms[key].value;
            }
        }

        const gl = this.renderer.gl;
        gl.disable(gl.BLEND);
        this.renderer.render({
            container: this.mesh!,
            target: this.currentIndex === 0 ? this.pongTexture : this.pingTexture,
            clear: true,
        });
        gl.enable(gl.BLEND);

        this.currentIndex = 1 - this.currentIndex;
    }

    /**
     * Gets the current output texture.
     */
    getCurrentTexture(): RenderTexture {
        return this.currentIndex === 0 ? this.pingTexture : this.pongTexture;
    }

    /**
     * Gets the alternate (previous frame) texture.
     */
    getAlternateTexture(): RenderTexture {
        return this.currentIndex === 0 ? this.pongTexture : this.pingTexture;
    }

    /**
     * Performs a single computation: initializes, computes, and destroys.
     * Useful for one-shot GPU computations where the result texture is needed after.
     * @remarks The current texture remains available after this call.
     */
    computeOnce(): void {
        this.init();
        this.compute();
        this.destroy();
    }

    /**
     * Recursively computes all dependencies first, then computes this variable.
     * Uses a visited set to avoid computing the same variable multiple times in a chain.
     * @param visited - Internal set to track already computed variables (do not pass manually)
     */
    computeChain(visited: Set<GPUComputeVariable<ComputeUniforms>> = new Set()): void {
        // Skip if already computed in this chain
        if (visited.has(this as GPUComputeVariable<ComputeUniforms>)) {
            return;
        }

        // Mark as visited before computing dependencies to handle circular dependencies
        visited.add(this as GPUComputeVariable<ComputeUniforms>);

        // First, compute all dependencies
        for (const dep of this.dependencies) {
            // Skip self-dependency (handled by ping-pong)
            if (dep === (this as GPUComputeVariable<ComputeUniforms>)) {
                continue;
            }
            dep.computeChain(visited);
        }

        // Then compute this variable
        this.compute();
    }

    /**
     * Checks if this variable has been destroyed.
     */
    isDestroyed(): boolean {
        return this.destroyed;
    }

    /**
     * Destroys resources with reference counting for shared textures.
     */
    destroy(): void {
        if (this.destroyed) {
            return;
        }

        this.destroyed = true;

        // Destroy mesh and shader immediately
        if (this.mesh) {
            this.mesh.destroy();
            this.mesh = null;
        }

        if (this.shader) {
            this.shader.destroy();
            this.shader = null;
        }

        // Remove this from all dependencies' dependents sets
        for (const dep of this.dependencies) {
            dep.dependents.delete(this);

            // If dependency is destroyed and has no more dependents, destroy its textures
            if (dep.destroyed && !dep.texturesDestroyed && dep.dependents.size === 0) {
                dep.destroyTextures();
            }
        }

        // If no one depends on us anymore, destroy our textures
        if (this.dependents.size === 0) {
            this.destroyTextures();
        }

        this.dependencies = [];
        this.initialized = false;
    }

    /**
     * Creates a new RenderTexture with the variable's format.
     */
    private createTexture(): RenderTexture {
        return RenderTexture.create({
            width: this.width,
            height: this.height,
            format: this.format,
            scaleMode: this.scaleMode,
            addressMode: this.addressMode,
            antialias: false,
        });
    }

    /**
     * Destroys the ping-pong textures, keeping the current texture alive.
     * External textures (set via setInitialTexture) are never destroyed.
     */
    private destroyTextures(): void {
        if (this.texturesDestroyed) {
            return;
        }

        // Only destroy the alternate texture, keep current texture alive for external use
        if (this.needsPingPong) {
            const alternateTexture = this.currentIndex === 0 ? this.pongTexture : this.pingTexture;
            // Don't destroy if it's the external ping texture
            const isExternalTexture = alternateTexture === this.pingTexture && this.externalPingTexture;
            if (!isExternalTexture) {
                alternateTexture.destroy(true);
            }
        }
        this.texturesDestroyed = true;
    }

    /**
     * Creates textures if not already created.
     */
    private ensureTextures(): void {
        // Create ping texture if not already set (either created or external)
        if (!this.pingTexture) {
            this.pingTexture = this.createTexture();
        }

        // Create pong texture if not already set
        if (!this.pongTexture) {
            // Create separate pong texture only if ping-pong is needed
            this.pongTexture = this.needsPingPong ? this.createTexture() : this.pingTexture;
        }
    }

    /**
     * Injects code into shader, respecting #version directive.
     */
    private injectShaderCode(shader: string, codeToInject: string): string {
        const versionRegex = /^(\s*#version[^\n]*\n)/;
        const match = shader.match(versionRegex);

        if (match) {
            return match[1] + codeToInject + shader.slice(match[0].length);
        }

        return codeToInject + shader;
    }

    /**
     * Checks if a uniform is already declared in the shader source.
     * @param shaderSource - The shader source code
     * @param uniformName - The name of the uniform to check
     * @returns true if the uniform is already declared
     */
    private isUniformDeclared(shaderSource: string, uniformName: string): boolean {
        // Match: uniform <type> <name> with optional array suffix and semicolon
        // Handles: uniform sampler2D myTex; uniform float myFloat; uniform vec3 myVec[10];
        const regex = new RegExp(`\\buniform\\s+\\w+\\s+${uniformName}\\s*(\\[[^\\]]*\\])?\\s*;`, 'm');
        return regex.test(shaderSource);
    }

    /**
     * Creates the shader with auto-injected resolution, samplers, and uniforms.
     * @throws Error if shader creation fails
     */
    private createShader(): void {
        // Build resolution define
        const resolutionDefine = `#define resolution vec2(${this.width.toFixed(1)}, ${this.height.toFixed(1)})\n`;

        // Build sampler declarations for dependencies (skip if already declared)
        let samplerDeclarations = '';
        for (const dep of this.dependencies) {
            if (!this.isUniformDeclared(this.fragmentShader, dep.name)) {
                samplerDeclarations += `uniform sampler2D ${dep.name};\n`;
            }
        }

        // Build sampler declarations for static textures (skip if already declared)
        for (const name in this.samplers) {
            if (!this.isUniformDeclared(this.fragmentShader, name)) {
                samplerDeclarations += `uniform sampler2D ${name};\n`;
            }
        }

        // Build custom uniform declarations (skip if already declared)
        let uniformDeclarations = '';
        for (const key in this.uniforms) {
            if (this.isUniformDeclared(this.fragmentShader, key)) {
                continue;
            }
            const uniformData = this.uniforms[key];
            const glslType = PIXI_TO_GLSL_TYPE[uniformData.type];
            if (!glslType) {
                throw new Error(
                    `GPUComputeVariable "${this.name}": Unknown uniform type "${uniformData.type}" for "${key}"`
                );
            }
            uniformDeclarations += `uniform ${glslType} ${key};\n`;
        }

        // Inject all declarations into fragment shader
        const codeToInject = resolutionDefine + samplerDeclarations + uniformDeclarations;
        const fullFragmentShader = this.injectShaderCode(this.fragmentShader, codeToInject);

        // Build shader resources
        const resources: Record<string, TextureSource | { [key: string]: UniformData }> = {};

        // Add dependency textures as resources
        for (const dep of this.dependencies) {
            resources[dep.name] = dep.getCurrentTexture().source;
        }

        // Add static sampler textures as resources
        for (const name in this.samplers) {
            resources[name] = this.samplers[name].source;
        }

        // Add custom uniforms under 'params' group
        if (this.hasUniforms) {
            resources.params = { ...this.uniforms };
        }

        try {
            this.shader = Shader.from({
                gl: {
                    vertex: fullscreenVertexShader,
                    fragment: fullFragmentShader,
                },
                resources,
            });

            this.mesh = new Mesh({
                geometry: fullscreenTriangleGeometry,
                shader: this.shader,
            });

            // Cache paramsUniforms reference for fast access in compute()
            if (this.hasUniforms) {
                this.paramsUniforms = (this.shader.resources.params as { uniforms: Record<string, unknown> }).uniforms;
            }
        } catch (e) {
            throw new Error(`GPUComputeVariable "${this.name}": Error creating shader: ${e}`);
        }
    }

    /**
     * Copies one texture to another.
     */
    private copyTexture(source: Texture | RenderTexture, target: RenderTexture): void {
        const copyShader = Shader.from({
            gl: {
                vertex: fullscreenVertexShader,
                fragment: /* glsl */ `
                    precision highp float;
                    in vec2 vUV;
                    uniform sampler2D uSource;

                    void main() {
                        finalColor = texture(uSource, vUV);
                    }
                `,
            },
            resources: {
                uSource: source.source,
            },
        });

        const mesh = new Mesh({
            geometry: fullscreenTriangleGeometry,
            shader: copyShader,
        });

        const gl = this.renderer.gl;
        gl.disable(gl.BLEND);

        this.renderer.render({
            container: mesh,
            target,
            clear: false,
        });

        gl.enable(gl.BLEND);

        mesh.destroy();
        copyShader.destroy();
    }
}
