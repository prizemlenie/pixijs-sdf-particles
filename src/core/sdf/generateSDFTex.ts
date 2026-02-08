import { RenderTexture, Texture, WebGLRenderer } from 'pixi.js';

import { GPUComputeVariable } from '../../utils/GPUComputeVariable';

/**
 * Fragment shader for JFA (combines init and step)
 * On first pass (uFirst=1) finds seeds by .r of source texture
 * On subsequent passes propagates seed coordinates
 */
const jfaFragment = /* glsl */ `

#define MAX_DIST 1e10

in vec2 vUV;
out vec4 finalColor;

void main() {
    bool first = uFirst > 0.5;
    
    if (first) {
        vec4 currentValue = texture(uTex, vUV);
        if (currentValue.r >= 0.5) {
            finalColor = vec4(vUV / uTexelSize, 1.0, 1.0);
        } else {
            finalColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
        return;
    } else {
        finalColor = vec4(0.0, 1.0, 0.0, 1.0);
    }
    
    vec2 bestSeed = vec2(0.0);
    float bestDist = MAX_DIST;
    
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            vec2 offset = vec2(float(dx), float(dy)) * uStepSize;
            vec2 sampleCoord = vUV + offset * uTexelSize;
            
            if (sampleCoord != clamp(sampleCoord, 0.0, 1.0)) continue;
            
            vec4 sampleValue = texture(jfa, sampleCoord);
            
            if (sampleValue.b > 0.5) {
                float dist = distance(vUV / uTexelSize, sampleValue.xy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestSeed = sampleValue.xy;
                }
            }
        }
    }
    
    if (bestDist < MAX_DIST - 1.0) {
        finalColor = vec4(bestSeed, 1.0, bestDist);
    } else {
        finalColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
}
`;

/**
 * Fragment shader for SDF finalization (unsigned - positive distances only)
 * Converts seed coordinates to gradient (xy) and distance (w)
 */
const jfaFinalizeUnsignedFragment = /* glsl */ `

#define MAX_DIST 1e10
#define EPSILON 0.0001

in vec2 vUV;
out vec4 finalColor;

void main() {
    vec4 encoded = texture(jfa, vUV);
    
    vec2 currentPos = vUV / uTexelSize;
    vec2 gradient = vec2(0.0);
    float dist = MAX_DIST; // maximum distance by default
    
    if (encoded.b > 0.5) {
        vec2 seedPos = encoded.rg;
        vec2 diff = currentPos - seedPos;
        dist = length(diff);
        
        // Normalized gradient (direction from seed to current point)
        if (dist > EPSILON) {
            gradient = diff / dist;
        }
    }
    
    finalColor = vec4(gradient, dist, 0.0);
}
`;

/**
 * Fragment shader for converting unsigned SDF to signed SDF
 * Based on mask, multiplies distances by -1 inside the shape
 * Preserves gradient (xy) and distance (w)
 */
const applySignFragment = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;

void main() {
    vec4 sdfData = texture(uSDF, vUV);
    vec2 gradient = sdfData.xy;
    float dist = sdfData.z;
    float maskValue = texture(uMask, vUV).r;
    
    // Inside shape - negative distance and inverted gradient
    if (maskValue > 0.5) {
        dist = -dist;
        gradient = -gradient;
    }
    
    finalColor = vec4(gradient, dist, 0.0);
}
`;

export interface GenerateSDFOptions {
    /** Input texture (seed pixels determined by alpha >= 1.0) */
    texture: Texture;
    /** Renderer for rendering */
    renderer: WebGLRenderer;
}

/**
 * Generates SDF (Signed Distance Field) texture from input texture
 * using Jump Flooding Algorithm (JFA).
 *
 * Seed pixels are determined by alpha >= 1.0 in the input texture.
 *
 * JFA works in several passes:
 * 1. Initialization: seed pixels receive their coordinates
 * 2. JFA passes: on each pass stepSize is halved (N/2, N/4, ..., 1)
 * 3. Finalization: seed coordinates are converted to distance
 *
 * @param options - Parameters for SDF generation
 * @returns Texture with SDF (unsigned, values 0-1)
 */
export function generateSDFTex(options: GenerateSDFOptions): RenderTexture {
    const { texture, renderer } = options;

    const width = texture.width;
    const height = texture.height;

    // --- JFA passes (init combined with first pass) ---
    // Calculate number of passes
    const numPasses = Math.ceil(Math.log2(Math.max(width, height)));

    const texelSize = [1 / width, 1 / height];

    const jfaComputeVar = new GPUComputeVariable({
        renderer,
        width,
        height,
        name: 'jfa',
        fragmentShader: jfaFragment,
        uniforms: {
            uTexelSize: { value: texelSize, type: 'vec2<f32>' },
            uStepSize: { value: 1, type: 'f32' },
            uFirst: { value: 1, type: 'f32' },
        },
        samplers: {
            uTex: texture,
        },
        format: 'rgba16float',
        scaleMode: 'linear',
    });
    jfaComputeVar.fillTextureFrom(texture);
    jfaComputeVar.setDependencies([jfaComputeVar]);
    jfaComputeVar.compute();

    // --- JFA passes (uFirst=0) ---
    jfaComputeVar.uniforms.uFirst.value = 0.0;

    for (let i = 0; i < numPasses; i++) {
        const stepSize = Math.pow(2, numPasses - 1 - i);

        jfaComputeVar.uniforms.uStepSize.value = stepSize;
        jfaComputeVar.compute();
    }

    jfaComputeVar.destroy();

    // --- SDF finalization ---

    const finalization = new GPUComputeVariable({
        renderer,
        width,
        height,
        name: 'jfaFinalize',
        fragmentShader: jfaFinalizeUnsignedFragment,
        uniforms: {
            uTexelSize: { value: texelSize, type: 'vec2<f32>' },
        },
        format: 'rgba16float',
        scaleMode: 'linear',
    });
    finalization.setDependencies([jfaComputeVar]);
    finalization.computeOnce();
    jfaComputeVar.getCurrentTexture().destroy();

    return finalization.getCurrentTexture();
}

export interface GenerateSignedSDFOptions {
    /** Input texture (seed pixels determined by alpha >= 1.0) */
    texture: Texture;
    /** Texture with shape mask (fill mask) - inside=1, outside=0 */
    fillMaskTexture: Texture;
    /** Renderer for rendering */
    renderer: WebGLRenderer;
}

/**
 * Generates Signed SDF texture from input texture and fill mask.
 *
 * Seed pixels are determined by alpha >= 1.0 in the input texture.
 *
 * Unlike regular SDF, signed SDF contains:
 * - Negative values inside the shape (distance to border with minus sign)
 * - Positive values outside the shape
 * - Zero at the border
 *
 * This is useful for various effects where you need to know whether a pixel
 * is inside or outside the shape.
 *
 * @param options - Parameters for Signed SDF generation
 * @returns Texture with Signed SDF (rgba16float, values from -1 to +1)
 */
export function generateSignedSDFTex(options: GenerateSignedSDFOptions): RenderTexture {
    const { texture, fillMaskTexture, renderer } = options;

    const width = texture.width;
    const height = texture.height;

    // Step 1: Generate unsigned SDF
    const unsignedSDF = generateSDFTex({
        texture,
        renderer,
    });
    // Step 2: Apply sign based on fill mask
    const addSign = new GPUComputeVariable({
        renderer,
        width,
        height,
        name: 'applySign',
        fragmentShader: applySignFragment,
        samplers: {
            uSDF: unsignedSDF,
            uMask: fillMaskTexture,
        },
        format: 'rgba16float',
        scaleMode: 'linear',
    });
    addSign.computeOnce();
    unsignedSDF.destroy();

    return addSign.getCurrentTexture();
}
