import { Geometry, Mesh, RenderTexture, Shader, WebGLRenderer } from 'pixi.js';

/**
 * Vertex shader for fullscreen triangle.
 * Uses one large triangle instead of a quad from two triangles
 * to reduce overdraw (no diagonal seam).
 *
 * Triangle extends beyond screen bounds, but UVs correctly cover [0,1]
 */
export const fullscreenVertexShader = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;

void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vUV = aUV;
}
`;

/**
 * Fullscreen triangle geometry.
 * Three vertices form a triangle that fully covers NDC [-1,1].
 * Two vertices extend beyond screen bounds.
 *
 * Vertices in NDC:
 *   (-1, -1) -> UV (0, 1) - bottom left corner
 *   ( 3, -1) -> UV (2, 1) - beyond right edge
 *   (-1,  3) -> UV (0, -1) - beyond top edge
 *
 * UV coordinates are set so that in the visible screen area:
 *   - UV (0, 0) at top left corner
 *   - UV (1, 1) at bottom right corner
 */
export const fullscreenTriangleGeometry = new Geometry({
    attributes: {
        aPosition: {
            // prettier-ignore
            buffer: new Float32Array([
                -1, -1,
                 3, -1,
                -1,  3,
            ]),
            format: 'float32x2',
        },
        aUV: {
            // prettier-ignore
            buffer: new Float32Array([
                0,  0,
                2,  0,
                0,  2,
            ]),
            format: 'float32x2',
        },
    },
});

export type ShaderResources = NonNullable<Parameters<typeof Shader.from>[0]['resources']>;

export interface RenderToRTOptions {
    /** WebGL Renderer for rendering */
    renderer: WebGLRenderer;
    /** Render target for writing result */
    target: RenderTexture;
    /** Shader for rendering (should be created in advance for reuse) */
    shader: Shader;
    /** Whether to clear target before rendering, defaults to true */
    clear?: boolean;
}

/**
 * Renders fullscreen pass with the given shader to render target.
 */
export const renderToRT = ({ renderer, target, shader, clear = true }: RenderToRTOptions): void => {
    const mesh = new Mesh({
        geometry: fullscreenTriangleGeometry,
        shader,
    });

    // Disable blending directly via WebGL
    const gl = renderer.gl;
    gl.disable(gl.BLEND);

    renderer.render({
        container: mesh,
        target,
        clear,
    });

    // Re-enable blending for subsequent renders
    gl.enable(gl.BLEND);

    mesh.destroy();
};

export interface CreateFullscreenShaderOptions {
    /** GLSL fragment shader code */
    fragment: string;
    /** Shader resources (uniforms, textures) */
    resources?: ShaderResources;
}

/**
 * Creates a shader for use with renderToRT.
 */
export const createFullscreenShader = ({ fragment, resources }: CreateFullscreenShaderOptions): Shader => {
    return Shader.from({
        gl: {
            vertex: fullscreenVertexShader,
            fragment,
        },
        resources,
    });
};
