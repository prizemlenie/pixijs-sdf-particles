import { TEXTURE_FORMATS, WebGLRenderer } from 'pixi.js';

let colorBufferFloatSupported: boolean | null = null;

/**
 * Checks if EXT_color_buffer_float extension is supported.
 * Required for rendering to rgba32float textures.
 *
 * @param renderer - PixiJS WebGL renderer to check extension support
 */
export function supportsColorBufferFloat(renderer: WebGLRenderer): boolean {
    if (colorBufferFloatSupported !== null) {
        return colorBufferFloatSupported;
    }

    const gl = renderer.gl;
    colorBufferFloatSupported = gl.getExtension('EXT_color_buffer_float') !== null;

    return colorBufferFloatSupported;
}

/**
 * Returns the best supported float texture format for rendering.
 * Returns 'rgba32float' if EXT_color_buffer_float is supported, otherwise 'rgba16float'.
 *
 * @param renderer - PixiJS WebGL renderer to check extension support
 */
export function getFloatTextureFormat(renderer: WebGLRenderer): TEXTURE_FORMATS {
    return supportsColorBufferFloat(renderer) ? 'rgba32float' : 'rgba16float';
}
