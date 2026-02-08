/**
 * Fragment shader for rendering particles.
 *
 * Draws a radial gradient: white and bright in center, fading towards edges.
 */
const particleFragmentShader = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uColorLUT; // Color lookup table for coloring particles

in vec2 vUV;
in float vAlpha;
in float vOrbit;

out vec4 finalColor;

void main() {
    // Distance from center (UV goes from 0 to 1, center at 0.5)
    vec2 center = vUV - 0.5;
    float dist = length(center) * 2.0;  // Normalize to [0, 1]
    
    // Radial gradient with smooth falloff
    float gradient = 1.0 - smoothstep(0.0, 1.0, dist);
    
    // Final alpha considering particle transparency
    float alpha = gradient * vAlpha * 0.5;
    
    // Premultiplied alpha for correct blending
    vec4 LUTValue = texture(uColorLUT, vec2(vOrbit, 0.5));
    finalColor = vec4(alpha) * LUTValue;
}
`;

export default particleFragmentShader;
